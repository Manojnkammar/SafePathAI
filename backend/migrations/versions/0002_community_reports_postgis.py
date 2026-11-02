"""Add community report lifecycle fields and PostgreSQL/PostGIS support.

Revision ID: 0002_community_reports
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_community_reports"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        op.execute("ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326)")
        op.execute("UPDATE community_reports SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326) WHERE geom IS NULL")
        op.execute("CREATE INDEX IF NOT EXISTS idx_community_reports_geom ON community_reports USING GIST (geom)")

    for column, kwargs in (
        ("verification_status", {"existing_type": sa.String(16), "nullable": False, "server_default": "pending"}),
        ("resolved", {"existing_type": sa.Boolean(), "nullable": False, "server_default": sa.false()}),
        ("resolved_at", {"existing_type": sa.DateTime(), "nullable": True}),
        ("expires_at", {"existing_type": sa.DateTime(), "nullable": True}),
        ("upvotes", {"existing_type": sa.Integer(), "nullable": False, "server_default": "0"}),
        ("downvotes", {"existing_type": sa.Integer(), "nullable": False, "server_default": "0"}),
    ):
        try:
            op.add_column("community_reports", sa.Column(column, kwargs["existing_type"], nullable=kwargs["nullable"], server_default=kwargs.get("server_default") if column in ("verification_status", "resolved", "upvotes", "downvotes") else None))
        except Exception:
            pass

    try:
        op.create_table(
            "community_report_votes",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("report_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.String(64), nullable=False),
            sa.Column("vote", sa.String(4), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("report_id", "user_id", name="uq_report_user_vote"),
        )
    except Exception:
        pass


def downgrade() -> None:
    pass
