from pydantic import BaseModel, ConfigDict, Field


class SosCreate(BaseModel):
    user_id: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    trigger: str = Field(default="manual", pattern="^(manual|accident|planned)$")
    message: str | None = None


class SosRead(SosCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str