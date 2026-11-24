import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.main import app

BASE = "/api/v1"
ORIGIN = "http://127.0.0.1:5180"
CAPTAIN = "captain"
FIRST = "candidate-a"
THIRD = "candidate-b"


def test_request_validation_and_disabled_demo(monkeypatch):
    monkeypatch.setenv("TEAMUP_ALLOWED_ORIGIN", ORIGIN)
    monkeypatch.setenv("TEAMUP_DEMO_MODE", "false")
    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            invalid = client.post(f"{BASE}/demo/session", json={"persona": CAPTAIN})
            assert invalid.status_code == 403
            disabled = post(client, "/demo/session", persona=CAPTAIN)
            assert disabled.status_code == 404
            assert "error" in disabled.json()
            missing = client.get(f"{BASE}/me")
            assert missing.status_code == 401
            assert "no-store" in missing.headers["cache-control"]
    finally:
        get_settings.cache_clear()


def test_intent_response_examples_match_contract():
    from app.api import schemas

    path = Path(__file__).resolve().parents[2] / "contracts/examples/intent-responses.json"
    examples = json.loads(path.read_text(encoding="utf-8"))
    pending = schemas.Intent.model_validate(examples["pendingForRecipient"])
    assert pending.status == "pending" and pending.canRespond
    accepted = schemas.IntentDetail.model_validate(examples["acceptedDetailForCaptain"])
    assert accepted.status == "accepted" and accepted.counterpartQq.startswith("DEMO-QQ-")
    declined = schemas.IntentDetail.model_validate(examples["declinedDetailForCaptain"])
    assert (
        declined.status == "declined"
        and "counterpartQq" not in examples["declinedDetailForCaptain"]
    )
    assert examples["nonParticipant"]["status"] == 404
    schemas.Error.model_validate(examples["nonParticipant"]["body"])


def test_hidden_account_endpoints_are_disabled_in_demo(monkeypatch):
    monkeypatch.setenv("TEAMUP_AUTH_MODE", "demo")
    monkeypatch.setenv("TEAMUP_DEMO_MODE", "true")
    monkeypatch.setenv("TEAMUP_ALLOWED_ORIGIN", ORIGIN)
    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            assert client.get(f"{BASE}/auth/capabilities").json() == {"mode": "demo"}
            assert (
                post(client, "/auth/login", studentId="0012345678", password="test").status_code
                == 404
            )
            assert post(client, "/auth/register").status_code == 404
            assert post(client, "/auth/password/reset/confirm").status_code == 404
    finally:
        get_settings.cache_clear()


@pytest.fixture
def migrated_database(monkeypatch):
    database_url = os.environ.get("TEAMUP_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEAMUP_TEST_DATABASE_URL to run isolated MySQL tests")
    url = make_url(database_url)
    if url.drivername != "mysql+pymysql" or url.database != "teamup_test":
        pytest.fail("Integration tests require the dedicated MySQL teamup_test database")
    engine = create_engine(url)
    backend = Path(__file__).resolve().parents[1]
    config = Config(backend / "alembic.ini")
    config.set_main_option("script_location", str(backend / "migrations"))
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT DATABASE()")) == "teamup_test"
        assert not inspect(connection).get_table_names(), "Use an empty teamup_test database"

    monkeypatch.setenv("TEAMUP_DB_HOST", url.host or "127.0.0.1")
    monkeypatch.setenv("TEAMUP_DB_PORT", str(url.port or 3306))
    monkeypatch.setenv("TEAMUP_DB_NAME", "teamup_test")
    monkeypatch.setenv("TEAMUP_DB_USER", url.username or "")
    monkeypatch.setenv("TEAMUP_DB_PASSWORD", url.password or "")
    monkeypatch.setenv("TEAMUP_DEMO_MODE", "true")
    monkeypatch.setenv("TEAMUP_SESSION_SECRET", "test-secret-used-only-by-the-integration-suite")
    monkeypatch.setenv("TEAMUP_ALLOWED_ORIGIN", ORIGIN)
    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            assert client.get(f"{BASE}/health/ready").status_code == 503
        command.upgrade(config, "head")
        yield
    finally:
        # This fixture started with an empty schema and only owns its migration tables.
        command.downgrade(config, "base")
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
        engine.dispose()
        get_settings.cache_clear()


def start_session(client, persona):
    response = client.post(
        f"{BASE}/demo/session", headers={"Origin": ORIGIN}, json={"persona": persona}
    )
    assert response.status_code == 200, response.text
    assert response.json()["persona"] == persona
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "max-age" in cookie
    assert "no-store" in response.headers["cache-control"]
    assert client.get(f"{BASE}/me").json() == response.json()
    return response.json()["userId"]


def post(client, path, **payload):
    return client.post(f"{BASE}{path}", json=payload, headers={"Origin": ORIGIN})


def test_student_account_lifecycle(migrated_database, monkeypatch):
    from app.db.session import SessionLocal
    from app.seed import seed
    from app.services.accounts import issue_ticket, set_account_status

    origin = "https://teamup.test"
    student_id = "0012345678"
    password = "Snowy-Lantern-Orbit-921"
    changed_password = "Meadow-Compass-Wave-672"
    monkeypatch.setenv("TEAMUP_AUTH_MODE", "student")
    monkeypatch.setenv("TEAMUP_DEMO_MODE", "false")
    monkeypatch.setenv("TEAMUP_ALLOWED_ORIGIN", origin)
    get_settings.cache_clear()
    seed(foundation_only=True)

    def issue(purpose):
        with SessionLocal() as db:
            return issue_ticket(db, student_id, purpose)

    def send(client, path, **payload):
        return client.post(f"{BASE}{path}", headers={"Origin": origin}, json=payload)

    def login(client, secret):
        return send(client, "/auth/login", studentId=student_id, password=secret)

    activation = issue("activate")
    with TestClient(app, base_url=origin) as student, TestClient(app, base_url=origin) as other:
        assert student.get(f"{BASE}/auth/capabilities").json() == {"mode": "student"}
        assert student.get(f"{BASE}/competitions").status_code == 200
        assert student.get(f"{BASE}/profiles").status_code == 401
        assert send(student, "/demo/session", persona=CAPTAIN).status_code == 404
        first = send(
            student,
            "/auth/register",
            studentId=student_id,
            password=password,
            activationToken=activation,
        )
        assert first.status_code == 201, first.text
        assert student_id not in first.text
        identity = first.json()
        assert identity["kind"] == "student" and "persona" not in identity
        cookie = first.headers["set-cookie"]
        assert "__Host-teamup_account=" in cookie and all(
            p in cookie.lower() for p in ("secure", "httponly", "samesite=strict", "path=/")
        )
        restored = student.get(f"{BASE}/me")
        assert restored.json() == identity
        csrf = restored.headers["X-CSRF-Token"]
        assert student.get(f"{BASE}/me/profile").status_code == 404
        assert student.get(f"{BASE}/profiles").json() == {"items": []}

        duplicate = send(
            other,
            "/auth/register",
            studentId=student_id,
            password=password,
            activationToken=activation,
        )
        assert 400 <= duplicate.status_code < 500
        assert other.get(f"{BASE}/me").status_code == 401

        draft = {
            "nickname": "账号试点同学",
            "college": "统计学院",
            "major": "统计学",
            "grade": "大二",
            "qq": "123456789",
            "contribution": "负责整理数据和检验模型。",
            "skills": ["data-analysis"],
        }
        profile = f"{BASE}/me/profile"
        assert student.put(profile, headers={"Origin": origin}, json=draft).status_code == 403
        saved = student.put(profile, headers={"Origin": origin, "X-CSRF-Token": csrf}, json=draft)
        assert saved.status_code == 200, saved.text
        public = student.get(f"{BASE}/profiles/{identity['userId']}")
        assert (
            public.status_code == 200
            and student_id not in public.text
            and "qq" not in public.json()
        )

        second = login(other, password)
        assert second.status_code == 200, second.text
        reset = issue("reset")
        result = send(
            other,
            "/auth/password/reset/confirm",
            studentId=student_id,
            resetToken=reset,
            password=changed_password,
        )
        assert result.status_code == 204, result.text
        assert student.get(f"{BASE}/me").status_code == 401
        assert other.get(f"{BASE}/me").status_code == 401
        assert login(student, password).status_code == 401
        assert login(student, changed_password).status_code == 200
        csrf = student.get(f"{BASE}/me").headers["X-CSRF-Token"]
        logout = student.post(
            f"{BASE}/auth/logout", headers={"Origin": origin, "X-CSRF-Token": csrf}
        )
        assert logout.status_code == 204, logout.text
        assert student.get(f"{BASE}/me").status_code == 401

        assert login(student, changed_password).status_code == 200
        with SessionLocal() as db:
            set_account_status(db, student_id, "suspended")
        assert student.get(f"{BASE}/me").status_code == 401
        assert login(student, changed_password).status_code == 401
        with SessionLocal() as db:
            set_account_status(db, student_id, "active")
        assert login(student, changed_password).status_code == 200


def publish(client, team_name):
    response = post(
        client,
        "/recruitments",
        competition="  美赛  ",
        teamName=team_name,
        openings=1,
        requirements=[{"skills": ["data-analysis", "data-analysis"]}],
        background="负责清洗问卷数据",
    )
    assert response.status_code == 201, response.text
    assert response.json()["skills"] == ["data-analysis"]
    assert response.json()["competition"] == "美赛"
    assert response.json()["createdAt"].endswith("Z")
    return response.json()["id"]


def test_p0_workflow_and_concurrent_intents(migrated_database):
    from app.seed import seed

    seed()
    with TestClient(app) as captain, TestClient(app) as candidate, TestClient(app) as third:
        assert captain.get(f"{BASE}/health/ready").status_code == 200
        assert len(captain.get(f"{BASE}/recruitments").json()["items"]) == 2
        assert len(captain.get(f"{BASE}/profiles").json()["items"]) == 3
        captain_id = start_session(captain, CAPTAIN)
        candidate_id = start_session(candidate, FIRST)
        third_id = start_session(third, THIRD)

        invalid_origin = captain.post(
            f"{BASE}/demo/session",
            headers={"Origin": "https://other.example"},
            json={"persona": CAPTAIN},
        )
        assert invalid_origin.status_code == 403
        assert "set-cookie" not in invalid_origin.headers
        invalid_post = post(
            captain,
            "/recruitments",
            competition="   ",
            teamName="试填",
            openings=0,
            skills=[],
            task="试填",
        )
        assert invalid_post.status_code == 422
        assert "openings" in invalid_post.json()["error"]["fields"]

        response = candidate.put(
            f"{BASE}/me/profile",
            headers={"Origin": ORIGIN},
            json={
                "skills": ["data-analysis", "data-visualization"],
                "contribution": "  清理和分析问卷数据  ",
                "major": "统计学",
                "college": "统计学院",
                "grade": "大二",
                "qq": candidate.get(f"{BASE}/me/profile").json()["qq"],
                "competitionIntent": "  想参加数学建模比赛  ",
                "projects": [
                    {
                        "competition": "  数学建模校赛  ",
                        "role": "数据分析",
                        "award": "二等奖",
                        "description": "负责清洗问卷数据",
                    }
                ],
                "experience": "隐藏的虚构经历",
                "publicFields": {
                    "college": False,
                    "major": False,
                    "grade": False,
                    "experience": False,
                },
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["experience"] == "隐藏的虚构经历"
        assert response.json()["contribution"] == "清理和分析问卷数据"
        public = captain.get(f"{BASE}/profiles/{candidate_id}").json()
        assert public["college"] == "统计学院"
        assert public["major"] == "统计学"
        assert public["grade"] == "大二"
        assert "competitionIntent" not in public
        own = candidate.get(f"{BASE}/me/profile").json()
        assert own["competitionIntent"] == "想参加数学建模比赛"
        assert {"projects", "experience"}.isdisjoint(public)
        assert own["projects"][0]["competition"] == "数学建模校赛"
        assert own["projects"][0]["award"] == "二等奖"
        own["publicFields"]["experience"] = True
        own.pop("userId")
        own.pop("evidenceIds")
        own["publicFields"]["competitionIntent"] = True
        updated = candidate.put(f"{BASE}/me/profile", headers={"Origin": ORIGIN}, json=own)
        assert updated.status_code == 200, updated.text
        public = captain.get(f"{BASE}/profiles/{candidate_id}").json()
        assert public["competitionIntent"] == "想参加数学建模比赛"
        assert public["projects"] == own["projects"]
        assert public["grade"] == "大二"
        assert {"qq", "counterpartQq"}.isdisjoint(public)
        matches = captain.get(f"{BASE}/profiles", params={"skill": "data-analysis"}).json()["items"]
        summary = {key: value for key, value in public.items() if key != "evidenceIds"}
        assert summary in matches
        tagged = captain.get(f"{BASE}/profiles", params={"skill": "data-visualization"}).json()
        assert summary in tagged["items"]

        recruitment = publish(captain, "数学建模队")
        assert any(
            item["id"] == recruitment
            for item in candidate.get(
                f"{BASE}/recruitments", params={"skill": "data-analysis"}
            ).json()["items"]
        )
        application = {"kind": "apply", "recruitmentId": recruitment}
        too_long = post(candidate, "/intents", **application, message="字" * 301)
        assert too_long.status_code == 422
        application["message"] = "  我可以清洗问卷数据。  "
        sent = post(candidate, "/intents", **application)
        assert sent.status_code == 201, sent.text
        assert sent.json()["status"] == "pending"
        assert "message" not in sent.json()
        assert sent.json()["ownerId"] == captain_id
        assert sent.json()["teamName"] == "数学建模队"
        assert sent.json()["counterpartNickname"] == captain.get(f"{BASE}/me").json()["nickname"]
        received = captain.get(f"{BASE}/me/intents").json()["items"][0]
        assert received["teamName"] == "数学建模队"
        assert "message" not in received
        assert received["counterpartNickname"] == candidate.get(f"{BASE}/me").json()["nickname"]
        detail = f"{BASE}/intents/{sent.json()['id']}"
        assert captain.get(detail).json()["message"] == "我可以清洗问卷数据。"
        assert candidate.get(detail).json()["message"] == "我可以清洗问卷数据。"
        assert (
            post(candidate, "/intents", **{**application, "message": "重复提交"}).status_code == 200
        )
        assert captain.get(detail).json()["message"] == "我可以清洗问卷数据。"
        response_path = f"/intents/{sent.json()['id']}/response"
        assert post(candidate, response_path, decision="accepted").status_code == 403
        assert captain.get(detail).json()["canRespond"] is True
        assert all(
            "counterpartQq" not in client.get(detail).json() for client in [captain, candidate]
        )
        assert third.get(detail).status_code == 404
        assert third.get(f"{BASE}/me/intents").json() == {"items": []}

        assert post(captain, response_path, decision="accepted").status_code == 200
        assert post(captain, response_path, decision="accepted").status_code == 200
        assert post(captain, response_path, decision="declined").status_code == 409
        for client in [captain, candidate]:
            accepted = client.get(detail)
            assert accepted.json()["counterpartQq"].startswith("DEMO-QQ-")
            assert accepted.json()["respondedAt"].endswith("Z")
            assert "no-store" in accepted.headers["cache-control"]
            assert "counterpartQq" not in client.get(f"{BASE}/me/intents").json()["items"][0]
        assert (
            captain.get(detail).json()["counterpartQq"]
            != candidate.get(detail).json()["counterpartQq"]
        )
        assert third.get(detail).status_code == 404
        assert captain.get(f"{BASE}/recruitments/{recruitment}").json()["openings"] == 1
        assert post(candidate, "/intents", **application).status_code == 200

        invitation = {"kind": "invite", "recruitmentId": recruitment, "candidateId": third_id}
        assert post(candidate, "/intents", **invitation).status_code == 403
        invited = post(captain, "/intents", **invitation)
        assert invited.status_code == 201, invited.text
        invite_id = invited.json()["id"]
        assert post(third, f"/intents/{invite_id}/response", decision="declined").status_code == 200
        duplicate = post(captain, "/intents", **invitation)
        assert duplicate.status_code == 200
        assert duplicate.json()["id"] == invite_id
        assert duplicate.json()["status"] == "declined"
        assert "counterpartQq" not in captain.get(f"{BASE}/intents/{invite_id}").json()

        team_path = f"{BASE}/recruitments/{recruitment}"
        visibility_path = f"{team_path}/visibility"
        origin = {"Origin": ORIGIN}
        original_team = captain.get(team_path).json()
        assert candidate.get(f"{BASE}/me/recruitments").json() == {"items": []}
        assert (
            candidate.patch(
                visibility_path, headers=origin, json={"isPublished": False}
            ).status_code
            == 403
        )
        archived = captain.patch(visibility_path, headers=origin, json={"isPublished": False})
        assert archived.status_code == 200 and archived.json()["isPublished"] is False
        assert candidate.get(team_path).status_code == 404
        assert recruitment not in {
            row["id"] for row in candidate.get(f"{BASE}/recruitments").json()["items"]
        }
        assert post(candidate, "/intents", **application).status_code == 409
        assert candidate.get(detail).json()["status"] == "accepted"
        assert any(
            row["id"] == recruitment and not row["isPublished"]
            for row in captain.get(f"{BASE}/me/recruitments").json()["items"]
        )
        draft = {
            "competition": original_team["competition"],
            "teamName": "重新整理后的招募",
            "openings": 2,
            "background": "需要分别负责数据和可视化",
            "requirements": [{"skills": ["data-analysis"]}, {"skills": ["data-visualization"]}],
        }
        assert candidate.put(team_path, headers=origin, json=draft).status_code == 403
        edited = captain.put(team_path, headers=origin, json=draft)
        assert edited.status_code == 200, edited.text
        assert edited.json()["teamNumber"] == original_team["teamNumber"]
        assert edited.json()["isPublished"] is False
        restored = captain.patch(visibility_path, headers=origin, json={"isPublished": True})
        assert restored.status_code == 200 and restored.json()["isPublished"] is True
        assert candidate.get(team_path).json()["teamName"] == draft["teamName"]
        assert candidate.get(detail).json()["teamName"] == draft["teamName"]

        other = publish(captain, "并发验收队")
        barrier = Barrier(2, timeout=10)

        def create_at_once(client, payload):
            barrier.wait()
            return post(client, "/intents", recruitmentId=other, **payload)

        with ThreadPoolExecutor(max_workers=2) as executor:
            apply = executor.submit(create_at_once, candidate, {"kind": "apply"})
            invite = executor.submit(
                create_at_once, captain, {"kind": "invite", "candidateId": candidate_id}
            )
            concurrent = [apply.result(), invite.result()]
        assert sorted(result.status_code for result in concurrent) == [200, 201]
        assert len({result.json()["id"] for result in concurrent}) == 1
        assert len({result.json()["kind"] for result in concurrent}) == 1
        race_winner = next(result.json() for result in concurrent if result.status_code == 201)
        recipient = captain if race_winner["kind"] == "apply" else candidate
        with TestClient(app) as second_recipient:
            start_session(second_recipient, CAPTAIN if race_winner["kind"] == "apply" else FIRST)
            accept_path = f"/intents/{race_winner['id']}/response"

            def respond_at_once(client, decision):
                barrier.wait()
                return post(client, accept_path, decision=decision)

            with ThreadPoolExecutor(max_workers=2) as executor:
                accept = executor.submit(respond_at_once, recipient, "accepted")
                decline = executor.submit(respond_at_once, second_recipient, "declined")
                decisions = [accept.result(), decline.result()]
            assert sorted(result.status_code for result in decisions) == [200, 409]
            assert recipient.get(f"{BASE}/intents/{race_winner['id']}").json()["status"] == next(
                result.json()["status"] for result in decisions if result.status_code == 200
            )

        seed()
        assert candidate.get(f"{BASE}/me/profile").json()["experience"] == "隐藏的虚构经历"
        assert captain.get(detail).json()["status"] == "accepted"
        assert len(captain.get(f"{BASE}/recruitments").json()["items"]) == 4
