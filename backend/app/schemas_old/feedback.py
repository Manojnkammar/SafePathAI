from pydantic import BaseModel, ConfigDict, Field


class FeedbackCreate(BaseModel):
    user_id: str
    route_id: str
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class FeedbackRead(FeedbackCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str