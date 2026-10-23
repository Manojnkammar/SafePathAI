from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    email: str = Field(min_length=1, max_length=255)  # the app also accepts a phone number here
    display_name: str | None = None
    phone_number: str | None = None
    auth_provider: str = "mobile"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str | None
    phone_number: str | None
    auth_provider: str
    created_at: datetime


class SavedRouteCreate(BaseModel):
    user_id: str
    origin_name: str
    destination_name: str
    distance_km: float = 0
    duration_minutes: float = 0
    safety_score: float = 0
    route_type: str = "fastest"
    provider: str = "safepath"
    is_saved: bool = True


class SavedRouteOut(SavedRouteCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime