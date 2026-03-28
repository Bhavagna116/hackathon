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
        "created_at": doc["created_at"],
        "message": doc.get("message"),
    }


def _free_officer_with_location_filter() -> dict[str, Any]:
    return {
        "availability_status": "free",
        "last_latitude": {"$ne": None, "$exists": True},
        "last_longitude": {"$ne": None, "$exists": True},
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


@router.post("/create")
async def create_incident(
    body: IncidentCreate,
    background_tasks: BackgroundTasks,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, Any]:
    if db.incidents_collection is None or db.officers_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    if body.incident_type not in _ALLOWED_INCIDENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="incident_type must be one of: booth_capture, violence, suspicious_activity",
        )
    if body.severity not in _ALLOWED_SEVERITY:
        raise HTTPException(
            status_code=400,
            detail="severity must be one of: low, medium, high",
        )

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

    try:
        cursor = db.officers_collection.find(_free_officer_with_location_filter())
        free_officers: list[dict[str, Any]] = []
        async for raw in cursor:
            free_officers.append(dict(raw))

        if not free_officers:
            warning = "No free officers found nearby"
        else:
            scored: list[tuple[float, dict[str, Any]]] = []
            for o in free_officers:
                d = haversine_km(
                    body.latitude,
                    body.longitude,
                    float(o["last_latitude"]),
                    float(o["last_longitude"]),
                )
                scored.append((d, o))
            scored.sort(key=lambda x: x[0])
            top3 = [o for _, o in scored[:3]]

            assigned_ids: list[str] = []
            for o in top3:
                oid = o["officer_id"]
                await db.officers_collection.update_one(
                    {"officer_id": oid},
                    {"$set": {"availability_status": "assigned"}},
                )
                assigned_ids.append(oid)
                tok = o.get("fcm_token")
                if tok:
                    fcm_tokens.append(str(tok))

            await db.incidents_collection.update_one(
                {"incident_id": incident_id},
                {"$set": {"assigned_officers": assigned_ids}},
            )

            doc["assigned_officers"] = assigned_ids
            payload = _incident_dict_for_fcm(doc)
            background_tasks.add_task(_schedule_fcm_deliveries, fcm_tokens, payload)
    except Exception:
        warning = warning or "Could not complete nearest-officer assignment or notifications"

    final = await db.incidents_collection.find_one({"incident_id": incident_id})
    if final is None:
        raise HTTPException(status_code=500, detail="Incident not found after insert")

    out = _doc_to_incident_response(dict(final)).model_dump()
    if warning:
        out["warning"] = warning
    return out


@router.post("/respond")
async def respond_incident(
    body: IncidentRespond,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, str]:
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
    if db.incidents_collection is None or db.officers_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    inc = await db.incidents_collection.find_one({"incident_id": incident_id})
    if inc is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    assigned = list(inc.get("assigned_officers") or [])
    now = datetime.utcnow()

    await db.incidents_collection.update_one(
        {"incident_id": incident_id},
        {"$set": {"status": "resolved", "resolved_at": now}},
    )

    for oid in assigned:
        await db.officers_collection.update_one(
            {"officer_id": oid},
            {"$set": {"availability_status": "free"}},
        )

    return {
        "status": "ok",
        "message": "Incident resolved",
        "resolved_at": now.isoformat(),
    }


@router.get("/active", response_model=list[IncidentResponse])
async def list_active_incidents(
    _current: dict[str, Any] = Depends(get_current_officer),
) -> list[IncidentResponse]:
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


@router.get("/all", response_model=list[IncidentResponse])
async def list_all_incidents(
    _current: dict[str, Any] = Depends(get_current_officer),
) -> list[IncidentResponse]:
    if db.incidents_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.incidents_collection.find({}).sort("created_at", -1)
    out: list[IncidentResponse] = []
    async for raw in cursor:
        out.append(_doc_to_incident_response(dict(raw)))
    return out


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: str,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> IncidentResponse:
    if db.incidents_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    doc = await db.incidents_collection.find_one({"incident_id": incident_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return _doc_to_incident_response(dict(doc))
