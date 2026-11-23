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
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "max-age" in cookie
    assert "no-store" in response.headers["cache-control"]
    assert client.get(f"{BASE}/me").json() == response.json()
    return response.json()["userId"]


def post(client, path, **payload):
    return client.post(f"{BASE}{path}", json=payload, headers={"Origin": ORIGIN})


def publish(client, team_name):
    response = post(
        client,
        "/recruitments",
        competition="  数学建模校赛  ",
        teamName=team_name,
        openings=1,
        skills=["data-analysis", "data-analysis"],
        task="负责清洗问卷数据",
    )
    assert response.status_code == 201, response.text
    assert response.json()["skills"] == ["data-analysis"]
    assert response.json()["competition"] == "数学建模校赛"
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
                "skills": ["data-analysis"],
                "contribution": "  清理和分析问卷数据  ",
                "major": "统计学",
                "experience": "隐藏的虚构经历",
                "publicFields": {"major": True, "grade": False, "experience": False},
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["experience"] == "隐藏的虚构经历"
        assert response.json()["contribution"] == "清理和分析问卷数据"
        public = captain.get(f"{BASE}/profiles/{candidate_id}").json()
        assert public["major"] == "统计学"
        assert {"experience", "grade", "qq", "counterpartQq"}.isdisjoint(public)
        matches = captain.get(f"{BASE}/profiles", params={"skill": "data-analysis"}).json()["items"]
        assert public in matches

        recruitment = publish(captain, "数学建模队")
        assert any(
            item["id"] == recruitment
            for item in candidate.get(
                f"{BASE}/recruitments", params={"skill": "data-analysis"}
            ).json()["items"]
        )
        application = {"kind": "apply", "recruitmentId": recruitment}
        sent = post(candidate, "/intents", **application)
        assert sent.status_code == 201, sent.text
        assert sent.json()["status"] == "pending"
        assert sent.json()["ownerId"] == captain_id
        detail = f"{BASE}/intents/{sent.json()['id']}"
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
