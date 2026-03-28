from typing import Any

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

import database.connection as db
from database.connection import ensure_db_connected
from utils.auth_utils import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_officer(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    payload = decode_access_token(token)
    officer_id = payload.get("officer_id")
    if officer_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    await ensure_db_connected()
    if db.officers_collection is None:
        raise HTTPException(status_code=503, detail="Database not available")

    doc = await db.officers_collection.find_one({"officer_id": officer_id})
    if doc is None:
        raise HTTPException(status_code=401, detail="Officer not found")

    return dict(doc)
