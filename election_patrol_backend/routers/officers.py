from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import database.connection as db
from schemas.officer import (
    FCMTokenUpdate,
    OfficerResponse,
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
    tracking = doc.get("tracking", {})
    return OfficerResponse(
        unique_id=doc["unique_id"],
        username=doc["username"],
        email=doc["email"],
        rank=doc["rank"],
        mobile_number=doc["mobile_number"],
        full_name=doc.get("full_name"),
        fcm_token=doc.get("fcm_token"),
        availability_status=tracking.get("availability_status", "free"),
        last_latitude=tracking.get("last_latitude"),
        last_longitude=tracking.get("last_longitude"),
        last_updated=tracking.get("last_updated"),
        created_at=doc["created_at"],
    )

def _get_location_pipeline():
    return [
        {
            "$match": {
                "last_latitude": {"$ne": None, "$exists": True},
                "last_longitude": {"$ne": None, "$exists": True}
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
        {
            "$unwind": {
                "path": "$auth",
                "preserveNullAndEmptyArrays": True
            }
        }
    ]


def _officer_list_fields_from_doc(doc: dict[str, Any]) -> dict[str, Any]:
    # Doc is now primarily from officer_tracking, with auth fields potentially in 'auth'
    auth = doc.get("auth") or {}
    return {
        "unique_id": doc["unique_id"],
        "username": auth.get("username") or f"Officer {doc['unique_id'][:6]}",
        "rank": auth.get("rank") or "Patrol",
        "availability_status": doc.get("availability_status", "free"),
        "last_latitude": doc.get("last_latitude"),
        "last_longitude": doc.get("last_longitude"),
        "last_updated": doc.get("last_updated"),
        "mobile_number": auth.get("mobile_number"),
    }


@router.post("/fcm-token")
async def update_fcm_token(
    body: FCMTokenUpdate,
    current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, str]:
    if db.officers_auth_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    unique_id = current["unique_id"]
    result = await db.officers_auth_collection.update_one(
        {"unique_id": unique_id},
        {"$set": {"fcm_token": body.fcm_token}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Officer not found")

    return {"status": "ok", "message": "FCM token registered"}


@router.get("/all")
async def list_officers_with_location() -> list[dict[str, Any]]:
    if db.officer_tracking_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.officer_tracking_collection.aggregate(_get_location_pipeline())
    out: list[dict[str, Any]] = []
    async for doc in cursor:
        out.append(_officer_list_fields_from_doc(doc))
    return out


@router.get("/nearby")
async def officers_nearby(
    lat: float,
    lng: float,
    radius_km: float = Query(5.0, ge=0),
) -> list[dict[str, Any]]:
    if db.officer_tracking_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.officer_tracking_collection.aggregate(_get_location_pipeline())
    results: list[dict[str, Any]] = []
    async for doc in cursor:
        olat = doc.get("last_latitude")
        olng = doc.get("last_longitude")
        if olat is None or olng is None:
            continue
        dist = haversine_km(lat, lng, float(olat), float(olng))
        if dist <= radius_km:
            item = _officer_list_fields_from_doc(doc)
            item["distance_km"] = round(dist, 2)
            results.append(item)

    results.sort(key=lambda x: x["distance_km"])
    return results


@router.get("/me", response_model=OfficerResponse)
async def me(current: dict[str, Any] = Depends(get_current_officer)) -> OfficerResponse:
    return _doc_to_officer_response(current)
