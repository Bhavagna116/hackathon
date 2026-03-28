from pydantic import BaseModel, ConfigDict, Field


class Station(BaseModel):
    """Polling station document / domain model."""

    model_config = ConfigDict(from_attributes=True)

    station_id: str
    station_name: str
    latitude: float
    longitude: float
    assigned_area: str
    duty_time: str
