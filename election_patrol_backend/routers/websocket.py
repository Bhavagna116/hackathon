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

    if db.officers_collection is not None:
        cursor = db.officers_collection.find(
            {
                "last_latitude": {"$ne": None, "$exists": True},
                "last_longitude": {"$ne": None, "$exists": True},
            }
        )
        async for raw in cursor:
            officers.append(_serialize_doc(dict(raw)))

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


@router.websocket("/officer/{officer_id}")
async def officer_location_ws(
    websocket: WebSocket,
    officer_id: str,
    token: str = Query(...),
) -> None:
    payload = _auth_ws_payload(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return
    token_oid = payload.get("officer_id")
    if token_oid is None or str(token_oid) != str(officer_id):
        await websocket.close(code=1008, reason="officer_id mismatch")
        return

    if db.officers_collection is None:
        await websocket.close(code=1011, reason="Database unavailable")
        return

    await manager.connect_officer(officer_id, websocket)
    await manager.broadcast_to_dashboards(
        {
            "event": "officer_connected",
            "officer_id": officer_id,
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
            await db.officers_collection.update_one(
                {"officer_id": officer_id},
                {"$set": {"last_latitude": lat, "last_longitude": lng, "last_updated": now}},
            )

            doc = await db.officers_collection.find_one({"officer_id": officer_id})
            if doc is None:
                continue
            d = dict(doc)

            ts = d.get("last_updated")
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else _utc_iso()

            await manager.broadcast_to_dashboards(
                {
                    "event": "location_update",
                    "officer_id": officer_id,
                    "username": d.get("username", ""),
                    "rank": d.get("rank", ""),
                    "latitude": lat,
                    "longitude": lng,
                    "availability_status": d.get("availability_status", "free"),
                    "timestamp": ts_str,
                }
            )
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_officer(officer_id)
        await manager.broadcast_to_dashboards(
            {
                "event": "officer_disconnected",
                "officer_id": officer_id,
                "timestamp": _utc_iso(),
            }
        )


@router.websocket("/dashboard")
async def dashboard_ws(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    payload = _auth_ws_payload(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

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
