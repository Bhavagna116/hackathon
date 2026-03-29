from typing import Any

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

import database.connection as db
from database.connection import ensure_db_connected
from utils.auth_utils import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_officer(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    payload = decode_access_token(token)
    unique_id = payload.get("unique_id")
    if unique_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("rank") == "Admin":
        return payload

    await ensure_db_connected()
    
    doc = None
    if db.officers_auth_collection is not None:
        doc = await db.officers_auth_collection.find_one({"unique_id": unique_id})
    
    if doc is None and db.admins_collection is not None:
        doc = await db.admins_collection.find_one({"unique_id": unique_id})

    if doc is None:
        raise HTTPException(status_code=401, detail="Officer or Admin not found")

    return dict(doc)
