"""Situation-grounded advisory. Uses GPT-4o when OPENAI_API_KEY is set,
otherwise falls back to deterministic rule-based guidance."""
import httpx

from app.core.config import settings
from app.schemas import HazardOut
from app.services.geo import haversine_m

EMERGENCY_NUMBERS = {
    "unified_emergency": "112",
    "police": "100",
    "fire": "101",
    "ambulance": "102",
    "disaster_management": "108",
}

FALLBACK_STEPS = {
    "accident": [
        "Move to a safe spot away from traffic and switch on hazard lights.",
        "Do not move injured people unless there is immediate danger (fire, traffic).",
        "Call 112 / 102 if the SOS has not been sent; share your live location.",
        "Apply firm pressure to any heavy bleeding with a clean cloth.",
    ],
    "fire": [
        "Move away from the fire and smoke; stay low if there is smoke.",
        "Do not use lifts; use stairs and close doors behind you.",
        "Call 101 / 112 and give your exact location.",
        "Do not go back inside for belongings.",
    ],
    "flood": [
        "Move to higher ground immediately; avoid walking or driving through moving water.",
        "Stay away from power lines and electrical equipment.",
        "Follow the suggested safe route; do not use underpasses or low bridges.",
        "Call 112 / 108 if you are trapped.",
    ],
    "blockage": [
        "Do not attempt to drive through the blockage.",
        "Use the suggested alternative route shown on the map.",
        "Report the blockage so others are warned.",
    ],
    None: [
        "Move to a safe place and stay calm.",
        "Call 112 for any emergency; share your location.",
        "Follow the safe route shown on the map and avoid marked hazard zones.",
    ],
}


def _context(message: str, lat, lng, hazards: list[HazardOut], sos: dict | None) -> str:
    lines = []
    if lat is not None and lng is not None:
        lines.append(f"User location: {lat:.5f}, {lng:.5f}")
        for h in hazards[:5]:
            d = haversine_m(lat, lng, h.lat, h.lng)
            lines.append(f"Hazard: {h.incident_type} ({h.severity}), {d:.0f} m away, zone radius {h.radius_m:.0f} m")
    if not hazards:
        lines.append("No active hazards reported near the user.")
    if sos:
        units = ", ".join(f"{u['name']} (ETA {u['eta_s']}s)" for u in sos.get("notified", []))
        lines.append(f"SOS #{sos['id']} status: {sos['status']}; units notified: {units}")
    return "\n".join(lines)


async def advise(message: str, lat, lng, hazards: list[HazardOut], sos: dict | None) -> tuple[str, str]:
    ctx = _context(message, lat, lng, hazards, sos)

    if settings.openai_api_key:
        system = (
            "You are SafePath AI, an emergency advisor. Think step by step about immediate safety "
            "priorities, then answer with: (1) numbered action steps, (2) a one-line hazard explanation, "
            "(3) relevant Indian emergency numbers (112 unified, 100 police, 101 fire, 102 ambulance). "
            "Be concise and calm. Never invent hazards that are not in the context."
        )
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                    json={
                        "model": settings.openai_model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": f"Context:\n{ctx}\n\nUser says: {message}"},
                        ],
                        "temperature": 0.2,
                    },
                )
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"], "llm"
        except Exception:
            pass  # fall through to rule-based guidance

    top = hazards[0].incident_type if hazards else (sos or {}).get("incident_type")
    steps = FALLBACK_STEPS.get(top, FALLBACK_STEPS[None])
    text = ["Immediate steps:"] + [f"{i}. {s}" for i, s in enumerate(steps, 1)]
    if hazards and lat is not None and lng is not None:
        h = hazards[0]
        text.append(
            f"Nearest hazard: {h.incident_type} ({h.severity}), about "
            f"{haversine_m(lat, lng, h.lat, h.lng):.0f} m away."
        )
    if sos:
        text.append(f"Your SOS #{sos['id']} is {sos['status']}; {len(sos.get('notified', []))} unit(s) notified.")
    text.append("Emergency: 112 (unified), 100 police, 101 fire, 102 ambulance.")
    return "\n".join(text), "fallback"