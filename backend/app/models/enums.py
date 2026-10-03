from enum import StrEnum


class LocationKind(StrEnum):
    AIRPORT = "airport"
    STATION = "station"


class TransportMode(StrEnum):
    FLIGHT = "flight"


class TripStatus(StrEnum):
    SCHEDULED = "scheduled"
    DELAYED = "delayed"
    DEPARTED = "departed"
    LANDED = "landed"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


class TripSource(StrEnum):
    MANUAL = "manual"
    PROVIDER = "provider"


class ApplicationStatus(StrEnum):
    SEARCHING = "searching"
    ASSIGNED = "assigned"
    SOLO = "solo"
    CANCELLED = "cancelled"


class TransferStatus(StrEnum):
    ACTIVE = "active"
    DEPARTED = "departed"


class TransferOrigin(StrEnum):
    AUTO = "auto"
    ADMIN = "admin"
