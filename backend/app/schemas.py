from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


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


class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# ---------- SOS ----------
class SOSCreate(LatLng):
    user_id: str | None = None
    incident_type: IncidentType | None = None
    severity: Severity = Severity.high
    message: str | None = Field(default=None, max_length=1000)


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
    incident_type: IncidentType
    severity: Severity = Severity.medium
    description: str | None = Field(default=None, max_length=1000)
    media_url: str | None = None


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