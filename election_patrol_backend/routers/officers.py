from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import database.connection as db
from schemas.officer import (
    FCMTokenUpdate,
    LocationUpdate,
    OfficerResponse,
    StatusUpdate,
)
from utils.dependencies import get_current_officer

router = APIRouter()

_ALLOWED_STATUS = frozenset({"free", "busy", "assigned"})


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _doc_to_officer_response(doc: dict[str, Any]) -> OfficerResponse:
    return OfficerResponse(
        officer_id=doc["officer_id"],
        username=doc["username"],
        email=doc["email"],
        rank=doc["rank"],
        mobile_number=doc["mobile_number"],
        full_name=doc.get("full_name"),
        fcm_token=doc.get("fcm_token"),
        availability_status=doc.get("availability_status", "free"),
        last_latitude=doc.get("last_latitude"),
        last_longitude=doc.get("last_longitude"),
        last_updated=doc.get("last_updated"),
        created_at=doc["created_at"],
    )


def _location_filter() -> dict[str, Any]:
    return {
        "last_latitude": {"$ne": None, "$exists": True},
        "last_longitude": {"$ne": None, "$exists": True},
    }


def _officer_list_fields_from_doc(doc: dict[str, Any]) -> dict[str, Any]:
    """Route 4 shape — excludes password_hash and fcm_token by construction."""
    return {
        "officer_id": doc["officer_id"],
        "username": doc["username"],
        "rank": doc["rank"],
        "availability_status": doc.get("availability_status", "free"),
        "last_latitude": doc["last_latitude"],
        "last_longitude": doc["last_longitude"],
        "last_updated": doc.get("last_updated"),
    }


@router.post("/location")
async def update_location(
    body: LocationUpdate,
    current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, str]:
    if db.officers_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    if not -90 <= body.latitude <= 90:
        raise HTTPException(status_code=400, detail="latitude must be between -90 and 90")
    if not -180 <= body.longitude <= 180:
        raise HTTPException(status_code=400, detail="longitude must be between -180 and 180")

    officer_id = current["officer_id"]
    now = datetime.utcnow()
    result = await db.officers_collection.update_one(
        {"officer_id": officer_id},
        {
            "$set": {
                "last_latitude": body.latitude,
                "last_longitude": body.longitude,
                "last_updated": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Officer not found")

    return {"status": "ok", "message": "Location updated"}


@router.post("/status")
async def update_status(
    body: StatusUpdate,
    current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, str]:
    if db.officers_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    if body.status not in _ALLOWED_STATUS:
        raise HTTPException(
            status_code=400,
            detail='status must be one of: "free", "busy", "assigned"',
        )

    officer_id = current["officer_id"]
    result = await db.officers_collection.update_one(
        {"officer_id": officer_id},
        {"$set": {"availability_status": body.status}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Officer not found")

    return {
        "status": "ok",
        "message": "Status updated",
        "availability_status": body.status,
    }


@router.post("/fcm-token")
async def update_fcm_token(
    body: FCMTokenUpdate,
    current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, str]:
    if db.officers_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    officer_id = current["officer_id"]
    result = await db.officers_collection.update_one(
        {"officer_id": officer_id},
        {"$set": {"fcm_token": body.fcm_token}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Officer not found")

    return {"status": "ok", "message": "FCM token registered"}


@router.get("/all")
async def list_officers_with_location(
    _current: dict[str, Any] = Depends(get_current_officer),
) -> list[dict[str, Any]]:
    if db.officers_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.officers_collection.find(_location_filter())
    out: list[dict[str, Any]] = []
    async for doc in cursor:
        d = dict(doc)
        out.append(_officer_list_fields_from_doc(d))
    return out


@router.get("/nearby")
async def officers_nearby(
    lat: float,
    lng: float,
    radius_km: float = Query(5.0, ge=0),
    _current: dict[str, Any] = Depends(get_current_officer),
) -> list[dict[str, Any]]:
    if db.officers_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.officers_collection.find(_location_filter())
    results: list[dict[str, Any]] = []
    async for doc in cursor:
        d = dict(doc)
        olat = d["last_latitude"]
        olng = d["last_longitude"]
        dist = haversine_km(lat, lng, float(olat), float(olng))
        if dist <= radius_km:
            item = _officer_list_fields_from_doc(d)
            item["distance_km"] = round(dist, 2)
            results.append(item)

    results.sort(key=lambda x: x["distance_km"])
    return results


@router.get("/me", response_model=OfficerResponse)
async def me(current: dict[str, Any] = Depends(get_current_officer)) -> OfficerResponse:
    return _doc_to_officer_response(current)
