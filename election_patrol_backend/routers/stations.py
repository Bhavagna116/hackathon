from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import database.connection as db
from routers.officers import haversine_km
from schemas.station import StationCreate, StationResponse
from utils.dependencies import get_current_officer

router = APIRouter()


def _doc_to_station_response(doc: dict[str, Any]) -> StationResponse:
    return StationResponse(
        station_id=str(doc["station_id"]),
        station_name=str(doc["station_name"]),
        latitude=float(doc["latitude"]),
        longitude=float(doc["longitude"]),
        assigned_area=str(doc["assigned_area"]),
        duty_time=str(doc["duty_time"]),
    )


@router.post("/add", response_model=StationResponse)
async def add_station(
    body: StationCreate,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> StationResponse:
    if db.stations_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    if not -90 <= body.latitude <= 90:
        raise HTTPException(status_code=400, detail="latitude must be between -90 and 90")
    if not -180 <= body.longitude <= 180:
        raise HTTPException(status_code=400, detail="longitude must be between -180 and 180")

    dup = await db.stations_collection.find_one({"station_name": body.station_name})
    if dup is not None:
        raise HTTPException(status_code=400, detail="Station already exists")

    station_id = str(uuid.uuid4())
    doc: dict[str, Any] = {
        "station_id": station_id,
        "station_name": body.station_name,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "assigned_area": body.assigned_area,
        "duty_time": body.duty_time,
    }
    await db.stations_collection.insert_one(doc)
    return _doc_to_station_response(doc)


@router.get("/all", response_model=list[StationResponse])
async def list_all_stations(
    _current: dict[str, Any] = Depends(get_current_officer),
) -> list[StationResponse]:
    if db.stations_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.stations_collection.find({}).sort("station_name", 1)
    out: list[StationResponse] = []
    async for raw in cursor:
        out.append(_doc_to_station_response(dict(raw)))
    return out


@router.get("/nearby")
async def stations_nearby(
    lat: float,
    lng: float,
    radius_km: float = Query(3.0, ge=0),
    _current: dict[str, Any] = Depends(get_current_officer),
) -> list[dict[str, Any]]:
    if db.stations_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    cursor = db.stations_collection.find({})
    results: list[dict[str, Any]] = []
    async for raw in cursor:
        d = dict(raw)
        dist = haversine_km(lat, lng, float(d["latitude"]), float(d["longitude"]))
        if dist <= radius_km:
            item = _doc_to_station_response(d).model_dump()
            item["distance_km"] = round(dist, 2)
            results.append(item)

    results.sort(key=lambda x: x["distance_km"])
    return results


@router.get("/distance")
async def station_distance(
    station_id: str,
    lat: float,
    lng: float,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, Any]:
    if db.stations_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    doc = await db.stations_collection.find_one({"station_id": station_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Station not found")

    d = dict(doc)
    dist = haversine_km(lat, lng, float(d["latitude"]), float(d["longitude"]))
    return {
        "station_id": str(d["station_id"]),
        "station_name": str(d["station_name"]),
        "distance_km": round(dist, 2),
        "station_latitude": float(d["latitude"]),
        "station_longitude": float(d["longitude"]),
    }


@router.get("/{station_id}", response_model=StationResponse)
async def get_station(
    station_id: str,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> StationResponse:
    if db.stations_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    doc = await db.stations_collection.find_one({"station_id": station_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Station not found")
    return _doc_to_station_response(dict(doc))


@router.delete("/{station_id}")
async def delete_station(
    station_id: str,
    _current: dict[str, Any] = Depends(get_current_officer),
) -> dict[str, str]:
    if db.stations_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    result = await db.stations_collection.delete_one({"station_id": station_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Station not found")

    return {"status": "ok", "message": "Station deleted"}
