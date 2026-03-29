from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

import database.connection as db
from utils.auth_utils import decode_access_token
from utils.connection_manager import manager

router = APIRouter()


def _utc_iso() -> str:
    return datetime.utcnow().isoformat()


def _auth_ws_payload(token: str) -> dict[str, Any] | None:
    try:
        return decode_access_token(token)
    except HTTPException:
        return None


def _serialize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    out = dict(doc)
    out.pop("_id", None)
    out.pop("password_hash", None)
    for key in list(out.keys()):
        val = out[key]
        if hasattr(val, "isoformat"):
            out[key] = val.isoformat()
    return out


async def _build_initial_snapshot() -> dict[str, Any]:
    officers: list[dict[str, Any]] = []
    incidents: list[dict[str, Any]] = []

    if db.officer_tracking_collection is not None:
        cursor = db.officer_tracking_collection.aggregate([
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
        ])
        async for doc in cursor:
            auth = doc.get("auth") or {}
            item = {
                "unique_id": doc["unique_id"],
                "username": auth.get("username") or f"Officer {doc['unique_id'][:6]}",
                "rank": auth.get("rank") or "Patrol",
                "availability_status": doc.get("availability_status", "free"),
                "last_latitude": doc["last_latitude"],
                "last_longitude": doc["last_longitude"],
                "last_updated": doc.get("last_updated"),
                "mobile_number": auth.get("mobile_number"),
            }
            officers.append(_serialize_doc(item))

    if db.incidents_collection is not None:
        cursor = db.incidents_collection.find({"status": {"$in": ["pending", "responding"]}})
        async for raw in cursor:
            incidents.append(_serialize_doc(dict(raw)))

    return {
        "event": "initial_snapshot",
        "officers": officers,
        "active_incidents": incidents,
        "connected_officer_count": manager.get_active_officer_count(),
        "timestamp": _utc_iso(),
    }


@router.websocket("/officer/{unique_id}")
async def officer_location_ws(
    websocket: WebSocket,
    unique_id: str,
    token: str = Query(...),
) -> None:
    payload = _auth_ws_payload(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return
    token_oid = payload.get("unique_id")
    if token_oid is None or str(token_oid) != str(unique_id):
        await websocket.close(code=1008, reason="unique_id mismatch")
        return

    if db.officers_auth_collection is None:
        await websocket.close(code=1011, reason="Database unavailable")
        return

    await manager.connect_officer(unique_id, websocket)
    await manager.broadcast_to_dashboards(
        {
            "event": "officer_connected",
            "unique_id": unique_id,
            "timestamp": _utc_iso(),
        }
    )

    try:
        while True:
            try:
                raw = await websocket.receive_text()
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            except Exception:
                continue

            if not isinstance(data, dict):
                continue
            if data.get("type") != "location_update":
                continue
            try:
                lat = float(data["latitude"])
                lng = float(data["longitude"])
            except (KeyError, TypeError, ValueError):
                continue

            if not -90 <= lat <= 90 or not -180 <= lng <= 180:
                continue

            now = datetime.utcnow()
            await db.officer_tracking_collection.update_one(
                {"unique_id": unique_id},
                {"$set": {"last_latitude": lat, "last_longitude": lng, "last_updated": now}},
                upsert=True
            )

            doc = await db.officers_auth_collection.find_one({"unique_id": unique_id})
            if doc is None:
                continue
            d = dict(doc)
            
            tracking_doc = await db.officer_tracking_collection.find_one({"unique_id": unique_id})
            ts = tracking_doc.get("last_updated") if tracking_doc else now

            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else _utc_iso()

            await manager.broadcast_to_dashboards(
                {
                    "event": "location_update",
                    "unique_id": unique_id,
                    "username": d.get("username", ""),
                    "rank": d.get("rank", ""),
                    "latitude": lat,
                    "longitude": lng,
                    "availability_status": tracking_doc.get("availability_status", "free") if tracking_doc else "free",
                    "timestamp": ts_str,
                }
            )
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_officer(unique_id)
        await manager.broadcast_to_dashboards(
            {
                "event": "officer_disconnected",
                "unique_id": unique_id,
                "timestamp": _utc_iso(),
            }
        )


@router.websocket("/dashboard")
async def dashboard_ws(
    websocket: WebSocket
) -> None:

    await manager.connect_dashboard(websocket)

    snapshot = await _build_initial_snapshot()
    try:
        await websocket.send_json(snapshot)
    except Exception:
        manager.disconnect_dashboard(websocket)
        return

    try:
        while True:
            try:
                raw = await websocket.receive_text()
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            except Exception:
                continue

            if isinstance(data, dict) and data.get("type") == "ping":
                try:
                    await websocket.send_json({"type": "pong"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_dashboard(websocket)


@router.get("/status")
async def websocket_status() -> dict[str, Any]:
    return {
        "active_officers": manager.get_active_officer_count(),
        "connected_officer_ids": manager.get_connected_officer_ids(),
        "dashboard_connections": len(manager.dashboard_connections),
    }
