from pydantic import BaseModel


class StationCreate(BaseModel):
    """Fields for adding a station; station_id is always generated server-side."""

    station_name: str
    latitude: float
    longitude: float
    assigned_area: str
    duty_time: str


class StationResponse(BaseModel):
    station_id: str
    station_name: str
    latitude: float
    longitude: float
    assigned_area: str
    duty_time: str
