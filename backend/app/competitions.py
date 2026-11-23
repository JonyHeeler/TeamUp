from typing import NamedTuple


class CompetitionName(NamedTuple):
    name: str
    english: str


OFFICIAL_COMPETITIONS = {
    "math-modeling": CompetitionName("数学建模校赛", "Campus Mathematical Modeling Contest"),
    "campus-innovation": CompetitionName(
        "校园创新创业大赛", "Campus Innovation & Entrepreneurship Contest"
    ),
}
OFFICIAL_COMPETITION_NAMES = tuple(
    competition.name for competition in OFFICIAL_COMPETITIONS.values()
)
