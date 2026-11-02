from datetime import datetime
from enum import Enum

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class IncidentType(str, Enum):
    accident = "accident"
    flood = "flood"
    fire = "fire"
    blockage = "blockage"


class ReportIncidentType(str, Enum):
    pothole = "pothole"
    traffic_jam = "traffic_jam"
    accident = "accident"
    flooded_road = "flooded_road"
    flood = "flood"
    fire = "fire"
    blockage = "blockage"


class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# ---------- SOS ----------
class SOSCreate(BaseModel):
    lat: float = Field(ge=-90, le=90, validation_alias=AliasChoices("lat", "latitude"))
    lng: float = Field(ge=-180, le=180, validation_alias=AliasChoices("lng", "longitude"))
    user_id: str | None = None
    incident_type: IncidentType | None = None
    severity: Severity = Severity.high
    message: str | None = Field(default=None, max_length=1000)
    trigger: str | None = None  # "manual" | "accident" (sent by the mobile app)

class NotifiedUnit(BaseModel):
    unit_id: str
    name: str
    agency: str
    distance_m: float
    eta_s: int
    status: str = "notified"


class SOSOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    lat: float
    lng: float
    incident_type: str | None
    severity: str
    source: str
    status: str
    notified: list[NotifiedUnit]


class SOSAck(BaseModel):
    unit_id: str
    status: str = Field(default="acknowledged", pattern="^(acknowledged|en_route|arrived)$")


# ---------- Incidents ----------
class IncidentCreate(LatLng):
    incident_type: IncidentType
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    detected_by: str = "on_device"


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    incident_type: str
    severity: str
    confidence: float
    lat: float
    lng: float
    detected_by: str
    resolved: bool
    sos_id: int | None


# ---------- Community reports ----------
class ReportCreate(LatLng):
    user_id: str | None = None
    incident_type: ReportIncidentType
    severity: Severity = Severity.medium
    description: str | None = Field(default=None, max_length=1000)
    media_url: str | None = None
    expires_at: datetime | None = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    incident_type: str
    severity: str
    lat: float
    lng: float
    description: str | None
    media_url: str | None
    credibility: float
    validated: bool
    credibility_reasons: list[str]
    resolved: bool = False
    expires_at: datetime | None = None
    verification_status: str = "pending"
    upvotes: int = 0
    downvotes: int = 0


class ReportVote(BaseModel):
    user_id: str | None = None
    vote: str = Field(pattern="^(up|down)$")


class ReportResolve(BaseModel):
    resolved: bool = True


# ---------- Hazards ----------
class HazardOut(BaseModel):
    id: str
    source: str  # incident | report
    incident_type: str
    severity: str
    lat: float
    lng: float
    radius_m: float


# ---------- Routing ----------
class RouteRequest(BaseModel):
    origin: LatLng
    destination: LatLng
    k: int = Field(default=3, ge=1, le=5)


class RouteOption(BaseModel):
    rank: int
    points: list[LatLng]
    distance_m: float
    eta_s: int
    safety_score: int
    hazards_avoided: list[str]
    hazards_on_route: list[str]
    explanation: str


class RouteResponse(BaseModel):
    active_hazards: int
    baseline_distance_m: float
    baseline_eta_s: int
    baseline_hazards: list[str]
    routes: list[RouteOption]


class TripVehicle(str, Enum):
    bike = "bike"
    car = "car"
    ev = "ev"
    bus = "bus"


class TripPreference(str, Enum):
    best = "best"
    safest = "safest"
    fuel_saver = "fuel_saver"
    less_traffic = "less_traffic"


class TripPlace(LatLng):
    name: str = Field(min_length=1, max_length=255)


class TripPlanRequest(BaseModel):
    origin: TripPlace
    destination: TripPlace
    stops: list[TripPlace] = Field(default_factory=list)
    vehicle_type: TripVehicle
    preference: TripPreference

    @model_validator(mode="after")
    def validate_trip_locations(self):
        places = [self.origin, *self.stops, self.destination]
        coordinates = [(place.lat, place.lng) for place in places]
        if len(set(coordinates)) != len(coordinates):
            raise ValueError("Trip locations must not repeat the same coordinates.")
        return self


class PlaceSuggestion(LatLng):
    name: str = Field(min_length=1, max_length=255)


class TripLeg(BaseModel):
    origin_name: str
    destination_name: str
    distance_m: float
    duration_s: float


class TripRouteOption(BaseModel):
    rank: int
    points: list[LatLng]
    legs: list[TripLeg]
    distance_m: float
    duration_s: float
    safety_score: int | None
    fuel_litres: float | None = None
    energy_kwh: float | None = None
    estimated_cost: float | None = None
    explanation: str


class TripPlanResponse(BaseModel):
    provider: str
    active_hazards: int
    vehicle_type: TripVehicle
    preference: TripPreference
    traffic_data_available: bool
    routes: list[TripRouteOption]
    ranking_note: str
    estimation_note: str


# ---------- Advisory ----------
class AdvisoryRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    sos_id: int | None = None


class AdvisoryResponse(BaseModel):
    answer: str
    source: str  # llm | fallback
    nearby_hazards: list[HazardOut]
    emergency_numbers: dict[str, str]