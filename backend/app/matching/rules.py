from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import combinations
from uuid import UUID

MAX_PASSENGERS = 3
MAX_BAGGAGE = 2


@dataclass(frozen=True, slots=True)
class MatchCandidate:
    id: UUID
    arrival_location_id: UUID
    arrival_at: datetime
    passengers: int
    baggage: int
    max_wait: timedelta

    def __post_init__(self) -> None:
        if self.arrival_at.tzinfo is None or self.arrival_at.utcoffset() is None:
            raise ValueError("arrival_at must be timezone-aware")
        if self.passengers not in (1, 2):
            raise ValueError("passengers must be 1 or 2")
        if self.baggage < 0:
            raise ValueError("baggage must not be negative")
        if self.max_wait < timedelta(0):
            raise ValueError("max_wait must not be negative")


def is_compatible(group: Sequence[MatchCandidate]) -> bool:
    """Можно ли посадить всю группу в одну машину (минимум заявок не проверяется)."""
    if not group:
        return False
    if len({c.id for c in group}) != len(group):
        return False
    if len({c.arrival_location_id for c in group}) != 1:
        return False
    if sum(c.passengers for c in group) > MAX_PASSENGERS:
        return False
    if sum(c.baggage for c in group) > MAX_BAGGAGE:
        return False
    # все ждут самого позднего прилетающего, каждый — в пределах своего ожидания
    latest = max(c.arrival_at for c in group)
    return all(latest - c.arrival_at <= c.max_wait for c in group)


def _sort_key(c: MatchCandidate) -> tuple[datetime, UUID]:
    return c.arrival_at, c.id


def _group_rank(
    group: Sequence[MatchCandidate],
) -> tuple[int, timedelta, timedelta, tuple[UUID, ...]]:
    arrivals = [c.arrival_at for c in group]
    latest = max(arrivals)
    return (
        -sum(c.passengers for c in group),
        latest - min(arrivals),
        sum((latest - t for t in arrivals), timedelta(0)),
        tuple(sorted(c.id for c in group)),
    )


def find_group(
    new: MatchCandidate, candidates: Iterable[MatchCandidate]
) -> tuple[MatchCandidate, ...] | None:
    """Лучшая группа из `new` и 1–2 кандидатов либо None, если трансфер не собрать.

    Группа всегда из 2–3 заявок.
    """
    suitable = [
        c
        for c in candidates
        if c.id != new.id
        and c.arrival_location_id == new.arrival_location_id
        and new.passengers + c.passengers <= MAX_PASSENGERS
        and is_compatible((new, c))
    ]
    # в заявке минимум 1 пассажир, а мест 3, поэтому с new влезает не более 2 кандидатов
    groups: list[tuple[MatchCandidate, ...]] = [(new, c) for c in suitable]
    groups.extend((new, a, b) for a, b in combinations(suitable, 2) if is_compatible((new, a, b)))
    if not groups:
        return None
    best = min(groups, key=_group_rank)
    return tuple(sorted(best, key=_sort_key))
