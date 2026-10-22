from math import asin, cos, radians, sin, sqrt

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repair_shop import RepairShop


def haversine_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    earth_radius_km = 6371.0088
    lat_delta = radians(latitude_b - latitude_a)
    lon_delta = radians(longitude_b - longitude_a)
    value = sin(lat_delta / 2) ** 2 + cos(radians(latitude_a)) * cos(radians(latitude_b)) * sin(lon_delta / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(value))


async def nearby_repair_shops(
    session: AsyncSession, latitude: float, longitude: float, radius_km: float = 25, limit: int = 20
) -> list[tuple[RepairShop, float]]:
    if radius_km <= 0 or limit <= 0:
        raise ValueError("radius_km and limit must be positive")
    shops = (await session.execute(select(RepairShop).where(RepairShop.is_open.is_(True)))).scalars().all()
    matches = [(shop, haversine_km(latitude, longitude, shop.latitude, shop.longitude)) for shop in shops]
    return sorted((item for item in matches if item[1] <= radius_km), key=lambda item: item[1])[:limit]