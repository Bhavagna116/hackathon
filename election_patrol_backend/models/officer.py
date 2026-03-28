from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Officer(BaseModel):
    """Officer document / domain model."""

    model_config = ConfigDict(from_attributes=True)

    officer_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Auto-generated; never supplied by clients.",
    )
    username: str
    email: EmailStr
    rank: str = Field(..., description="Constable / SI / Inspector")
    mobile_number: str
    password_hash: str
    fcm_token: Optional[str] = None
    availability_status: str = Field(default="free", description="free / busy / assigned")
    last_latitude: Optional[float] = None
    last_longitude: Optional[float] = None
    last_updated: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_utcnow)
