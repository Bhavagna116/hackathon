from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

import database.connection as db
from routers.officers import haversine_km
from schemas.incident import IncidentCreate, IncidentRespond, IncidentResponse
from utils.dependencies import get_current_officer
from utils.fcm_utils import send_incident_alert
from utils.mail_utils import send_alert_email


router = APIRouter()

_ALLOWED_INCIDENT_TYPES = frozenset({"booth_capture", "violence", "suspicious_activity"})
_ALLOWED_SEVERITY = frozenset({"low", "medium", "high"})


def _doc_to_incident_response(doc: dict[str, Any]) -> IncidentResponse:
    return IncidentResponse(
        incident_id=str(doc["incident_id"]),
        incident_type=str(doc["incident_type"]),
        latitude=float(doc["latitude"]),
        longitude=float(doc["longitude"]),
        severity=str(doc["severity"]),
        status=str(doc.get("status", "pending")),
        reported_by=str(doc["reported_by"]),
        assigned_officers=list(doc.get("assigned_officers") or []),
        created_at=doc["created_at"],
        resolved_at=doc.get("resolved_at"),
    )


def _incident_dict_for_fcm(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "incident_id": doc["incident_id"],
        "incident_type": doc["incident_type"],
        "latitude": doc["latitude"],
        "longitude": doc["longitude"],
        "severity": doc["severity"],
        "created_at": doc["created_at"].isoformat() if hasattr(doc["created_at"], "isoformat") else str(doc["created_at"]),
        "message": doc.get("message") or f"Emergency: {doc['incident_type']}!",
    }


async def _schedule_fcm_deliveries(tokens: list[str], incident_payload: dict[str, Any]) -> None:
    """Run FCM sends without affecting caller; swallow everything."""
    coros = [send_incident_alert(t, incident_payload) for t in tokens if t]
    if not coros:
        return
    try:
        await asyncio.gather(*coros, return_exceptions=True)
    except Exception:
        pass


@router.get("/all", response_model=list[IncidentResponse])
async def list_all_incidents() -> list[IncidentResponse]:
    await db.ensure_db_connected()
    if db.incidents_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.incidents_collection.find({}).sort("created_at", -1)
    out: list[IncidentResponse] = []
    async for raw in cursor:
        out.append(_doc_to_incident_response(dict(raw)))
    return out


async def _assign_and_dispatch_incident(incident_id: str, incident_doc: dict[str, Any], body_data: Any):
    """Background task to find officers and dispatch alerts without blocking API."""
    try:
        await db.ensure_db_connected()
        if db.officer_tracking_collection is None:
            return

        pipeline = [
            {
                "$match": {
                    "availability_status": "free",
                    "last_latitude": {"$ne": None},
                    "last_longitude": {"$ne": None}
                }
            },
            {
                "$lookup": {
                    "from": "officers_auth",
                    "localField": "unique_id",
                    "foreignField": "unique_id",
                    "as": "auth"
                }
            },
            {"$unwind": "$auth"}
        ]
        
        cursor = db.officer_tracking_collection.aggregate(pipeline)
        candidates = []
        async for raw in cursor:
            dist = haversine_km(body_data.latitude, body_data.longitude, float(raw["last_latitude"]), float(raw["last_longitude"]))
            candidates.append({
                "unique_id": raw["unique_id"],
                "fcm_token": raw["auth"].get("fcm_token"),
                "dist": dist,
                "username": raw["auth"].get("username") or f"Officer {raw['unique_id'][:6]}",
                "email": raw["auth"].get("email"),
            })

        if not candidates:
            print(f"DEBUG: No free officers for incident {incident_id}")
            return

        candidates.sort(key=lambda x: x["dist"])
        top_officers = candidates[:2]
        assigned_ids = [o["unique_id"] for o in top_officers]
        
        # Mark as assigned
        for o in top_officers:
            uid = o["unique_id"]
            await db.officer_tracking_collection.update_one({"unique_id": uid}, {"$set": {"availability_status": "assigned"}})
            if db.officers_auth_collection is not None:
                await db.officers_auth_collection.update_one({"unique_id": uid}, {"$set": {"availability_status": "assigned"}})
        
        # Update incident record
        await db.incidents_collection.update_one(
            {"incident_id": incident_id},
            {"$set": {"assigned_officers": assigned_ids}}
        )

        # Build payload
        incident_doc["assigned_officers"] = assigned_ids
        payload = _incident_dict_for_fcm(incident_doc)
        
        # Dispatch FCM
        fcm_tokens = [o["fcm_token"] for o in top_officers if o.get("fcm_token")]
        if fcm_tokens:
            await _schedule_fcm_deliveries(fcm_tokens, payload)

        # Dispatch Emails
        emails = [o["email"] for o in candidates[:5] if o.get("email")]
        if emails:
            await send_alert_email(
                emails, 
                body_data.incident_type, 
                body_data.latitude, 
                body_data.longitude, 
                body_data.severity, 
                body_data.reported_by
            )

        # TRIGGER SOCKET DISPATCH (REAL-TIME ALERT)
        import os
        import httpx
        SOCKET_URL = os.getenv("SOCKET_SERVER_URL", "http://localhost:3000")
        async with httpx.AsyncClient() as client:
            for uid in assigned_ids:
                try:
                    await client.post(f"{SOCKET_URL}/dispatch-alert", json={
                        "targetUserId": uid,
                        "incident": payload
                    })
                    print(f"DEBUG: Socket alert dispatched to {uid}")
                except Exception as e:
                    print(f"DEBUG: Socket dispatch error for {uid}: {e}")

    except Exception as e:
        print(f"DEBUG: Background dispatch failure: {e}")


@router.post("/create")
async def create_incident(
    body: IncidentCreate,
    background_tasks: BackgroundTasks,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, Any]:
    await db.ensure_db_connected()
    if db.incidents_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    incident_id = str(uuid.uuid4())
    created_at = datetime.utcnow()
    
    doc: dict[str, Any] = {
        "incident_id": incident_id,
        "incident_type": body.incident_type,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "severity": body.severity,
        "status": "pending",
        "reported_by": body.reported_by,
        "assigned_officers": [],
        "created_at": created_at,
        "resolved_at": None,
    }

    # 1. Insert into DB immediately (Fast)
    await db.incidents_collection.insert_one(doc)

    # 2. Assign and Dispatch in Background (Prevents dashboard hang)
    background_tasks.add_task(_assign_and_dispatch_incident, incident_id, doc, body)

    # 3. Return response immediately
    return _doc_to_incident_response(doc).model_dump()


@router.post("/respond")
async def respond_incident(
    body: IncidentRespond,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, str]:
    await db.ensure_db_connected()
    if db.incidents_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    result = await db.incidents_collection.update_one(
        {"incident_id": body.incident_id},
        {"$set": {"status": "responding"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {"status": "ok", "message": "Response acknowledged"}


@router.post("/resolve/{incident_id}")
async def resolve_incident(
    incident_id: str,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, str]:
    await db.ensure_db_connected()
    if db.incidents_collection is None or db.officer_tracking_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    inc = await db.incidents_collection.find_one({"incident_id": incident_id})
    if inc is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    assigned_uids = list(inc.get("assigned_officers") or [])
    now = datetime.utcnow()

    await db.incidents_collection.update_one(
        {"incident_id": incident_id},
        {"$set": {"status": "resolved", "resolved_at": now}},
    )

    # Release all assigned officers
    for uid in assigned_uids:
        await db.officer_tracking_collection.update_one({"unique_id": uid}, {"$set": {"availability_status": "free"}})
        if db.officers_auth_collection is not None:
            await db.officers_auth_collection.update_one({"unique_id": uid}, {"$set": {"availability_status": "free"}})

    return {
        "status": "ok",
        "message": "Incident resolved. Officers are now free.",
        "resolved_at": now.isoformat(),
    }


@router.get("/active", response_model=list[IncidentResponse])
async def list_active_incidents() -> list[IncidentResponse]:
    await db.ensure_db_connected()
    if db.incidents_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = (
        db.incidents_collection.find({"status": {"$in": ["pending", "responding"]}})
        .sort("created_at", -1)
    )
    out: list[IncidentResponse] = []
    async for raw in cursor:
        out.append(_doc_to_incident_response(dict(raw)))
    return out


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: str,
) -> IncidentResponse:
    await db.ensure_db_connected()
    if db.incidents_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    doc = await db.incidents_collection.find_one({"incident_id": incident_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return _doc_to_incident_response(dict(doc))
