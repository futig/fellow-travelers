"""initial

Revision ID: 0001
Revises:
Create Date: 2026-10-03 22:01:30

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "locations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "airport",
                "station",
                name="location_kind",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=8), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("city", sa.String(length=200), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_locations")),
        sa.UniqueConstraint("kind", "code", name="uq_locations_kind_code"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("first_name", sa.String(length=256), nullable=False),
        sa.Column("last_name", sa.String(length=256), nullable=True),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("telegram_id", name=op.f("uq_users_telegram_id")),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("admin_id", sa.Uuid(), nullable=False),
        sa.Column("meeting_point", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("pickup_point", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("destination", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("meeting_instruction", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("chat_url", sa.Text(), nullable=True),
        sa.Column("join_open", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("invite_code", sa.String(length=6), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("ends_on >= starts_on", name=op.f("ck_events_dates_order")),
        sa.ForeignKeyConstraint(
            ["admin_id"], ["users.id"], name=op.f("fk_events_admin_id_users"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_events")),
        sa.UniqueConstraint("invite_code", name=op.f("uq_events_invite_code")),
    )
    op.create_index("ix_events_admin_id", "events", ["admin_id"], unique=False)
    op.create_table(
        "memberships",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name=op.f("fk_memberships_event_id_events"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_memberships_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("event_id", "user_id", name=op.f("pk_memberships")),
    )
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"], unique=False)
    op.create_table(
        "transfers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "active",
                "departed",
                name="transfer_status",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            server_default="active",
            nullable=False,
        ),
        sa.Column(
            "origin",
            sa.Enum(
                "auto",
                "admin",
                name="transfer_origin",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            server_default="auto",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name=op.f("fk_transfers_event_id_events"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transfers")),
    )
    op.create_index("ix_transfers_event_id", "transfers", ["event_id"], unique=False)
    op.create_table(
        "trips",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column(
            "mode",
            sa.Enum(
                "flight",
                name="transport_mode",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            nullable=False,
        ),
        sa.Column("number", sa.String(length=16), nullable=False),
        sa.Column("departure_location_id", sa.Uuid(), nullable=False),
        sa.Column("arrival_location_id", sa.Uuid(), nullable=False),
        sa.Column("scheduled_departure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_arrival", sa.DateTime(timezone=True), nullable=False),
        sa.Column("estimated_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "scheduled",
                "delayed",
                "departed",
                "landed",
                "cancelled",
                "unknown",
                name="trip_status",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            server_default="scheduled",
            nullable=False,
        ),
        sa.Column(
            "source",
            sa.Enum(
                "manual",
                "provider",
                name="trip_source",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            server_default="manual",
            nullable=False,
        ),
        sa.Column("provider_ref", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "scheduled_arrival > scheduled_departure", name=op.f("ck_trips_arrival_after_departure")
        ),
        sa.ForeignKeyConstraint(
            ["arrival_location_id"],
            ["locations.id"],
            name=op.f("fk_trips_arrival_location_id_locations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["departure_location_id"],
            ["locations.id"],
            name=op.f("fk_trips_departure_location_id_locations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name=op.f("fk_trips_event_id_events"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trips")),
        sa.UniqueConstraint(
            "event_id",
            "mode",
            "number",
            "scheduled_departure",
            name="uq_trips_event_mode_number_departure",
        ),
    )
    op.create_index(
        "ix_trips_event_id_scheduled_arrival",
        "trips",
        ["event_id", "scheduled_arrival"],
        unique=False,
    )
    op.create_table(
        "applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("trip_id", sa.Uuid(), nullable=False),
        sa.Column("transfer_id", sa.Uuid(), nullable=True),
        sa.Column("with_companion", sa.Boolean(), nullable=False),
        sa.Column("baggage_count", sa.SmallInteger(), nullable=False),
        sa.Column("max_wait_minutes", sa.SmallInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "searching",
                "assigned",
                "solo",
                "cancelled",
                name="application_status",
                native_enum=False,
                create_constraint=True,
                length=16,
            ),
            server_default="searching",
            nullable=False,
        ),
        sa.Column(
            "at_meeting_point", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("departed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(status = 'assigned') = (transfer_id IS NOT NULL)",
            name=op.f("ck_applications_assigned_has_transfer"),
        ),
        sa.CheckConstraint(
            "baggage_count BETWEEN 0 AND 2", name=op.f("ck_applications_baggage_count_range")
        ),
        sa.CheckConstraint(
            "max_wait_minutes IN (0, 15, 30)", name=op.f("ck_applications_max_wait_minutes_allowed")
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["events.id"],
            name=op.f("fk_applications_event_id_events"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["transfer_id"], ["transfers.id"], name=op.f("fk_applications_transfer_id_transfers")
        ),
        sa.ForeignKeyConstraint(
            ["trip_id"], ["trips.id"], name=op.f("fk_applications_trip_id_trips")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_applications_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_applications")),
        sa.UniqueConstraint("event_id", "user_id", name="uq_applications_event_user"),
    )
    op.create_index(
        "ix_applications_event_id_status", "applications", ["event_id", "status"], unique=False
    )
    op.create_index("ix_applications_transfer_id", "applications", ["transfer_id"], unique=False)
    op.create_index("ix_applications_trip_id", "applications", ["trip_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_applications_trip_id", table_name="applications")
    op.drop_index("ix_applications_transfer_id", table_name="applications")
    op.drop_index("ix_applications_event_id_status", table_name="applications")
    op.drop_table("applications")
    op.drop_index("ix_trips_event_id_scheduled_arrival", table_name="trips")
    op.drop_table("trips")
    op.drop_index("ix_transfers_event_id", table_name="transfers")
    op.drop_table("transfers")
    op.drop_index("ix_memberships_user_id", table_name="memberships")
    op.drop_table("memberships")
    op.drop_index("ix_events_admin_id", table_name="events")
    op.drop_table("events")
    op.drop_table("users")
    op.drop_table("locations")
