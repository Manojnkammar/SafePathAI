from pydantic import BaseModel, ConfigDict, Field


class AccidentCreate(BaseModel):
    user_id: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    acceleration_magnitude: float | None = Field(default=None, ge=0)
    gyroscope_magnitude: float | None = Field(default=None, ge=0)
    notes: str | None = None


class AccidentStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending_confirmation|confirmed|cancelled)$")


class AccidentRead(AccidentCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str