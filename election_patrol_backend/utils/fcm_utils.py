from __future__ import annotations

import asyncio
import os
from typing import Any

import firebase_admin
from firebase_admin import credentials, messaging


def _ensure_firebase_app() -> None:
    try:
        firebase_admin.get_app()
    except ValueError:
        path = os.environ.get("FIREBASE_CREDENTIALS_PATH")
        if not path:
            raise RuntimeError("FIREBASE_CREDENTIALS_PATH is not set")
        cred = credentials.Certificate(path)
        firebase_admin.initialize_app(cred)


def _build_data_payload(incident: dict[str, Any]) -> dict[str, str]:
    created = incident.get("created_at")
    if created is not None and hasattr(created, "isoformat"):
        ts = created.isoformat()
    else:
        ts = str(created or "")
    message = incident.get("message")
    if message is None or message == "":
        message = f"Incident: {incident.get('incident_type', '')} ({incident.get('severity', '')})"
    return {
        "incident_id": str(incident.get("incident_id", "")),
        "incident_type": str(incident.get("incident_type", "")),
        "latitude": str(incident.get("latitude", "")),
        "longitude": str(incident.get("longitude", "")),
        "severity": str(incident.get("severity", "")),
        "timestamp": ts,
        "message": str(message),
    }


def _send_sync(fcm_token: str, data: dict[str, str]) -> bool:
    # High-priority alert with sound
    notification = messaging.Notification(
        title="🚨 EMERGENCY ALERT",
        body=data.get("message", "High-priority incident assigned!"),
    )
    
    # Priority 'high' + sound='default' + channel_id ensures 'Heads-up' notification with sound
    android_config = messaging.AndroidConfig(
        priority='high',
        notification=messaging.AndroidNotification(
            sound='default',
            channel_id='emergency_alerts',
            click_action='FLUTTER_NOTIFICATION_CLICK',
            notification_priority='PRIORITY_MAX',
            vibrate_timings_millis=[0, 500, 200, 500],
            default_sound=True,
            default_vibrate_timings=True,
        ),
    )

    # For iOS screens to light up and play sound
    apns_config = messaging.APNSConfig(
        payload=messaging.APNSPayload(
            aps=messaging.Aps(
                sound='default',
                badge=1,
                content_available=True,
            ),
        ),
    )

    message = messaging.Message(
        notification=notification,
        data=data,
        token=fcm_token,
        android=android_config,
        apns=apns_config
    )
    messaging.send(message)
    return True



async def send_incident_alert(fcm_token: str, incident: dict[str, Any]) -> bool:
    try:
        _ensure_firebase_app()
        data = _build_data_payload(incident)
        return await asyncio.to_thread(_send_sync, fcm_token, data)
    except Exception:
        return False


async def send_bulk_alerts(officer_fcm_tokens: list, incident: dict[str, Any]) -> dict[str, int]:
    sent = 0
    failed = 0
    for token in officer_fcm_tokens or []:
        if not token:
            failed += 1
            continue
        if await send_incident_alert(str(token), incident):
            sent += 1
        else:
            failed += 1
    return {"sent": sent, "failed": failed}
