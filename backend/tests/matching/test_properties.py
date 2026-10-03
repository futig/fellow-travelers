import random
from datetime import UTC, datetime, timedelta
from itertools import combinations
from uuid import UUID

from hypothesis import given, settings
from hypothesis import strategies as st

from app.matching import MatchCandidate, find_group, is_compatible

_BASE = datetime(2026, 7, 1, 10, 0, tzinfo=UTC)

Scenario = tuple[MatchCandidate, list[MatchCandidate]]


@st.composite
def _candidate(draw: st.DrawFn, id_int: int) -> MatchCandidate:
    return MatchCandidate(
        id=UUID(int=id_int),
        arrival_location_id=UUID(int=draw(st.integers(1, 2))),
        arrival_at=_BASE + timedelta(minutes=draw(st.integers(0, 60))),
        passengers=draw(st.integers(1, 2)),
        baggage=draw(st.integers(0, 2)),
        max_wait=timedelta(minutes=draw(st.integers(0, 40))),
    )


@st.composite
def _scenario(draw: st.DrawFn) -> Scenario:
    size = draw(st.integers(0, 8))
    new = draw(_candidate(1000))
    others = [draw(_candidate(i)) for i in range(size)]
    if draw(st.booleans()):
        # кандидат с id как у new должен игнорироваться
        others.append(draw(_candidate(1000)))
    return new, others


def _brute(new: MatchCandidate, others: list[MatchCandidate]) -> tuple[MatchCandidate, ...] | None:
    pool = [c for c in others if c.id != new.id]
    groups = [
        (new, *subset)
        for size in (1, 2)
        for subset in combinations(pool, size)
        if is_compatible((new, *subset))
    ]
    if not groups:
        return None

    def key(g: tuple[MatchCandidate, ...]) -> tuple[int, timedelta, timedelta, tuple[UUID, ...]]:
        latest = max(c.arrival_at for c in g)
        spread = latest - min(c.arrival_at for c in g)
        wait = sum((latest - c.arrival_at for c in g), timedelta(0))
        return -sum(c.passengers for c in g), spread, wait, tuple(sorted(c.id for c in g))

    best = min(groups, key=key)
    return tuple(sorted(best, key=lambda c: (c.arrival_at, c.id)))


@settings(max_examples=200, deadline=None)
@given(_scenario())
def test_result_is_valid_group(scenario: Scenario) -> None:
    new, others = scenario
    result = find_group(new, others)
    if result is not None:
        assert new in result
        assert is_compatible(result)
        assert 2 <= len(result) <= 3


@settings(max_examples=200, deadline=None)
@given(_scenario(), st.randoms(use_true_random=False))
def test_result_independent_of_order(scenario: Scenario, rnd: random.Random) -> None:
    new, others = scenario
    shuffled = list(others)
    rnd.shuffle(shuffled)
    assert find_group(new, others) == find_group(new, shuffled)


@settings(max_examples=200, deadline=None)
@given(_scenario())
def test_matches_brute_force(scenario: Scenario) -> None:
    new, others = scenario
    assert find_group(new, others) == _brute(new, others)
