"""Hazard-aware routing: W(e) = alpha*t(e) + beta*h(e) + gamma*c(e), solved with Dijkstra.

No live road network is bundled, so a synthetic 8-connected grid is laid over the
bounding box of origin/destination. Swap `build_grid` / `neighbors` for an OSM
(osmnx) or Google Directions graph in production; the cost model and Dijkstra
code stay the same.
"""
import heapq
import math

from app.core.config import settings
from app.schemas import HazardOut, LatLng, RouteOption
from app.services.geo import haversine_m

SPEED_MPS = 11.0
SEVERITY_WEIGHT = {"low": 1.0, "medium": 2.0, "high": 4.0, "critical": 8.0}
HAZARD_UNIT_COST = 600.0  # seconds-equivalent penalty at the centre of a weight-1 hazard

Node = tuple[int, int]


class Grid:
    def __init__(self, a: LatLng, b: LatLng, n: int = 30):
        span_lat = abs(a.lat - b.lat)
        span_lng = abs(a.lng - b.lng)
        pad_lat = max(span_lat * 0.5, 0.01)
        pad_lng = max(span_lng * 0.5, 0.01)
        self.lat0 = min(a.lat, b.lat) - pad_lat
        self.lat1 = max(a.lat, b.lat) + pad_lat
        self.lng0 = min(a.lng, b.lng) - pad_lng
        self.lng1 = max(a.lng, b.lng) + pad_lng
        self.n = n

    def coord(self, node: Node) -> tuple[float, float]:
        i, j = node
        lat = self.lat0 + (self.lat1 - self.lat0) * i / (self.n - 1)
        lng = self.lng0 + (self.lng1 - self.lng0) * j / (self.n - 1)
        return lat, lng

    def snap(self, p: LatLng) -> Node:
        i = round((p.lat - self.lat0) / (self.lat1 - self.lat0) * (self.n - 1))
        j = round((p.lng - self.lng0) / (self.lng1 - self.lng0) * (self.n - 1))
        return max(0, min(self.n - 1, i)), max(0, min(self.n - 1, j))

    def neighbors(self, node: Node):
        i, j = node
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                if di == 0 and dj == 0:
                    continue
                ni, nj = i + di, j + dj
                if 0 <= ni < self.n and 0 <= nj < self.n:
                    yield (ni, nj)


def _edge_key(u: Node, v: Node) -> tuple[Node, Node]:
    return (u, v) if u <= v else (v, u)


class EdgeCosts:
    """Caches per-edge length, hazard penalty and exposure."""

    def __init__(self, grid: Grid, hazards: list[HazardOut]):
        self.grid = grid
        self.hazards = hazards
        self._cache: dict[tuple[Node, Node], tuple[float, float, bool, set[str]]] = {}

    def info(self, u: Node, v: Node):
        key = _edge_key(u, v)
        hit = self._cache.get(key)
        if hit:
            return hit
        la1, ln1 = self.grid.coord(u)
        la2, ln2 = self.grid.coord(v)
        length = haversine_m(la1, ln1, la2, ln2)
        mid_lat, mid_lng = (la1 + la2) / 2, (ln1 + ln2) / 2
        penalty = 0.0
        exposed = False
        hit_ids: set[str] = set()
        for h in self.hazards:
            # test endpoints and midpoint so long edges can't skip over a hazard
            d = min(
                haversine_m(mid_lat, mid_lng, h.lat, h.lng),
                haversine_m(la1, ln1, h.lat, h.lng),
                haversine_m(la2, ln2, h.lat, h.lng),
            )
            if d < h.radius_m:
                exposed = True
                hit_ids.add(h.id)
                penalty += SEVERITY_WEIGHT.get(h.severity, 2.0) * HAZARD_UNIT_COST * (1 - d / h.radius_m + 0.25)
        val = (length, penalty, exposed, hit_ids)
        self._cache[key] = val
        return val

    def weight(
        self, u: Node, v: Node, congestion: float = 0.0, extra: float = 1.0, use_hazards: bool = True
    ) -> float:
        length, penalty, _, _ = self.info(u, v)
        t = length / SPEED_MPS
        c = congestion * t
        beta = settings.route_beta if use_hazards else 0.0
        w = settings.route_alpha * t + beta * penalty + settings.route_gamma * c
        return w * extra


def dijkstra(
    grid: Grid,
    costs: EdgeCosts,
    src: Node,
    dst: Node,
    edge_mult: dict | None = None,
    use_hazards: bool = True,
) -> list[Node]:
    edge_mult = edge_mult or {}
    dist: dict[Node, float] = {src: 0.0}
    prev: dict[Node, Node] = {}
    heap: list[tuple[float, Node]] = [(0.0, src)]
    done: set[Node] = set()
    while heap:
        d, u = heapq.heappop(heap)
        if u in done:
            continue
        done.add(u)
        if u == dst:
            break
        for v in grid.neighbors(u):
            if v in done:
                continue
            nd = d + costs.weight(u, v, extra=edge_mult.get(_edge_key(u, v), 1.0), use_hazards=use_hazards)
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))
    path = [dst]
    while path[-1] != src:
        path.append(prev[path[-1]])
    path.reverse()
    return path


def _path_stats(grid: Grid, costs: EdgeCosts, path: list[Node]):
    length = 0.0
    exposed_len = 0.0
    hit: set[str] = set()
    for u, v in zip(path, path[1:]):
        l, _, exp, ids = costs.info(u, v)
        length += l
        if exp:
            exposed_len += l
            hit |= ids
    return length, exposed_len, hit


def _fmt(ids: set[str], hazards: list[HazardOut]) -> list[str]:
    by_id = {h.id: h for h in hazards}
    return sorted(f"{by_id[i].incident_type} ({by_id[i].severity}) [{i}]" for i in ids)


def compute_routes(origin: LatLng, dest: LatLng, hazards: list[HazardOut], k: int = 3):
    grid = Grid(origin, dest)
    costs = EdgeCosts(grid, hazards)
    src, dst = grid.snap(origin), grid.snap(dest)
    if src == dst:
        src_c = grid.coord(src)
        pts = [LatLng(lat=src_c[0], lng=src_c[1])]
        opt = RouteOption(
            rank=1, points=pts, distance_m=0.0, eta_s=0, safety_score=100,
            hazards_avoided=[], hazards_on_route=[],
            explanation="Origin and destination are effectively the same location.",
        )
        return 0.0, 0, [], [opt]

    # Baseline: fastest route ignoring hazards (what a normal nav app would give).
    base_path = dijkstra(grid, costs, src, dst, use_hazards=False)
    base_len, _, base_hit_ids = _path_stats(grid, costs, base_path)
    base_eta = int(base_len / SPEED_MPS)

    # Top-K alternatives: re-run Dijkstra, inflating edges used by earlier routes.
    paths: list[list[Node]] = []
    edge_mult: dict = {}
    for _ in range(k * 3):
        if len(paths) >= k:
            break
        p = dijkstra(grid, costs, src, dst, edge_mult)
        if p not in paths:
            paths.append(p)
        for e in zip(p, p[1:]):
            key = _edge_key(*e)
            edge_mult[key] = edge_mult.get(key, 1.0) * 1.6

    scored = []
    for p in paths:
        length, exposed_len, hit_ids = _path_stats(grid, costs, p)
        cost = sum(costs.weight(u, v) for u, v in zip(p, p[1:]))
        safety = int(round(100 * (1 - exposed_len / length))) if length else 100
        scored.append((cost, p, length, hit_ids, safety))
    scored.sort(key=lambda s: s[0])

    options: list[RouteOption] = []
    for rank, (_, p, length, hit_ids, safety) in enumerate(scored, 1):
        avoided = base_hit_ids - hit_ids
        eta = int(length / SPEED_MPS)
        delta_m = length - base_len
        if avoided:
            expl = (
                f"Avoids {', '.join(_fmt(avoided, hazards))} that the fastest route passes through"
                f" ({delta_m:+.0f} m, {eta - base_eta:+d} s vs fastest)."
            )
        elif hit_ids:
            expl = f"Still crosses {len(hit_ids)} hazard zone(s); no safer path was available on this network."
        else:
            expl = "No active hazard zones on this route."
        options.append(
            RouteOption(
                rank=rank,
                points=[LatLng(lat=grid.coord(n)[0], lng=grid.coord(n)[1]) for n in p],
                distance_m=round(length, 1),
                eta_s=eta,
                safety_score=max(0, min(100, safety)),
                hazards_avoided=_fmt(avoided, hazards),
                hazards_on_route=_fmt(hit_ids, hazards),
                explanation=expl,
            )
        )
    return round(base_len, 1), base_eta, _fmt(base_hit_ids, hazards), options