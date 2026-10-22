"""Automated SOS dispatch: pick the nearest relevant emergency units.

NOTE: EMERGENCY_UNITS is demo data (Bengaluru area). Replace it with real
agency feeds / API integrations for production use.
"""
from dataclasses import dataclass

from app.services.geo import haversine_m

AVG_SPEED_MPS = 11.0  # ~40 km/h urban emergency response


@dataclass(frozen=True)
class Unit:
    unit_id: str
    name: str
    agency: str  # police | ambulance | fire
    lat: float
    lng: float


EMERGENCY_UNITS: list[Unit] = [
    Unit("AMB-01", "Demo Ambulance - Indiranagar", "ambulance", 12.9784, 77.6408),
    Unit("AMB-02", "Demo Ambulance - Yelahanka", "ambulance", 13.1007, 77.5963),
    Unit("AMB-03", "Demo Ambulance - Jayanagar", "ambulance", 12.9250, 77.5938),
    Unit("POL-01", "Demo Police Station - Cubbon Park", "police", 12.9763, 77.5929),
    Unit("POL-02", "Demo Police Station - Hebbal", "police", 13.0358, 77.5970),
    Unit("POL-03", "Demo Police Station - Whitefield", "police", 12.9698, 77.7500),
    Unit("FIR-01", "Demo Fire Station - Richmond Town", "fire", 12.9611, 77.5946),
    Unit("FIR-02", "Demo Fire Station - Yelahanka", "fire", 13.1005, 77.5940),
    Unit("FIR-03", "Demo Fire Station - Koramangala", "fire", 12.9352, 77.6245),
]

AGENCIES_BY_INCIDENT = {
    "accident": ["police", "ambulance"],
    "fire": ["fire", "ambulance"],
    "flood": ["fire", "police"],
    "blockage": ["police"],
    None: ["ambulance", "police"],
}


def pick_units(lat: float, lng: float, incident_type: str | None) -> list[dict]:
    agencies = AGENCIES_BY_INCIDENT.get(incident_type, AGENCIES_BY_INCIDENT[None])
    notified: list[dict] = []
    for agency in agencies:
        candidates = [u for u in EMERGENCY_UNITS if u.agency == agency]
        best = min(candidates, key=lambda u: haversine_m(lat, lng, u.lat, u.lng))
        dist = haversine_m(lat, lng, best.lat, best.lng)
        notified.append(
            {
                "unit_id": best.unit_id,
                "name": best.name,
                "agency": best.agency,
                "distance_m": round(dist, 1),
                "eta_s": int(dist / AVG_SPEED_MPS),
                "status": "notified",
            }
        )
    return notified