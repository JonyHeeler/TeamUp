import re
from unicodedata import normalize

from app.db.models import Profile
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


def matches_skill(profile: Profile, query: str) -> bool:
    """Match listed skills and related development terms."""
    term = search_text(query.strip())
    codes = [skill.code for skill in profile.skills]
    skills = [
        search_text(label)
        for label in [
            *codes,
            *(SKILL_LABELS[code] for code in codes),
            *(profile.custom_skills or []),
        ]
    ]
    if any(term in value for value in [*skills, search_text(profile.introduction)]):
        return True
    if term in PROGRAMMING_TERMS:
        return any(PROGRAMMING_SKILLS.search(skill) for skill in skills)
    return term == "前端" and any(re.search(FRONTEND_SKILLS, skill) for skill in skills)
