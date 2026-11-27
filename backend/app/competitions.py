from typing import NamedTuple


class CompetitionName(NamedTuple):
    """Pair the Chinese and English names of an official competition."""

    name: str
    english: str


OFFICIAL_COMPETITIONS = {
    "mcm-icm": CompetitionName("美赛", "MCM / ICM"),
    "ai-agent-campus": CompetitionName("AI 智能体+ 大赛校赛", "AI Agent+ Campus Contest"),
}
OFFICIAL_COMPETITION_NAMES = tuple(
    competition.name for competition in OFFICIAL_COMPETITIONS.values()
)
