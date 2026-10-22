from pydantic import BaseModel, ConfigDict, Field


class CommunityReportCreate(BaseModel):
    user_id: str
    report_type: str = Field(pattern="^(accident|pothole|flood|traffic|hazard)$")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    description: str | None = None
    severity: int = Field(default=1, ge=1, le=5)


class CommunityReportRead(CommunityReportCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
