from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    display_name: str | None = Field(default=None, max_length=120)
    phone_number: str | None = Field(default=None, max_length=30)
    auth_provider: str = Field(default="firebase", max_length=30)


class UserRead(UserCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool