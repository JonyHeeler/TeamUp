import re
from collections.abc import Iterable
from unicodedata import normalize

from app.skills import SKILL_LABELS

PROGRAMMING_TERMS = {"编程", "代码", "开发", "programming", "coding", "development"}
FRONTEND_SKILLS = r"front[ -]?end|\b(?:react|vue)\b"
PROGRAMMING_SKILLS = re.compile(
    r"编程|代码|开发|programming|coding|development|前端|后端|back[ -]?end"
    r"|\b(?:python|javascript|typescript|java|rust|sql)\b|" + FRONTEND_SKILLS
)


def search_text(value: str) -> str:
    """Normalize case and full-width characters for skill comparisons."""
    return normalize("NFKC", value).casefold()


def matches_skill(
    query: str,
    codes: Iterable[str],
    *,
    descriptions: Iterable[str] = (),
) -> bool:
    """Match skill codes, labels, related terms and public descriptions."""
    term = search_text(query.strip())
    skills = [search_text(value) for code in codes for value in (code, SKILL_LABELS[code])]
    if any(term in value for value in skills) or any(
        term in search_text(description) for description in descriptions
    ):
        return True
    if term in PROGRAMMING_TERMS:
        return any(PROGRAMMING_SKILLS.search(skill) for skill in skills)
    return term == "前端" and any(re.search(FRONTEND_SKILLS, skill) for skill in skills)
