import ast
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic import ValidationError
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


def test_migration_revisions_fit_alembic_version_column():
    versions_dir = Path(__file__).resolve().parents[1] / "migrations" / "versions"
    files = sorted(versions_dir.glob("*.py"))
    assert files
    for migration_file in files:
        tree = ast.parse(migration_file.read_text(encoding="utf-8"), filename=str(migration_file))
        revision = None
        for node in tree.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "revision":
                        revision = ast.literal_eval(node.value)
        assert isinstance(revision, str) and 1 <= len(revision) <= 32, (
            f"{migration_file.name} revision {revision!r} exceeds Alembic VARCHAR(32) limit"
        )


def test_intent_response_examples_match_contract():
    from app.api import schemas

    path = Path(__file__).resolve().parents[2] / "contracts/examples/intent-responses.json"
    examples = json.loads(path.read_text(encoding="utf-8"))
    pending = schemas.Intent.model_validate(examples["pendingForRecipient"])
    assert pending.status == "pending" and pending.canRespond
    accepted = schemas.IntentDetail.model_validate(examples["acceptedDetailForCaptain"])
    assert (
        accepted.status == "accepted"
        and accepted.counterpartQq.startswith("DEMO-QQ-")
        and accepted.responseMessage
    )
    declined = schemas.IntentDetail.model_validate(examples["declinedDetailForCaptain"])
    assert (
        declined.status == "declined"
        and declined.responseMessage
        and "counterpartQq" not in examples["declinedDetailForCaptain"]
    )
    assert schemas.Decision.model_validate(
        {"decision": "accepted", "responseMessage": "  欢迎加入  "}
    ).responseMessage == "欢迎加入"
    with pytest.raises(ValidationError):
        schemas.Decision.model_validate({"decision": "declined", "responseMessage": "字" * 301})
    personal_accepted = schemas.IntentDetail.model_validate(
        examples["acceptedPersonalDetailForSender"]
    )
    assert (
        personal_accepted.kind == "personal"
        and personal_accepted.recruitmentId is None
        and personal_accepted.counterpartQq.startswith("DEMO-QQ-")
    )
    personal_declined = schemas.IntentDetail.model_validate(
        examples["declinedPersonalDetailForSender"]
    )
    assert (
        personal_declined.kind == "personal"
        and personal_declined.status == "declined"
        and "counterpartQq" not in examples["declinedPersonalDetailForSender"]
    )
    expired_personal = schemas.IntentDetail.model_validate(
        examples["expiredAcceptedPersonalDetail"]
    )
    assert (
        expired_personal.status == "accepted"
        and expired_personal.isExpired is True
        and "counterpartQq" not in examples["expiredAcceptedPersonalDetail"]
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
    table_cleanup_order = (
        "team_invitations",
        "team_members",
        "intents",
        "recruitment_skills",
        "profile_skills",
        "profile_evidence",
        "account_sessions",
        "account_audit_events",
        "account_challenges",
        "account_rate_limits",
        "team_number_counters",
        "recruitments",
        "teams",
        "profiles",
        "contacts",
        "student_accounts",
        "skills",
        "users",
    )

    def clear_test_rows() -> None:
        with engine.begin() as connection:
            assert connection.scalar(text("SELECT DATABASE()")) == "teamup_test"
            existing = set(inspect(connection).get_table_names())
            for table_name in table_cleanup_order:
                if table_name in existing:
                    connection.execute(text(f"DELETE FROM `{table_name}`"))

    def drop_residual_tables() -> None:
        with engine.begin() as connection:
            assert connection.scalar(text("SELECT DATABASE()")) == "teamup_test"
            existing = set(inspect(connection).get_table_names())
            for table_name in (*table_cleanup_order, "alembic_version"):
                if table_name in existing:
                    connection.execute(text(f"DROP TABLE IF EXISTS `{table_name}`"))

    failed = False
    try:
        with TestClient(app) as client:
            assert client.get(f"{BASE}/health/ready").status_code == 503
        command.upgrade(config, "head")
        yield
    except BaseException:
        failed = True
        raise
    finally:
        # This fixture started with an empty schema and only owns its migration tables.
        try:
            clear_test_rows()
            command.downgrade(config, "base")
            with engine.begin() as connection:
                connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
        except Exception:
            drop_residual_tables()
            if not failed:
                raise
        finally:
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


def put(client, path, **payload):
    return client.put(f"{BASE}{path}", json=payload, headers={"Origin": ORIGIN})


def delete(client, path):
    return client.delete(f"{BASE}{path}", headers={"Origin": ORIGIN})


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
        openings="1",
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
            openings="人" * 41,
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

        assert (
            post(
                captain, response_path, decision="accepted", responseMessage="字" * 301
            ).status_code
            == 422
        )
        assert (
            post(
                captain, response_path, decision="accepted", responseMessage="  欢迎加入！  "
            ).status_code
            == 200
        )
        assert (
            post(
                captain, response_path, decision="accepted", responseMessage="重复覆盖尝试"
            ).status_code
            == 200
        )
        assert post(captain, response_path, decision="declined").status_code == 409
        for client in [captain, candidate]:
            accepted = client.get(detail)
            assert accepted.json()["responseMessage"] == "欢迎加入！"
            assert accepted.json()["counterpartQq"].startswith("DEMO-QQ-")
            assert accepted.json()["respondedAt"].endswith("Z")
            assert "no-store" in accepted.headers["cache-control"]
            assert "counterpartQq" not in client.get(f"{BASE}/me/intents").json()["items"][0]
            assert "responseMessage" not in client.get(f"{BASE}/me/intents").json()["items"][0]
        assert (
            captain.get(detail).json()["counterpartQq"]
            != candidate.get(detail).json()["counterpartQq"]
        )
        assert third.get(detail).status_code == 404
        assert captain.get(f"{BASE}/recruitments/{recruitment}").json()["openings"] == "1"
        assert post(candidate, "/intents", **application).status_code == 200

        invitation = {"kind": "invite", "recruitmentId": recruitment, "candidateId": third_id}
        assert post(candidate, "/intents", **invitation).status_code == 403
        invited = post(captain, "/intents", **invitation)
        assert invited.status_code == 201, invited.text
        invite_id = invited.json()["id"]
        assert (
            post(
                third,
                f"/intents/{invite_id}/response",
                decision="declined",
                responseMessage="  这轮时间排不开，下次合作  ",
            ).status_code
            == 200
        )
        duplicate = post(captain, "/intents", **invitation)
        assert duplicate.status_code == 409
        assert duplicate.json()["error"]["code"] == "cooldown"
        for client in [captain, third]:
            declined_detail = client.get(f"{BASE}/intents/{invite_id}").json()
            assert declined_detail["responseMessage"] == "这轮时间排不开，下次合作"
            assert "counterpartQq" not in declined_detail
        assert candidate.get(f"{BASE}/intents/{invite_id}").status_code == 404

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
            "openings": "2",
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

        # DEV-03: Personal pairing & two-step follow-up flows
        assert post(candidate, "/intents", kind="personal", candidateId=candidate_id).status_code == 422
        personal_sent = post(
            candidate,
            "/intents",
            kind="personal",
            candidateId=third_id,
            message="先聊聊合作方向",
        )
        assert personal_sent.status_code == 201, personal_sent.text
        personal_id = personal_sent.json()["id"]
        assert personal_sent.json()["kind"] == "personal"
        assert "recruitmentId" not in personal_sent.json()
        assert personal_sent.json()["senderId"] == candidate_id
        assert personal_sent.json()["recipientId"] == third_id
        # Duplicate & reverse personal invite return existing record (200)
        assert (
            post(candidate, "/intents", kind="personal", candidateId=third_id).status_code == 200
        )
        reverse_personal = post(third, "/intents", kind="personal", candidateId=candidate_id)
        assert reverse_personal.status_code == 200 and reverse_personal.json()["id"] == personal_id
        # Non-participant cannot read personal intent
        assert captain.get(f"{BASE}/intents/{personal_id}").status_code == 404
        # Pending personal intent cannot create team invite
        follow_up_draft = {
            "competition": "美赛",
            "teamName": "配对新建小队",
            "openings": "1",
            "background": "配对后创建的新队伍",
            "requirements": [{"skills": ["frontend"]}],
            "message": "正式邀请你加入新队",
        }
        assert (
            post(
                candidate, f"/intents/{personal_id}/create-team-invite", **follow_up_draft
            ).status_code
            == 409
        )
        # Recipient accepts personal intent with optional response
        assert (
            post(
                third,
                f"/intents/{personal_id}/response",
                decision="accepted",
                responseMessage="可以，先加 QQ 沟通",
            ).status_code
            == 200
        )
        for client in [candidate, third]:
            pdetail = client.get(f"{BASE}/intents/{personal_id}").json()
            assert pdetail["responseMessage"] == "可以，先加 QQ 沟通"
            assert pdetail["counterpartQq"].startswith("DEMO-QQ-")
        # Recipient (not original sender) cannot use follow-up create-team-invite
        assert (
            post(
                third, f"/intents/{personal_id}/create-team-invite", **follow_up_draft
            ).status_code
            == 403
        )
        # Path A: Original sender atomically creates team + independent pending team invite
        created_pair_team = post(
            candidate, f"/intents/{personal_id}/create-team-invite", **follow_up_draft
        )
        assert created_pair_team.status_code == 201, created_pair_team.text
        new_team_id = created_pair_team.json()["recruitment"]["id"]
        second_invite = created_pair_team.json()["intent"]
        assert second_invite["kind"] == "invite"
        assert second_invite["status"] == "pending"
        assert second_invite["recruitmentId"] == new_team_id
        assert second_invite["recipientId"] == third_id
        # Second invite declined does NOT affect original accepted personal pairing
        assert (
            post(
                third,
                f"/intents/{second_invite['id']}/response",
                decision="declined",
                responseMessage="这个题目不太契合",
            ).status_code
            == 200
        )
        assert candidate.get(f"{BASE}/intents/{personal_id}").json()["status"] == "accepted"
        assert (
            candidate.get(f"{BASE}/intents/{personal_id}")
            .json()["counterpartQq"]
            .startswith("DEMO-QQ-")
        )
        assert candidate.get(f"{BASE}/recruitments/{new_team_id}").status_code == 200
        # Path B: Existing team invite linked to accepted personal pairing validates target user
        second_team = publish(candidate, "已有配对队伍")
        assert (
            post(
                candidate,
                "/intents",
                kind="invite",
                recruitmentId=second_team,
                candidateId=captain_id,
                sourcePersonalIntentId=personal_id,
            ).status_code
            == 422
        )
        path_b = post(
            candidate,
            "/intents",
            kind="invite",
            recruitmentId=second_team,
            candidateId=third_id,
            sourcePersonalIntentId=personal_id,
            message="邀请加入已有队伍",
        )
        assert path_b.status_code == 201 and path_b.json()["status"] == "pending"

        seed()
        assert candidate.get(f"{BASE}/me/profile").json()["experience"] == "隐藏的虚构经历"
        assert captain.get(detail).json()["status"] == "accepted"
        assert len(captain.get(f"{BASE}/recruitments").json()["items"]) == 6


def parse_utc(raw: str) -> datetime:
    assert raw.endswith("Z"), f"Expected UTC timestamp ending with 'Z', got {raw!r}"
    parsed = datetime.fromisoformat(raw)
    assert parsed.tzinfo == UTC
    return parsed


def test_high_five_lifecycle_cooldown_reinvite_and_candidates(migrated_database, monkeypatch):
    from app.seed import seed
    from app.services import teamup

    seed()
    clock = [datetime(2026, 11, 24, 10, 0, 0)]
    monkeypatch.setattr(teamup, "now", lambda: clock[0])

    with TestClient(app) as captain, TestClient(app) as candidate, TestClient(app) as third:
        start_session(captain, CAPTAIN)
        candidate_id = start_session(candidate, FIRST)
        third_id = start_session(third, THIRD)
        team_a = publish(captain, "生命周期测试队 A")
        team_b = publish(captain, "生命周期测试队 B")

        # 1. Pending expires at exact 7-day boundary (t >= expires_at)
        pending_res = post(
            candidate, "/intents", kind="personal", candidateId=third_id, message="第一轮"
        )
        assert pending_res.status_code == 201
        pending_id = pending_res.json()["id"]
        assert parse_utc(pending_res.json()["expiresAt"]) == datetime(
            2026, 12, 1, 10, 0, 0, tzinfo=UTC
        )
        clock[0] = datetime(2026, 12, 1, 10, 0, 0)  # exact 7 days -> expired
        assert (
            post(third, f"/intents/{pending_id}/response", decision="accepted").status_code == 409
        )
        assert all(
            row["id"] != pending_id for row in candidate.get(f"{BASE}/me/intents").json()["items"]
        )

        # 2. Re-high-five after pending expiry creates an independent record preserving old history
        clock[0] = datetime(2026, 12, 1, 10, 0, 1)
        round2 = post(
            candidate, "/intents", kind="personal", candidateId=third_id, message="第二轮"
        )
        assert round2.status_code == 201
        round2_id = round2.json()["id"]
        assert round2_id != pending_id
        assert candidate.get(f"{BASE}/intents/{pending_id}").json()["message"] == "第一轮"
        assert candidate.get(f"{BASE}/intents/{round2_id}").json()["message"] == "第二轮"

        # 3. Accept recomputes 7-day QQ authorization from actual accept time (day + 2)
        clock[0] = datetime(2026, 12, 3, 12, 0, 0)
        accepted = post(
            third,
            f"/intents/{round2_id}/response",
            decision="accepted",
            responseMessage="同意沟通",
        )
        assert accepted.status_code == 200
        expected_exp = datetime(2026, 12, 10, 12, 0, 0, tzinfo=UTC)
        assert parse_utc(accepted.json()["expiresAt"]) == expected_exp
        # Duplicate accept 1 day later does NOT extend expiresAt
        clock[0] = datetime(2026, 12, 4, 12, 0, 0)
        dup_accept = post(
            third,
            f"/intents/{round2_id}/response",
            decision="accepted",
            responseMessage="覆盖尝试",
        )
        assert dup_accept.status_code == 200
        assert parse_utc(dup_accept.json()["expiresAt"]) == expected_exp
        # Just before boundary (1 second before expiry): QQ still returned & in valid candidates
        clock[0] = datetime(2026, 12, 10, 11, 59, 59)
        assert (
            candidate.get(f"{BASE}/intents/{round2_id}")
            .json()["counterpartQq"]
            .startswith("DEMO-QQ-")
        )
        assert captain.get(f"{BASE}/intents/{round2_id}").status_code == 404
        cands_new_team = candidate.get(f"{BASE}/me/high-five-candidates").json()["items"]
        assert [item["userId"] for item in cands_new_team] == [third_id]

        # 4. Exact expiry boundary (now == expiresAt): QQ revoked, status stays accepted
        clock[0] = datetime(2026, 12, 10, 12, 0, 0)
        expired_detail = candidate.get(f"{BASE}/intents/{round2_id}").json()
        assert expired_detail["status"] == "accepted"
        assert expired_detail["isExpired"] is True
        assert "counterpartQq" not in expired_detail
        assert candidate.get(f"{BASE}/me/high-five-candidates").json()["items"] == []
        round3 = post(
            third, "/intents", kind="personal", candidateId=candidate_id, message="第三轮"
        )
        assert round3.status_code == 201 and round3.json()["id"] != round2_id

        # 5. Declined 7-day cooldown blocks re-high-five until cooldown ends
        clock[0] = datetime(2026, 12, 11, 8, 0, 0)
        declined_res = post(
            candidate,
            f"/intents/{round3.json()['id']}/response",
            decision="declined",
            responseMessage="暂不",
        )
        assert declined_res.status_code == 200
        assert "counterpartQq" not in third.get(f"{BASE}/intents/{round3.json()['id']}").json()
        clock[0] = datetime(2026, 12, 18, 7, 59, 59)
        assert post(candidate, "/intents", kind="personal", candidateId=third_id).status_code == 409
        clock[0] = datetime(2026, 12, 18, 8, 0, 0)
        round4 = post(
            candidate, "/intents", kind="personal", candidateId=third_id, message="冷却后新击掌"
        )
        assert round4.status_code == 201 and round4.json()["id"] != round3.json()["id"]

        # 6. Candidate query scoping & deduplication for existing team
        # By 2026-12-18 (+24d), team_a and team_b published on 2026-11-24 (default 14d) have
        # legitimately expired; republish them via the real API before testing team high-fives.
        repub_a = post(captain, f"/recruitments/{team_a}/republish", durationDays=14)
        assert repub_a.status_code == 200, repub_a.text
        repub_b = post(captain, f"/recruitments/{team_b}/republish", durationDays=14)
        assert repub_b.status_code == 200, repub_b.text

        p_cap_res = post(captain, "/intents", kind="personal", candidateId=candidate_id)
        assert p_cap_res.status_code == 201, p_cap_res.text
        p_cap = p_cap_res.json()["id"]
        assert post(candidate, f"/intents/{p_cap}/response", decision="accepted").status_code == 200

        a_team_a_res = post(candidate, "/intents", kind="apply", recruitmentId=team_a)
        assert a_team_a_res.status_code == 201, a_team_a_res.text
        a_team_a = a_team_a_res.json()["id"]
        assert post(captain, f"/intents/{a_team_a}/response", decision="accepted").status_code == 200

        i_team_b_res = post(
            captain, "/intents", kind="invite", recruitmentId=team_b, candidateId=third_id
        )
        assert i_team_b_res.status_code == 201, i_team_b_res.text
        i_team_b = i_team_b_res.json()["id"]
        assert post(third, f"/intents/{i_team_b}/response", decision="accepted").status_code == 200

        # Non-captain cannot query team_a candidates
        assert (
            candidate.get(
                f"{BASE}/me/high-five-candidates", params={"recruitmentId": team_a}
            ).status_code
            == 403
        )
        # team_a candidates: candidate deduplicated with 2 sources; third excluded (belongs to team_b)
        team_a_cands = captain.get(
            f"{BASE}/me/high-five-candidates", params={"recruitmentId": team_a}
        ).json()["items"]
        assert [item["userId"] for item in team_a_cands] == [candidate_id]
        assert sorted(src["kind"] for src in team_a_cands[0]["sources"]) == ["apply", "personal"]
        # Create-new-team candidates for captain: only personal (candidate), not team_b's third
        new_team_cands = captain.get(f"{BASE}/me/high-five-candidates").json()["items"]
        assert [item["userId"] for item in new_team_cands] == [candidate_id]


def test_recruitment_decoupled_openings_and_requirements(migrated_database):
    from app.seed import seed

    seed()
    with TestClient(app) as captain, TestClient(app) as other:
        start_session(captain, CAPTAIN)
        start_session(other, FIRST)

        # Free-text openings ("2-4人") with 3 independent requirements (decoupled count)
        created = post(
            captain,
            "/recruitments",
            competition="美赛",
            teamName="解耦测试队",
            openings="  2-4人  ",
            background="支持自由文本人数与独立需求管理。",
            requirements=[
                {"skills": ["data-analysis", "statistics"], "expectation": "负责数据清洗"},
                {"skills": ["frontend", "data-analysis"], "expectation": "负责交互可视化"},
                {"skills": ["academic-writing"], "expectation": "负责论文撰写"},
            ],
        )
        assert created.status_code == 201, created.text
        team_id = created.json()["id"]
        assert created.json()["openings"] == "2-4人"
        assert len(created.json()["requirements"]) == 3
        assert created.json()["skills"] == [
            "academic-writing",
            "data-analysis",
            "frontend",
            "statistics",
        ]

        # Non-captain cannot edit
        assert (
            other.put(
                f"{BASE}/recruitments/{team_id}",
                headers={"Origin": ORIGIN},
                json={
                    "competition": "美赛",
                    "teamName": "越权修改",
                    "openings": "若干",
                    "background": "越权",
                    "requirements": [],
                },
            ).status_code
            == 403
        )

        # Delete middle requirement: frontend removed, shared data-analysis retained, openings empty allowed
        edited = captain.put(
            f"{BASE}/recruitments/{team_id}",
            headers={"Origin": ORIGIN},
            json={
                "competition": "美赛",
                "teamName": "解耦测试队",
                "openings": "   ",
                "background": "删除中间需求后保留其余需求与共享技能。",
                "requirements": [
                    {"skills": ["data-analysis", "statistics"], "expectation": "负责数据清洗"},
                    {"skills": ["academic-writing"], "expectation": "负责论文撰写"},
                ],
            },
        )
        assert edited.status_code == 200, edited.text
        assert edited.json()["openings"] is None
        assert len(edited.json()["requirements"]) == 2
        assert edited.json()["skills"] == ["academic-writing", "data-analysis", "statistics"]
        assert all(
            item["id"] != team_id
            for item in captain.get(f"{BASE}/recruitments", params={"skill": "frontend"}).json()["items"]
        )

        # Zero requirements and descriptive text openings ("若干") allowed
        zero_req = captain.put(
            f"{BASE}/recruitments/{team_id}",
            headers={"Origin": ORIGIN},
            json={
                "competition": "美赛",
                "teamName": "解耦测试队",
                "openings": "若干",
                "background": "支持零项需求。",
                "requirements": [],
            },
        )
        assert zero_req.status_code == 200, zero_req.text
        assert zero_req.json()["openings"] == "若干"
        assert zero_req.json()["requirements"] == []
        assert zero_req.json()["skills"] == []

        # Blank requirement item still rejected (422) and openings > 40 chars rejected (422)
        assert (
            post(
                captain,
                "/recruitments",
                competition="美赛",
                openings="2人",
                background="校验空白需求",
                requirements=[{"skills": [], "expectation": "   "}],
            ).status_code
            == 422
        )
        assert (
            post(
                captain,
                "/recruitments",
                competition="美赛",
                openings="人" * 41,
                background="校验超长人数",
                requirements=[],
            ).status_code
            == 422
        )


def test_formal_teams_membership_invitations_and_user_search(migrated_database, monkeypatch):
    from app.seed import seed
    from app.services import teamup

    seed()
    clock = [datetime(2026, 12, 1, 10, 0, 0)]
    monkeypatch.setattr(teamup, "now", lambda: clock[0])

    with TestClient(app) as captain, TestClient(app) as candidate, TestClient(app) as third:
        captain_id = start_session(captain, CAPTAIN)
        candidate_id = start_session(candidate, FIRST)
        third_id = start_session(third, THIRD)

        # 1. Standalone Team without public recruitment: creator is captain, not in /recruitments
        standalone = post(
            captain,
            "/teams",
            competition="美赛",
            teamName="私密筹备小队",
            description="暂不公开发布招募的独立正式队伍。",
            publishRecruitment=False,
        )
        assert standalone.status_code == 201, standalone.text
        standalone_team = standalone.json()["team"]
        assert standalone_team["myRole"] == "captain"
        assert standalone_team["memberCount"] == 1
        assert "recruitment" not in standalone.json()
        assert all(
            item["id"] != standalone_team["id"]
            for item in captain.get(f"{BASE}/recruitments").json()["items"]
        )

        # 2. Empty search query returns [] (never dumps all platform users); non-empty matches
        assert captain.get(f"{BASE}/users/search", params={"q": "   "}).json() == {"items": []}
        found = captain.get(f"{BASE}/users/search", params={"q": "周禾"}).json()["items"]
        assert [item["userId"] for item in found] == [third_id]
        assert "qq" not in found[0]

        # 3. High-five on Dec 1 expires Dec 8; formal team invite sent Dec 6 stays valid until Dec 13
        hf = post(captain, "/intents", kind="personal", candidateId=candidate_id)
        assert hf.status_code == 201
        assert (
            post(candidate, f"/intents/{hf.json()['id']}/response", decision="accepted").status_code
            == 200
        )

        clock[0] = datetime(2026, 12, 6, 10, 0, 0)
        batch_team = post(
            captain,
            "/teams",
            competition="美赛",
            teamName="正式组队验证队",
            description="公开招募并同时邀请多名成员。",
            publishRecruitment=True,
            openings="2-4人",
            requirements=[{"skills": ["data-analysis"], "expectation": "数据分析"}],
            inviteeIds=[candidate_id, third_id],
            inviteMessage="欢迎正式加入队伍",
        )
        assert batch_team.status_code == 201, batch_team.text
        team_id = batch_team.json()["team"]["id"]
        invs = batch_team.json()["invitations"]
        assert len(invs) == 2
        assert batch_team.json()["team"]["memberCount"] == 1  # pending invites != formal members
        inv_cand = next(item for item in invs if item["inviteeId"] == candidate_id)
        inv_third = next(item for item in invs if item["inviteeId"] == third_id)
        assert "counterpartQq" not in candidate.get(f"{BASE}/team-invitations/{inv_cand['id']}").json()
        # Third party cannot read candidate's private invitation
        assert third.get(f"{BASE}/team-invitations/{inv_cand['id']}").status_code == 404
        # Inviter cannot accept own invitation
        assert (
            post(
                captain, f"/team-invitations/{inv_cand['id']}/response", decision="accepted"
            ).status_code
            == 403
        )
        # Non-captain cannot send invitations for team
        assert (
            post(
                candidate, f"/teams/{team_id}/invitations", inviteeIds=[third_id]
            ).status_code
            == 403
        )

        # 4. On Dec 9: original high-five expired (Dec 8), formal invite STILL valid until Dec 13!
        clock[0] = datetime(2026, 12, 9, 10, 0, 0)
        assert candidate.get(f"{BASE}/intents/{hf.json()['id']}").json()["isExpired"] is True
        accepted_inv = post(
            candidate, f"/team-invitations/{inv_cand['id']}/response", decision="accepted"
        )
        assert accepted_inv.status_code == 200 and accepted_inv.json()["status"] == "accepted"
        # Duplicate accept is idempotent and does not duplicate TeamMember
        assert (
            post(
                candidate, f"/team-invitations/{inv_cand['id']}/response", decision="accepted"
            ).status_code
            == 200
        )
        # Candidate now sees team in /me/teams with role=member; recruitment openings/reqs unchanged
        cand_teams = candidate.get(f"{BASE}/me/teams").json()["items"]
        joined_team = next(item for item in cand_teams if item["id"] == team_id)
        assert joined_team["myRole"] == "member"
        assert joined_team["memberCount"] == 2
        assert joined_team["recruitment"]["openings"] == "2-4人"
        assert len(joined_team["recruitment"]["requirements"]) == 1
        assert joined_team["recruitment"]["isPublished"] is True
        # Already-member cannot be re-invited
        assert (
            post(
                captain, f"/teams/{team_id}/invitations", inviteeIds=[candidate_id]
            ).status_code
            == 409
        )

        # 5. Formal invite expires at exact Dec 13 10:00 boundary; re-invite allowed after expiry
        clock[0] = datetime(2026, 12, 13, 10, 0, 0)
        assert (
            post(
                third, f"/team-invitations/{inv_third['id']}/response", decision="accepted"
            ).status_code
            == 409
        )
        # Membership persists even after Dec 13!
        assert any(
            item["id"] == team_id for item in candidate.get(f"{BASE}/me/teams").json()["items"]
        )
        re_inv = post(
            captain,
            f"/teams/{team_id}/invitations",
            inviteeIds=[third_id],
            message="重新邀请",
        )
        assert re_inv.status_code == 201 and re_inv.json()["items"][0]["id"] != inv_third["id"]

        # 6. Declined formal invite enforces 7-day cooldown and does not add member
        re_inv_id = re_inv.json()["items"][0]["id"]
        assert (
            post(
                third, f"/team-invitations/{re_inv_id}/response", decision="declined"
            ).status_code
            == 200
        )
        assert all(
            item["id"] != team_id for item in third.get(f"{BASE}/me/teams").json()["items"]
        )
        assert (
            post(captain, f"/teams/{team_id}/invitations", inviteeIds=[third_id]).status_code
            == 409
        )
        # Standalone team without recruitment can also invite members
        assert (
            post(
                captain,
                f"/teams/{standalone_team['id']}/invitations",
                inviteeIds=[candidate_id],
            ).status_code
            == 201
        )
        assert captain_id == standalone_team["captainId"]


def test_migration_0015_to_0016_preserves_historical_data(monkeypatch):
    database_url = os.environ.get("TEAMUP_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEAMUP_TEST_DATABASE_URL to run isolated MySQL migration tests")
    url = make_url(database_url)
    if url.drivername != "mysql+pymysql" or url.database != "teamup_test":
        pytest.fail("Migration test requires the dedicated MySQL teamup_test database")
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
    get_settings.cache_clear()

    cap_id = "00000000-0000-4000-8000-000000000001"
    cand_id = "00000000-0000-4000-8000-000000000002"
    rec_pub = "10000000-0000-4000-8000-000000000001"
    rec_arch = "10000000-0000-4000-8000-000000000002"
    try:
        command.upgrade(config, "0015_decouple_openings")
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO users (id, nickname) VALUES (:u1, '林舟'), (:u2, '许言')"),
                {"u1": cap_id, "u2": cand_id},
            )
            conn.execute(
                text(
                    "INSERT INTO profiles (user_id, contribution, show_college, show_major, "
                    "show_grade, show_experience, show_competition_intent) "
                    "VALUES (:u1, '队长介绍', 1, 0, 0, 0, 0), (:u2, '同学介绍', 1, 0, 0, 0, 0)"
                ),
                {"u1": cap_id, "u2": cand_id},
            )
            conn.execute(
                text(
                    "INSERT INTO recruitments (id, owner_id, competition, team_name, "
                    "is_published, team_number, openings, task, created_at) VALUES "
                    "(:r1, :cap, '美赛', '历史在招队', 1, '20261124001', '2-4人', '背景1', '2026-11-24 00:00:00'), "
                    "(:r2, :cap, '美赛', '历史下架队', 0, '20261124002', NULL, '背景2', '2026-11-24 01:00:00')"
                ),
                {"r1": rec_pub, "r2": rec_arch, "cap": cap_id},
            )
            conn.execute(
                text(
                    "INSERT INTO intents (id, recruitment_id, candidate_id, sender_id, recipient_id, "
                    "personal_pair_key, active_relation_key, kind, status, created_at, responded_at, expires_at) "
                    "VALUES ('20000000-0000-4000-8000-000000000011', :r1, :cand, :cand, :cap, NULL, "
                    "NULL, 'apply', 'accepted', '2026-11-24 02:00:00', '2026-11-24 03:00:00', '2026-12-01 03:00:00')"
                ),
                {"r1": rec_pub, "cand": cand_id, "cap": cap_id},
            )

        command.upgrade(config, "0016_team_membership")

        with engine.connect() as conn:
            teams = conn.execute(text("SELECT id, captain_id, team_name, team_number FROM teams ORDER BY id")).all()
            assert len(teams) == 2
            assert teams[0] == (rec_pub, cap_id, "历史在招队", "20261124001")
            assert teams[1] == (rec_arch, cap_id, "历史下架队", "20261124002")
            members = conn.execute(text("SELECT team_id, user_id, role FROM team_members ORDER BY team_id")).all()
            # Only captains migrated; historical accepted intent MUST NOT create formal member!
            assert members == [(rec_pub, cap_id, "captain"), (rec_arch, cap_id, "captain")]
            recs = conn.execute(text("SELECT id, team_id, is_published, openings FROM recruitments ORDER BY id")).all()
            assert recs == [(rec_pub, rec_pub, 1, "2-4人"), (rec_arch, rec_arch, 0, None)]
            assert conn.execute(text("SELECT COUNT(*) FROM intents")).scalar() == 1
    finally:
        with engine.begin() as conn:
            for tbl in (
                "team_invitations", "team_members", "intents", "recruitment_skills",
                "profile_skills", "profile_evidence", "recruitments", "teams", "profiles", "users",
            ):
                if tbl in set(inspect(conn).get_table_names()):
                    conn.execute(text(f"DELETE FROM `{tbl}`"))
        command.downgrade(config, "base")
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        engine.dispose()
        get_settings.cache_clear()


def test_team_management_leave_remove_rejoin_disband_and_responses(migrated_database, monkeypatch):
    from app.seed import seed
    from app.services import teamup

    seed()
    clock = [datetime(2026, 12, 10, 10, 0, 0)]
    monkeypatch.setattr(teamup, "now", lambda: clock[0])

    with TestClient(app) as captain, TestClient(app) as member_a, TestClient(app) as member_b:
        captain_id = start_session(captain, CAPTAIN)
        member_a_id = start_session(member_a, FIRST)
        member_b_id = start_session(member_b, THIRD)

        # Create a high-five intent first so we can verify leave/remove/disband never delete it
        hi = post(
            captain,
            "/intents",
            kind="personal",
            candidateId=member_a_id,
            message="先击掌沟通",
        )
        assert hi.status_code == 201
        hi_id = hi.json()["id"]
        assert post(member_a, f"/intents/{hi_id}/response", decision="accepted").status_code == 200
        hi_before = captain.get(f"{BASE}/intents/{hi_id}").json()
        assert hi_before.get("counterpartQq")

        # 1. Create team with recruitment + invite member_a
        created = post(
            captain,
            "/teams",
            competition="美赛",
            teamName="DEV-04D 管理测试队",
            description="用于验证成员管理与解散流程。",
            publishRecruitment=True,
            openings="2-3人",
            requirements=[{"skills": ["frontend"], "expectation": "前端可视化"}],
            inviteeIds=[member_a_id],
            inviteMessage="欢迎加入我们队伍",
        )
        assert created.status_code == 201
        body = created.json()
        team_id = body["team"]["id"]
        rec_id = body["recruitment"]["id"]
        inv_a_id = body["invitations"][0]["id"]

        # Pending invitee is NOT counted as a formal member in /me/teams or public /recruitments
        assert body["team"]["memberCount"] == 1
        public_rec = member_b.get(f"{BASE}/recruitments/{rec_id}").json()
        assert public_rec["memberCount"] == 1
        assert len(public_rec["members"]) == 1
        assert public_rec["members"][0]["userId"] == captain_id
        assert public_rec["members"][0]["role"] == "captain"
        assert "qq" not in public_rec["members"][0]
        assert "experience" not in public_rec["members"][0]

        # 2. >300 char responseMessage rejected (422)
        too_long = post(
            member_a,
            f"/team-invitations/{inv_a_id}/response",
            decision="accepted",
            responseMessage="字" * 301,
        )
        assert too_long.status_code == 422

        # 3. Accept formal invitation with optional responseMessage
        acc_a = post(
            member_a,
            f"/team-invitations/{inv_a_id}/response",
            decision="accepted",
            responseMessage="  很高兴正式加入！  ",
        )
        assert acc_a.status_code == 200
        assert acc_a.json()["responseMessage"] == "很高兴正式加入！"
        assert "counterpartQq" not in acc_a.json()

        # Duplicate accept does NOT overwrite first responseMessage
        dup_a = post(
            member_a,
            f"/team-invitations/{inv_a_id}/response",
            decision="accepted",
            responseMessage="不应覆盖首次回应",
        )
        assert dup_a.status_code == 200
        assert dup_a.json()["responseMessage"] == "很高兴正式加入！"

        # Sender (captain) can inspect team invitations including responseMessage
        team_invs = captain.get(f"{BASE}/teams/{team_id}/invitations")
        assert team_invs.status_code == 200
        assert team_invs.json()["items"][0]["responseMessage"] == "很高兴正式加入！"

        # Non-captain cannot view team invitations, remove members, update team, or disband
        assert member_a.get(f"{BASE}/teams/{team_id}/invitations").status_code == 403
        assert delete(member_a, f"/teams/{team_id}/members/{captain_id}").status_code == 403
        assert (
            put(
                member_a,
                f"/teams/{team_id}",
                competition="美赛",
                teamName="越权修改",
                description="不允许",
            ).status_code
            == 403
        )
        assert post(member_a, f"/teams/{team_id}/disband").status_code == 403

        # Captain cannot leave or remove self
        assert delete(captain, f"/teams/{team_id}/members/me").status_code == 409
        assert delete(captain, f"/teams/{team_id}/members/{captain_id}").status_code == 409

        # Public recruitment now reflects 2 formal members (captain first) without leaking QQ
        public_rec2 = member_b.get(f"{BASE}/recruitments/{rec_id}").json()
        assert public_rec2["memberCount"] == 2
        assert [m["role"] for m in public_rec2["members"]] == ["captain", "member"]
        assert public_rec2["openings"] == "2-3人"
        assert public_rec2["requirements"] == [
            {"skills": ["frontend"], "expectation": "前端可视化"}
        ]

        # 4. Member_a leaves voluntarily -> recruitment & high-five untouched
        left = delete(member_a, f"/teams/{team_id}/members/me")
        assert left.status_code == 204
        assert not any(t["id"] == team_id for t in member_a.get(f"{BASE}/me/teams").json()["items"])
        rec_after_leave = member_b.get(f"{BASE}/recruitments/{rec_id}").json()
        assert rec_after_leave["memberCount"] == 1
        assert rec_after_leave["openings"] == "2-3人"
        assert rec_after_leave["requirements"] == [
            {"skills": ["frontend"], "expectation": "前端可视化"}
        ]
        assert captain.get(f"{BASE}/intents/{hi_id}").json()["expiresAt"] == hi_before["expiresAt"]

        # Re-submitting old accepted invitation MUST NOT restore membership
        assert (
            post(member_a, f"/team-invitations/{inv_a_id}/response", decision="accepted").status_code
            == 200
        )
        assert not any(t["id"] == team_id for t in member_a.get(f"{BASE}/me/teams").json()["items"])

        # 5. Re-invite member_a with a new invitation -> rejoin -> captain removes member_a
        reinv = post(captain, f"/teams/{team_id}/invitations", inviteeIds=[member_a_id])
        assert reinv.status_code == 201
        reinv_id = reinv.json()["items"][0]["id"]
        assert reinv_id != inv_a_id
        assert (
            post(
                member_a,
                f"/team-invitations/{reinv_id}/response",
                decision="accepted",
                responseMessage="   ",
            ).json().get("responseMessage")
            is None
        )
        removed = delete(captain, f"/teams/{team_id}/members/{member_a_id}")
        assert removed.status_code == 200
        assert removed.json()["memberCount"] == 1
        assert not any(t["id"] == team_id for t in member_a.get(f"{BASE}/me/teams").json()["items"])

        # 6. Invite member_b -> decline with responseMessage (no membership created)
        inv_b = post(captain, f"/teams/{team_id}/invitations", inviteeIds=[member_b_id])
        assert inv_b.status_code == 201
        inv_b_id = inv_b.json()["items"][0]["id"]
        dec_b = post(
            member_b,
            f"/team-invitations/{inv_b_id}/response",
            decision="declined",
            responseMessage="本学期时间冲突",
        )
        assert dec_b.status_code == 200
        assert dec_b.json()["responseMessage"] == "本学期时间冲突"
        assert not any(t["id"] == team_id for t in member_b.get(f"{BASE}/me/teams").json()["items"])

        # 7. Invite member_a again (pending), then disband team
        inv_a3 = post(captain, f"/teams/{team_id}/invitations", inviteeIds=[member_a_id])
        assert inv_a3.status_code == 201
        inv_a3_id = inv_a3.json()["items"][0]["id"]

        disbanded = post(captain, f"/teams/{team_id}/disband")
        assert disbanded.status_code == 200
        assert disbanded.json()["status"] == "disbanded"

        # Disbanded team hidden from /me/teams and public /recruitments
        assert not any(t["id"] == team_id for t in captain.get(f"{BASE}/me/teams").json()["items"])
        assert member_b.get(f"{BASE}/recruitments/{rec_id}").status_code == 404

        # Disbanded team rejects pending invitation acceptance and new invitations
        assert (
            post(member_a, f"/team-invitations/{inv_a3_id}/response", decision="accepted")
            .status_code
            == 409
        )
        assert post(captain, f"/teams/{team_id}/invitations", inviteeIds=[member_a_id]).status_code == 409

        # Historical high-five intent and user profile are preserved
        assert captain.get(f"{BASE}/intents/{hi_id}").status_code == 200
        assert member_a.get(f"{BASE}/me/profile").status_code == 200

        # 8. Concurrent accept vs disband never leaves an active membership in a disbanded team
        race_team = post(
            captain,
            "/teams",
            competition="美赛",
            teamName="并发解散竞态队",
            description="测试接受邀请与解散队伍并发竞争。",
            publishRecruitment=False,
            inviteeIds=[member_a_id],
        )
        assert race_team.status_code == 201
        race_team_id = race_team.json()["team"]["id"]
        race_inv_id = race_team.json()["invitations"][0]["id"]

        barrier = Barrier(2)

        def run_accept():
            with TestClient(app) as client:
                start_session(client, FIRST)
                barrier.wait()
                return post(
                    client,
                    f"/team-invitations/{race_inv_id}/response",
                    decision="accepted",
                ).status_code

        def run_disband():
            with TestClient(app) as client:
                start_session(client, CAPTAIN)
                barrier.wait()
                return post(client, f"/teams/{race_team_id}/disband").status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            f_acc = pool.submit(run_accept)
            f_dis = pool.submit(run_disband)
            acc_code, dis_code = f_acc.result(), f_dis.result()

        assert dis_code == 200
        assert acc_code in (200, 409)
        assert not any(
            t["id"] == race_team_id for t in member_a.get(f"{BASE}/me/teams").json()["items"]
        )
        assert not any(
            t["id"] == race_team_id for t in captain.get(f"{BASE}/me/teams").json()["items"]
        )


def test_migration_0016_to_0017_preserves_team_invitations(monkeypatch):
    database_url = os.environ.get("TEAMUP_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEAMUP_TEST_DATABASE_URL to run isolated MySQL migration tests")
    url = make_url(database_url)
    if url.drivername != "mysql+pymysql" or url.database != "teamup_test":
        pytest.fail("Migration test requires the dedicated MySQL teamup_test database")
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
    get_settings.cache_clear()

    cap_id = "11111111-1111-4111-8111-111111111121"
    inv_u = "11111111-1111-4111-8111-111111111122"
    t_id = "22222222-2222-4222-8222-222222222221"
    inv_id = "33333333-3333-4333-8333-333333333321"
    now_str = "2026-12-01 00:00:00"
    exp_str = "2026-12-08 00:00:00"
    cleanup_order = (
        "team_invitations",
        "team_members",
        "intents",
        "recruitment_skills",
        "profile_skills",
        "profile_evidence",
        "account_sessions",
        "account_audit_events",
        "account_challenges",
        "account_rate_limits",
        "team_number_counters",
        "recruitments",
        "teams",
        "profiles",
        "contacts",
        "student_accounts",
        "skills",
        "users",
    )

    failed = False
    try:
        command.upgrade(config, "0016_team_membership")
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO users (id, nickname) VALUES (:a, '队长测试'), (:b, '同学测试')"),
                {"a": cap_id, "b": inv_u},
            )
            conn.execute(
                text(
                    "INSERT INTO teams "
                    "(id, captain_id, competition, team_name, team_number, description, status, created_at) "
                    "VALUES (:id, :cap, '美赛', '迁移测试队', '20261201001', '历史说明', 'active', :now)"
                ),
                {"id": t_id, "cap": cap_id, "now": now_str},
            )
            conn.execute(
                text(
                    "INSERT INTO team_members (team_id, user_id, role, joined_at) "
                    "VALUES (:tid, :cap, 'captain', :now)"
                ),
                {"tid": t_id, "cap": cap_id, "now": now_str},
            )
            conn.execute(
                text(
                    "INSERT INTO team_invitations "
                    "(id, team_id, inviter_id, invitee_id, status, message, created_at, expires_at, active_invite_key) "
                    "VALUES (:id, :tid, :cap, :u, 'pending', '旧邀请', :now, :exp, :key)"
                ),
                {
                    "id": inv_id,
                    "tid": t_id,
                    "cap": cap_id,
                    "u": inv_u,
                    "now": now_str,
                    "exp": exp_str,
                    "key": f"{t_id}:{inv_u}",
                },
            )

        command.upgrade(config, "0017_team_management")
        with engine.connect() as conn:
            cols = {c["name"] for c in inspect(conn).get_columns("team_invitations")}
            assert "response_message" in cols
            row = conn.execute(
                text(
                    "SELECT id, team_id, inviter_id, invitee_id, status, message, "
                    "created_at, expires_at, response_message "
                    "FROM team_invitations WHERE id = :id"
                ),
                {"id": inv_id},
            ).one()
            assert row[0] == inv_id
            assert row[1] == t_id
            assert row[2] == cap_id
            assert row[3] == inv_u
            assert row[4] == "pending"
            assert row[5] == "旧邀请"
            assert row[6] == datetime(2026, 12, 1, 0, 0, 0)
            assert row[7] == datetime(2026, 12, 8, 0, 0, 0)
            assert row[8] is None
            members = conn.execute(
                text("SELECT team_id, user_id, role FROM team_members")
            ).all()
            assert members == [(t_id, cap_id, "captain")]

        command.downgrade(config, "0016_team_membership")
        with engine.connect() as conn:
            cols = {c["name"] for c in inspect(conn).get_columns("team_invitations")}
            assert "response_message" not in cols
    except BaseException:
        failed = True
        raise
    finally:
        try:
            with engine.begin() as conn:
                assert conn.scalar(text("SELECT DATABASE()")) == "teamup_test"
                existing = set(inspect(conn).get_table_names())
                for tbl in cleanup_order:
                    if tbl in existing:
                        conn.execute(text(f"DELETE FROM `{tbl}`"))
            command.downgrade(config, "base")
            with engine.begin() as conn:
                conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        except Exception:
            with engine.begin() as conn:
                assert conn.scalar(text("SELECT DATABASE()")) == "teamup_test"
                existing = set(inspect(conn).get_table_names())
                for tbl in (*cleanup_order, "alembic_version"):
                    if tbl in existing:
                        conn.execute(text(f"DROP TABLE IF EXISTS `{tbl}`"))
            if not failed:
                raise
        finally:
            engine.dispose()
            get_settings.cache_clear()


def test_recruitment_lifecycle_expiry_republish_renew_and_isolation(
    migrated_database, monkeypatch
):
    from datetime import timedelta

    from app.seed import seed
    from app.services import teamup

    clock = [datetime(2026, 12, 1, 8, 0, 0)]
    monkeypatch.setattr(teamup, "now", lambda: clock[0])
    seed()

    with TestClient(app) as captain, TestClient(app) as member_a, TestClient(app) as outsider:
        start_session(captain, CAPTAIN)
        member_a_id = start_session(member_a, FIRST)
        start_session(outsider, THIRD)

        # A. Create team with 7-day duration; invalid duration rejected (422)
        bad_dur = post(
            captain,
            "/teams",
            competition="美赛",
            teamName="非法期限队",
            description="测试非法期限",
            publishRecruitment=True,
            durationDays=10,
        )
        assert bad_dur.status_code == 422

        created_7 = post(
            captain,
            "/teams",
            competition="美赛",
            teamName="七天招募测试队",
            description="验证 7 天逻辑到期与续期。",
            publishRecruitment=True,
            durationDays=7,
            openings="2人",
            requirements=[{"skills": ["frontend"], "expectation": "前端"}],
        )
        assert created_7.status_code == 201
        rec_7 = created_7.json()["recruitment"]
        team_7_id = created_7.json()["team"]["id"]
        rec_7_id = rec_7["id"]
        assert rec_7["status"] == "active"
        assert rec_7["isPubliclyActive"] is True
        assert rec_7["durationDays"] == 7
        orig_pub = parse_utc(rec_7["publishedAt"])
        orig_exp = parse_utc(rec_7["expiresAt"])
        assert orig_exp - orig_pub == timedelta(days=7)

        # Standalone team without recruitment does not start a countdown
        standalone = post(
            captain,
            "/teams",
            competition="美赛",
            teamName="无招募独立队",
            description="不发布招募",
            publishRecruitment=False,
        )
        assert standalone.status_code == 201
        assert standalone.json().get("recruitment") is None

        # Before expiry: publicly visible & outsider can apply; member_a joins formally
        assert outsider.get(f"{BASE}/recruitments/{rec_7_id}").status_code == 200
        hi_apply = post(outsider, "/intents", kind="apply", recruitmentId=rec_7_id, message="申请")
        assert hi_apply.status_code == 201
        hi_apply_id = hi_apply.json()["id"]

        inv_a = post(captain, f"/teams/{team_7_id}/invitations", inviteeIds=[member_a_id])
        assert inv_a.status_code == 201
        inv_a_id = inv_a.json()["items"][0]["id"]
        assert post(member_a, f"/team-invitations/{inv_a_id}/response", decision="accepted").status_code == 200

        # D. Ordinary edit & member join/leave do NOT change publishedAt or expiresAt
        clock[0] = datetime(2026, 12, 3, 8, 0, 0)
        edited = put(
            captain,
            f"/recruitments/{rec_7_id}",
            competition="美赛",
            teamName="七天招募测试队-更新",
            openings="3人",
            background="修改文案与需求不延长有效期",
            requirements=[{"skills": ["backend"], "expectation": "后端"}],
        )
        assert edited.status_code == 200
        assert parse_utc(edited.json()["publishedAt"]) == orig_pub
        assert parse_utc(edited.json()["expiresAt"]) == orig_exp

        # C. Renew preserves remaining time & expectedExpiresAt prevents duplicate double-add
        # Non-captain cannot renew
        assert (
            post(member_a, f"/recruitments/{rec_7_id}/renew", durationDays=7).status_code == 403
        )
        renewed = post(
            captain,
            f"/recruitments/{rec_7_id}/renew",
            durationDays=7,
            expectedExpiresAt=rec_7["expiresAt"],
        )
        assert renewed.status_code == 200
        new_exp = parse_utc(renewed.json()["expiresAt"])
        assert new_exp == orig_exp + timedelta(days=7)
        assert parse_utc(renewed.json()["publishedAt"]) == orig_pub

        # Stale/duplicate renew with previous expectedExpiresAt rejected (409)
        dup_renew = post(
            captain,
            f"/recruitments/{rec_7_id}/renew",
            durationDays=7,
            expectedExpiresAt=rec_7["expiresAt"],
        )
        assert dup_renew.status_code == 409

        # B. Exact expiry boundary: immediately hidden from public list/detail & blocks new intents
        clock[0] = datetime(2026, 12, 15, 8, 0, 0)
        assert outsider.get(f"{BASE}/recruitments/{rec_7_id}").status_code == 404
        assert not any(
            r["id"] == rec_7_id for r in outsider.get(f"{BASE}/recruitments").json()["items"]
        )
        expired_apply = post(outsider, "/intents", kind="apply", recruitmentId=rec_7_id)
        assert expired_apply.status_code == 409

        # Existing team, members, pending intent, and formal invitations are unaffected by expiry
        my_teams = captain.get(f"{BASE}/me/teams").json()["items"]
        t7 = next(t for t in my_teams if t["id"] == team_7_id)
        assert t7["status"] == "active"
        assert t7["memberCount"] == 2
        assert t7["recruitment"]["status"] == "expired"
        assert t7["recruitment"]["isPubliclyActive"] is False
        # Existing pending intent (within its own 7-day window? move clock back inside 7d? no, created Dec 1 so expired Dec 8; check record still exists)
        assert captain.get(f"{BASE}/intents/{hi_apply_id}").status_code == 200
        # Renew on expired recruitment rejected (must republish)
        assert (
            post(captain, f"/recruitments/{rec_7_id}/renew", durationDays=14).status_code == 409
        )

        # C. Republish expired recruitment reuses same Recruitment & Team with fresh 30-day window
        repub = post(captain, f"/recruitments/{rec_7_id}/republish", durationDays=30)
        assert repub.status_code == 200
        assert repub.json()["id"] == rec_7_id
        assert repub.json()["teamId"] == team_7_id
        assert repub.json()["status"] == "active"
        assert parse_utc(repub.json()["expiresAt"]) == datetime(2027, 1, 14, 8, 0, 0, tzinfo=UTC)
        assert outsider.get(f"{BASE}/recruitments/{rec_7_id}").status_code == 200

        # Disbanded team cannot republish recruitment
        assert post(captain, f"/teams/{team_7_id}/disband").status_code == 200
        assert (
            post(captain, f"/recruitments/{rec_7_id}/republish", durationDays=14).status_code
            == 409
        )

        # Seed idempotency does not extend an existing recruitment's expires_at
        before_seed_list = outsider.get(f"{BASE}/recruitments").json()["items"]
        seed()
        after_seed_list = outsider.get(f"{BASE}/recruitments").json()["items"]
        assert {r["id"]: r["expiresAt"] for r in before_seed_list} == {
            r["id"]: r["expiresAt"] for r in after_seed_list
        }


def test_migration_0017_to_0018_backfills_active_recruitments(monkeypatch):
    database_url = os.environ.get("TEAMUP_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEAMUP_TEST_DATABASE_URL to run isolated MySQL migration tests")
    url = make_url(database_url)
    if url.drivername != "mysql+pymysql" or url.database != "teamup_test":
        pytest.fail("Migration test requires the dedicated MySQL teamup_test database")
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
    get_settings.cache_clear()

    cap_id = "11111111-1111-4111-8111-111111111131"
    t_pub = "22222222-2222-4222-8222-222222222231"
    t_unpub = "22222222-2222-4222-8222-222222222232"
    t_dis = "22222222-2222-4222-8222-222222222233"
    now_str = "2026-11-01 00:00:00"
    cleanup_order = (
        "team_invitations",
        "team_members",
        "intents",
        "recruitment_skills",
        "profile_skills",
        "profile_evidence",
        "account_sessions",
        "account_audit_events",
        "account_challenges",
        "account_rate_limits",
        "team_number_counters",
        "recruitments",
        "teams",
        "profiles",
        "contacts",
        "student_accounts",
        "skills",
        "users",
    )

    failed = False
    try:
        command.upgrade(config, "0017_team_management")
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO users (id, nickname) VALUES (:a, '迁移队长')"),
                {"a": cap_id},
            )
            conn.execute(
                text(
                    "INSERT INTO teams "
                    "(id, captain_id, competition, team_name, team_number, description, status, created_at) VALUES "
                    "(:t1, :cap, '美赛', '公开老队', '20261101001', '说明1', 'active', :now), "
                    "(:t2, :cap, '美赛', '下架老队', '20261101002', '说明2', 'active', :now), "
                    "(:t3, :cap, '美赛', '解散老队', '20261101003', '说明3', 'disbanded', :now)"
                ),
                {"t1": t_pub, "t2": t_unpub, "t3": t_dis, "cap": cap_id, "now": now_str},
            )
            conn.execute(
                text(
                    "INSERT INTO recruitments "
                    "(id, team_id, owner_id, competition, team_name, is_published, team_number, openings, task, created_at) VALUES "
                    "(:t1, :t1, :cap, '美赛', '公开老队', 1, '20261101001', '2人', '说明1', :now), "
                    "(:t2, :t2, :cap, '美赛', '下架老队', 0, '20261101002', '2人', '说明2', :now), "
                    "(:t3, :t3, :cap, '美赛', '解散老队', 1, '20261101003', '2人', '说明3', :now)"
                ),
                {"t1": t_pub, "t2": t_unpub, "t3": t_dis, "cap": cap_id, "now": now_str},
            )

        command.upgrade(config, "0018_recruitment_lifecycle")
        with engine.connect() as conn:
            rows = {
                row[0]: row[1:]
                for row in conn.execute(
                    text(
                        "SELECT id, is_published, published_at, expires_at, duration_days "
                        "FROM recruitments"
                    )
                ).all()
            }
            # Active published recruitment receives 14-day default validity
            assert rows[t_pub][0] == 1
            assert rows[t_pub][1] is not None
            assert rows[t_pub][2] is not None
            assert rows[t_pub][3] == 14
            # Unpublished recruitment stays unpublished with NULL timestamps
            assert rows[t_unpub] == (0, None, None, None)
            # Disbanded team recruitment does not receive new validity
            assert rows[t_dis][1] is None and rows[t_dis][2] is None

        command.downgrade(config, "0017_team_management")
        with engine.connect() as conn:
            cols = {c["name"] for c in inspect(conn).get_columns("recruitments")}
            assert "expires_at" not in cols
            assert "published_at" not in cols
            assert "duration_days" not in cols
    except BaseException:
        failed = True
        raise
    finally:
        try:
            with engine.begin() as conn:
                assert conn.scalar(text("SELECT DATABASE()")) == "teamup_test"
                existing = set(inspect(conn).get_table_names())
                for tbl in cleanup_order:
                    if tbl in existing:
                        conn.execute(text(f"DELETE FROM `{tbl}`"))
            command.downgrade(config, "base")
            with engine.begin() as conn:
                conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        except Exception:
            with engine.begin() as conn:
                assert conn.scalar(text("SELECT DATABASE()")) == "teamup_test"
                existing = set(inspect(conn).get_table_names())
                for tbl in (*cleanup_order, "alembic_version"):
                    if tbl in existing:
                        conn.execute(text(f"DROP TABLE IF EXISTS `{tbl}`"))
            if not failed:
                raise
        finally:
            engine.dispose()
            get_settings.cache_clear()
