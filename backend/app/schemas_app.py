from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


COMMON_PASSWORDS = {
    "123!",
    "12345678",
    "password",
    "password1!",
    "password123!",
    "12345678aa!",
    "123456789aa!",
    "qwerty123!",
    "letmein1!",
    "admin123!",
    "welcome1!",
    "iloveyou1!",
    "abc12345!",
    "changeme1!",
    "passw0rd!",
    "monkey123!",
    "dragon123!",
    "sunshine1!",
    "football1!",
    "safepath1!",
}


def validate_password_strength(password: str) -> str:
    if not 8 <= len(password) <= 64:
        raise ValueError("Password must be between 8 and 64 characters.")
    if any(character.isspace() for character in password):
        raise ValueError("Password cannot contain spaces.")
    if not any("A" <= character <= "Z" for character in password):
        raise ValueError("Password must include an uppercase letter.")
    if not any("a" <= character <= "z" for character in password):
        raise ValueError("Password must include a lowercase letter.")
    if not any("0" <= character <= "9" for character in password):
        raise ValueError("Password must include a number.")
    if not any(character in "@#$%!*" for character in password):
        raise ValueError("Password must include one of these characters: @ # $ % ! *.")
    if password.casefold() in COMMON_PASSWORDS:
        raise ValueError("Choose a less common password.")
    return password


class UserCreate(BaseModel):
    email: str = Field(min_length=1, max_length=255)  # the app also accepts a phone number here
    display_name: str | None = None
    phone_number: str | None = None
    auth_provider: str = "mobile"
    password: str
    password_confirmation: str

    @field_validator("password")
    @classmethod
    def password_meets_requirements(cls, password: str) -> str:
        return validate_password_strength(password)

    @model_validator(mode="after")
    def password_confirmation_matches(self):
        if self.password != self.password_confirmation:
            raise ValueError("Password confirmation does not match.")
        return self


class UserLogin(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str


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