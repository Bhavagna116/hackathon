from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class IncidentCreate(BaseModel):
    incident_type: str
    latitude: float
    longitude: float
    severity: str
    reported_by: str


class IncidentResponse(BaseModel):
    incident_id: str
    incident_type: str
    latitude: float
    longitude: float
    severity: str
    status: str
    reported_by: str
    assigned_officers: List[str]
    created_at: datetime
    resolved_at: Optional[datetime] = None


class IncidentRespond(BaseModel):
    incident_id: str
    officer_id: str
