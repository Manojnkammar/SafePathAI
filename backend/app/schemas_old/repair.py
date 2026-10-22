from pydantic import BaseModel, ConfigDict, Field


class RepairShopCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=300)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    phone_number: str | None = Field(default=None, max_length=30)
    rating: float | None = Field(default=None, ge=0, le=5)
    is_open: bool = True


class RepairShopRead(RepairShopCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    distance_km: float | None = None