from pydantic import BaseModel, ConfigDict, Field


class RouteCreate(BaseModel):
    user_id: str
    origin_name: str = Field(min_length=1, max_length=200)
    destination_name: str = Field(min_length=1, max_length=200)
    distance_km: float = Field(gt=0)
    duration_minutes: float = Field(gt=0)
    safety_score: float | None = Field(default=None, ge=0, le=5)
    risk_score: float | None = Field(default=None, ge=0, le=1)
    route_type: str = Field(default="balanced", max_length=30)
    provider: str = Field(default="mapbox", max_length=50)
    geometry: str | None = None
    is_saved: bool = False


class RouteRead(RouteCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str