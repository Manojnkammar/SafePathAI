
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS app_users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS road_nodes (
    node_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location GEOMETRY(Point, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS road_segments (
    road_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    start_node BIGINT NOT NULL REFERENCES road_nodes(node_id),
    end_node BIGINT NOT NULL REFERENCES road_nodes(node_id),
    road_name VARCHAR(200),
    distance_m DOUBLE PRECISION NOT NULL CHECK (distance_m > 0),
    speed_limit_kmh DOUBLE PRECISION CHECK (speed_limit_kmh > 0),
    risk_score DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (risk_score BETWEEN 0 AND 1),
    traffic_delay_min DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (traffic_delay_min >= 0),
    road_geometry GEOMETRY(LineString, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS hazards (
    hazard_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reported_by INTEGER REFERENCES app_users(user_id) ON DELETE SET NULL,
    hazard_type VARCHAR(80) NOT NULL,
    description TEXT,
    severity SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 5),
    location GEOMETRY(Point, 4326) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'reported'
        CHECK (status IN ('reported', 'verified', 'resolved')),
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sos_alerts (
    sos_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER REFERENCES app_users(user_id) ON DELETE SET NULL,
    incident_type VARCHAR(80) NOT NULL,
    severity SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 5),
    location GEOMETRY(Point, 4326) NOT NULL,
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'acknowledged', 'dispatched', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safe_routes (
    route_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER REFERENCES app_users(user_id) ON DELETE SET NULL,
    origin GEOMETRY(Point, 4326) NOT NULL,
    destination GEOMETRY(Point, 4326) NOT NULL,
    route_geometry GEOMETRY(LineString, 4326),
    distance_m DOUBLE PRECISION CHECK (distance_m >= 0),
    estimated_time_min DOUBLE PRECISION CHECK (estimated_time_min >= 0),
    risk_score DOUBLE PRECISION CHECK (risk_score BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS traffic_reports (
    traffic_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    road_id BIGINT NOT NULL REFERENCES road_segments(road_id)
        ON DELETE CASCADE,
    congestion_level SMALLINT NOT NULL CHECK (congestion_level BETWEEN 1 AND 5),
    delay_min DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (delay_min >= 0),
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_road_nodes_location
    ON road_nodes USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_road_segments_geometry
    ON road_segments USING GIST (road_geometry);
CREATE INDEX IF NOT EXISTS idx_hazards_location
    ON hazards USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_sos_location
    ON sos_alerts USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_safe_routes_geometry
    ON safe_routes USING GIST (route_geometry);
CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards(status);
CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_alerts(status);
CREATE INDEX IF NOT EXISTS idx_traffic_road_time
    ON traffic_reports(road_id, reported_at DESC);
