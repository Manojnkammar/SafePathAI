# Trip planner

The mobile Trip Planner uses the following API endpoints:

- `GET /api/v1/routes/places/search?q=<text>` returns geocoded place suggestions. A place is considered selected only after the user picks a suggestion with coordinates.
- `POST /api/v1/routes/plan` requests a road route for an origin, destination, ordered `stops`, `vehicle_type` (`bike`, `car`, `ev`, or `bus`), and `preference` (`best`, `safest`, `fuel_saver`, or `less_traffic`).

Route alternatives include the provider geometry, total distance and duration, ordered leg metrics, and an estimated safety score when active hazard data exists. The selected provider enforces its own waypoint limits; provider rejections are surfaced as routing errors. The existing `POST /api/v1/routes/safe` endpoint remains unchanged; it uses the application's synthetic grid network and is not the road route provider used by the Trip Planner.

## Provider and estimate limitations

Place search uses Nominatim and road routing uses the public OSRM demo service through the backend. Search text and trip coordinates are sent to those providers. Configure or self-host replacement providers before production use; the public services do not provide a production availability guarantee.

OSRM's returned duration is not live traffic data. `less_traffic` currently ranks by provider duration and explicitly reports that traffic data is unavailable. `safest` ranks by active hazard exposure only when hazards exist; otherwise it falls back to duration and does not claim that a route is safe. `fuel_saver` ranks by distance as a proxy because vehicle efficiency and energy/fuel prices are not configured.

Fuel consumption, EV energy use, and trip cost are returned as unavailable until vehicle-specific efficiency and applicable fuel prices or electricity tariffs are configured. The API does not invent these values.
