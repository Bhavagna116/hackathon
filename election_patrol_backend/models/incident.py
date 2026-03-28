from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class Incident(BaseModel):
    """Incident document / domain model."""

    model_config = ConfigDict(from_attributes=True)

    incident_id: str
    incident_type: str = Field(..., description="booth_capture / violence / suspicious_activity")
    latitude: float
    longitude: float
    severity: str = Field(..., description="low / medium / high")
    status: str = Field(default="pending", description="pending / responding / resolved")
    reported_by: str
    assigned_officers: List[str] = Field(default_factory=list)
    created_at: datetime
    resolved_at: Optional[datetime] = None
