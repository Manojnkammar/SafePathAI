from app.schemas import LatLng
from app.services.geo import haversine_m
from app.services.routing import SPEED_MPS, compute_routes


def test_dijkstra_distance_includes_exact_endpoints():
    origin = LatLng(lat=12.0, lng=77.0)
    destination = LatLng(lat=12.01, lng=77.012)

    _, _, _, routes = compute_routes(origin, destination, [])

    route = routes[0]
    assert route.points[0] == origin
    assert route.points[-1] == destination
    measured_distance = sum(
        haversine_m(start.lat, start.lng, end.lat, end.lng)
        for start, end in zip(route.points, route.points[1:])
    )
    assert route.distance_m > 0
    assert abs(route.distance_m - measured_distance) <= 0.2
    assert abs(route.eta_s - route.distance_m / SPEED_MPS) <= 1
