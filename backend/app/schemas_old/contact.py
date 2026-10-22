from pydantic import BaseModel, ConfigDict, Field


class EmergencyContactCreate(BaseModel):
    user_id: str
    name: str = Field(min_length=1, max_length=120)
    phone_number: str = Field(min_length=3, max_length=30)
    relationship_label: str | None = Field(default=None, max_length=50)
    is_primary: bool = False


class EmergencyContactRead(EmergencyContactCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
