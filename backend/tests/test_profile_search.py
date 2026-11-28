from app.services.skill_search import matches_skill


def test_skill_search_matches_presets_aliases_and_descriptions():
    """Search recognizes preset aliases, free text and mixed-case terms."""
    skills = ["development", "frontend"]
    for term in ("前端", "编程", "代码", "开发", "Ｐｙｔｈｏｎ"):
        assert matches_skill(term, skills, descriptions=["使用 Python 分析数据"])
    assert not matches_skill("财务", skills)
