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


@router.post("/create")
async def create_incident(
    body: IncidentCreate,
    background_tasks: BackgroundTasks,
    # Admin or authorized officer check
    _current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, Any]:
    await db.ensure_db_connected()
    if db.incidents_collection is None or db.officer_tracking_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    if body.incident_type not in _ALLOWED_INCIDENT_TYPES:
        # Fallback for dynamic types from dashboard
        pass

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

    await db.incidents_collection.insert_one(doc)

    warning: str | None = None
    fcm_tokens: list[str] = []
    nearby_officers: list[dict[str, Any]] = []
    assigned_details: list[dict[str, Any]] = []

    try:
        # Join tracking and auth to find best candidates
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
            dist = haversine_km(body.latitude, body.longitude, float(raw["last_latitude"]), float(raw["last_longitude"]))
            candidates.append({
                "unique_id": raw["unique_id"],
                "fcm_token": raw["auth"].get("fcm_token"),
                "dist": dist,
                "username": raw["auth"].get("username") or f"Officer {raw['unique_id'][:6]}",
                "rank": raw["auth"].get("rank") or "Patrol",
                "email": raw["auth"].get("email"),
                "mobile_number": raw["auth"].get("mobile_number"),

                "availability_status": raw.get("availability_status", "free"),
            })
        
        print(f"DEBUG: Found {len(candidates)} candidates.")



        if not candidates:
            warning = "No free officers currently online in the area."
        else:
            candidates.sort(key=lambda x: x["dist"])
            nearby_officers = [
                {
                    "unique_id": o["unique_id"],
                    "username": o["username"],
                    "rank": o["rank"],
                    "mobile_number": o["mobile_number"],
                    "availability_status": o["availability_status"],
                    "distance_km": round(o["dist"], 2),
                }
                for o in candidates[:5]
            ]
            top_officers = candidates[:2] # Assign 2 officers
            assigned_ids = [o["unique_id"] for o in top_officers]
            assigned_details = [
                {
                    "unique_id": o["unique_id"],
                    "username": o["username"],
                    "rank": o["rank"],
                    "mobile_number": o["mobile_number"],
                    "availability_status": "assigned",
                    "distance_km": round(o["dist"], 2),
                }
                for o in top_officers
            ]

            for o in top_officers:
                uid = o["unique_id"]
                # Mark as assigned so they don't get double-booked
                await db.officer_tracking_collection.update_one({"unique_id": uid}, {"$set": {"availability_status": "assigned"}})
                if db.officers_auth_collection is not None:
                    await db.officers_auth_collection.update_one({"unique_id": uid}, {"$set": {"availability_status": "assigned"}})
                
                if o.get("fcm_token"):
                    fcm_tokens.append(o["fcm_token"])

            await db.incidents_collection.update_one(
                {"incident_id": incident_id},
                {"$set": {"assigned_officers": assigned_ids}}
            )

            doc["assigned_officers"] = assigned_ids
            payload = _incident_dict_for_fcm(doc)
            
            # Email nearby officers too
            emails = [o["email"] for o in candidates[:5] if o.get("email")]
            print(f"DEBUG: Emails to notify ({len(emails)}): {emails}")
            
            background_tasks.add_task(_schedule_fcm_deliveries, fcm_tokens, payload)
            if emails:
                background_tasks.add_task(send_alert_email, emails, body.incident_type, body.latitude, body.longitude, body.severity, body.reported_by)
            else:
                print("DEBUG: No officer emails found. Skipping email task.")


            
    except Exception as e:
        print(f"DEBUG: Incident optimization failure: {e}")
        warning = "Incident recorded but automatic assignment failed."

    final = await db.incidents_collection.find_one({"incident_id": incident_id})
    out = _doc_to_incident_response(dict(final or doc)).model_dump()
    out["nearby_officers"] = nearby_officers
    out["assigned_officer_details"] = assigned_details
    out["emailed_to"] = [o["email"] for o in candidates[:5] if o.get("email")]
    if warning:
        out["warning"] = warning
    return out



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
