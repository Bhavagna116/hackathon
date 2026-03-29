from __future__ import annotations

import json
import random
import string
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

import database.connection as db
from database.connection import ensure_db_connected
from schemas.officer import OfficerLogin, OfficerRegister, OfficerResponse, OfficerPasswordReset
from utils.auth_utils import create_access_token, hash_password, verify_password
from utils.dependencies import get_current_officer

router = APIRouter()


def _default_email(username: str) -> str:
    safe = "".join(c for c in username if c.isalnum() or c in "._-") or "user"
    return f"{safe}@example.com"


def _doc_to_officer_response(doc: dict[str, Any]) -> OfficerResponse:
    return OfficerResponse(
        unique_id=doc["unique_id"],
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


@router.post("/register", response_model=OfficerResponse)
async def register(body: OfficerRegister) -> OfficerResponse:
    await ensure_db_connected()
    if db.officers_auth_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    existing_username = await db.officers_auth_collection.find_one({"username": body.username})
    if existing_username is not None:
        raise HTTPException(status_code=400, detail="Username already taken")

    existing_email = await db.officers_auth_collection.find_one({"email": body.email})
    if existing_email is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    generated_unique_id = ''.join(random.choices(string.ascii_letters + string.digits, k=11))

    created_at = datetime.utcnow()

    doc: dict[str, Any] = {
        "unique_id": generated_unique_id,
        "username": body.username,
        "email": body.email,
        "rank": "Officer",
        "mobile_number": body.mobile_number,
        "full_name": body.name,
        "password_hash": hash_password(body.password),
        "fcm_token": None,
        "created_at": created_at,
    }

    await db.officers_auth_collection.insert_one(doc)
    return _doc_to_officer_response(doc)


@router.post("/login")
async def login(body: OfficerLogin) -> dict[str, Any]:
    await ensure_db_connected()
    if db.officers_auth_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    officer = await db.officers_auth_collection.find_one({
        "$or": [
            {"username": body.username},
            {"email": body.username}
        ]
    })
    if officer is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, officer["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(
        {
            "unique_id": officer["unique_id"],
            "username": officer["username"],
            "rank": officer["rank"],
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "officer": _doc_to_officer_response(dict(officer)),
    }


@router.get("/me", response_model=OfficerResponse)
async def me(current: dict = Depends(get_current_officer)) -> OfficerResponse:
    return _doc_to_officer_response(current)

@router.post("/reset-password")
async def reset_password(body: OfficerPasswordReset) -> dict[str, str]:
    await ensure_db_connected()
    if db.officers_auth_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    officer = await db.officers_auth_collection.find_one({
        "$or": [
            {"username": body.identifier},
            {"email": body.identifier}
        ]
    })
    
    if officer is None:
        raise HTTPException(status_code=404, detail="User not found")
        
    new_hash = hash_password(body.new_password)
    await db.officers_auth_collection.update_one(
        {"_id": officer["_id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password updated successfully"}
