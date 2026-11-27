from types import SimpleNamespace

from app.services.profiles.search import matches_skill


def test_skill_search_matches_aliases_and_custom_skills():
    """Search recognizes preset aliases, free text and mixed-case terms."""
    profile = SimpleNamespace(
        skills=[SimpleNamespace(code="development"), SimpleNamespace(code="frontend")],
        custom_skills=["可复现 Notebook"],
        introduction="使用 Python 分析数据",
    )
    for term in ("前端", "编程", "代码", "开发", "python", "NOTEBOOK"):
        assert matches_skill(profile, term)
    assert not matches_skill(profile, "财务")
