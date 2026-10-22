from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class RouteCandidate:
    route_id: str
    distance_km: float
    duration_minutes: float
    risk_score: float | None = None
    safety_score: float | None = None


def select_route(candidates: Iterable[RouteCandidate], preference: str) -> RouteCandidate:
    routes = list(candidates)
    if not routes:
        raise ValueError("at least one route candidate is required")
    if preference == "shortest":
        return min(routes, key=lambda route: route.distance_km)
    if preference == "fastest":
        return min(routes, key=lambda route: route.duration_minutes)
    if preference == "safest":
        return min(routes, key=lambda route: route.risk_score if route.risk_score is not None else 1.0)
    if preference == "balanced":
        distances = _normalize([route.distance_km for route in routes])
        durations = _normalize([route.duration_minutes for route in routes])
        risks = _normalize([route.risk_score if route.risk_score is not None else 1.0 for route in routes])
        return min(
            routes,
            key=lambda route: 0.4 * distances[routes.index(route)]
            + 0.35 * durations[routes.index(route)]
            + 0.25 * risks[routes.index(route)],
        )
    raise ValueError("preference must be shortest, fastest, safest, or balanced")


def _normalize(values: list[float]) -> list[float]:
    minimum, maximum = min(values), max(values)
    if maximum == minimum:
        return [0.0] * len(values)
    return [(value - minimum) / (maximum - minimum) for value in values]
