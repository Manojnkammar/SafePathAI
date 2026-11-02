"""Add nullable password hashes for mobile account authentication."""
from alembic import op
import sqlalchemy as sa


revision = "0003_user_password_hash"
down_revision = "0002_community_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "password_hash" not in {column["name"] for column in inspector.get_columns("users")}:
        op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "password_hash" in {column["name"] for column in inspector.get_columns("users")}:
        op.drop_column("users", "password_hash")