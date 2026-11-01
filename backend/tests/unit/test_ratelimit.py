from planner.services.ratelimit import Limit, RateLimiter


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_sliding_window():
    clock = Clock()
    rl = RateLimiter(clock=clock)
    limit = Limit(3, 60)
    assert [rl.check("k", limit) for _ in range(3)] == [0.0, 0.0, 0.0]
    wait = rl.check("k", limit)
    assert 59 < wait <= 60
    clock.now += 30
    assert rl.check("k", limit) > 0  # still inside the window
    clock.now += 31  # first hit has aged out
    assert rl.check("k", limit) == 0.0
    assert rl.check("other", limit) == 0.0  # keys are independent


def test_reset_and_prune():
    clock = Clock()
    rl = RateLimiter(clock=clock)
    limit = Limit(1, 60)
    assert rl.check("a", limit) == 0.0
    assert rl.check("a", limit) > 0
    rl.reset("a")
    assert rl.check("a", limit) == 0.0
    rl.check("b", limit)
    assert rl.prune() == 0  # nothing old yet
    clock.now += 4000
    assert rl.prune() == 2
    assert rl.check("a", limit) == 0.0
