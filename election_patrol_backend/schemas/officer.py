from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class OfficerRegister(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    password: str = Field(..., min_length=6)
    rank: str = "Officer"
    mobile_number: str = "0000000000"
    full_name: Optional[str] = None


class OfficerLogin(BaseModel):
    username: str
    password: str


class OfficerResponse(BaseModel):
    officer_id: str
    username: str
    email: EmailStr
    rank: str
    mobile_number: str
    full_name: Optional[str] = None
    fcm_token: Optional[str] = None
    availability_status: str = "free"
    last_latitude: Optional[float] = None
    last_longitude: Optional[float] = None
    last_updated: Optional[datetime] = None
    created_at: datetime


class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    timestamp: datetime


class StatusUpdate(BaseModel):
    status: str


class FCMTokenUpdate(BaseModel):
    fcm_token: str
