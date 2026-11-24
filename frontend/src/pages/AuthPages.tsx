import { useEffect, useState, type FormEvent } from "react";
import { authApi, type Me } from "../api/client";
import { Button } from "../ui/Button";
import { Alert, Heading, useAction, type Navigate } from "./shared";
import "./auth.css";

export type AuthPage =
  "login" | "register" | "reset" | "security" | "onboarding";

function returnToCenter() {
  const target = new URLSearchParams(window.location.search).get("returnTo");
  const allowed =
    /^\/(teams|people|center(?:\/(?:profile|resume|security))?)(?:\?.*)?$/;
  return target && allowed.test(target) ? target : "/center";
}

export default function AuthPages({
  page,
  me,
  setMe,
  navigate,
}: {
  page: AuthPage;
  me: Me | null;
  setMe: (me: Me | null) => void;
  navigate: Navigate;
}) {
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const { run, busy, error, fieldError } = useAction();
  const isStudent = me && "kind" in me && me.kind === "student";
  const needsToken = page === "register" || page === "reset";
  const changed =
    new URLSearchParams(window.location.search).get("changed") === "1";
  useEffect(() => {
    if (token && window.location.hash) {
      history.replaceState(
        history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [token]);
  const title = {
    login: "登录账号",
    register: "注册账号",
    reset: "重置密码",
    security: "账号安全",
    onboarding: "完善个人名片",
  }[page];
  function returnToLogin() {
    setMe(null);
    navigate("/login?changed=1", undefined, true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (page === "login")
      void run(
        () => authApi.login({ studentId, password }),
        (user) => {
          setMe(user);
          navigate(returnToCenter(), undefined, true);
        },
      );
    if (page === "register")
      void run(
        () => authApi.register({ studentId, password, activationToken: token }),
        (user) => {
          setMe(user);
          navigate("/onboarding", undefined, true);
        },
      );
    if (page === "reset")
      void run(
        () => authApi.reset({ studentId, resetToken: token, password }),
        returnToLogin,
      );
    if (page === "security")
      void run(
        () => authApi.change({ currentPassword, password }),
        returnToLogin,
      );
  }
  return (
    <div className="auth-page">
      <Heading title={title} />
      {page === "onboarding" && isStudent ? (
        <div className="auth-card">
          <p>填一张名片，让队长了解你的技能。你也可以之后在个人中心补填。</p>
          <div className="form-actions">
            <Button onClick={() => navigate("/center/profile")}>
              完善个人名片
            </Button>
            <button
              className="back"
              onClick={() => navigate("/center", undefined, true)}
            >
              稍后再说
            </button>
          </div>
          <button className="back" onClick={() => navigate("/center/security")}>
            账号安全
          </button>
        </div>
      ) : (page === "security" || page === "onboarding") && !isStudent ? (
        <div className="auth-card">
          <p>请先登录学生账号。</p>
          <button
            className="back"
            onClick={() => navigate("/login?returnTo=%2Fcenter%2Fsecurity")}
          >
            前往登录
          </button>
        </div>
      ) : needsToken && !token ? (
        <div className="auth-card">
          <p>
            {page === "register"
              ? "请联系活动负责人核验学号，领取一次性注册链接。"
              : "请联系活动负责人核验学号，领取一次性密码重置链接。"}
          </p>
          <button className="back" onClick={() => navigate("/login")}>
            返回登录
          </button>
        </div>
      ) : (
        <div className="auth-card">
          {page === "security" && <p>当前账号：{me?.nickname}</p>}
          <Alert message={error} />
          {page === "login" && changed && (
            <p role="status">密码已更新，请使用新密码登录。</p>
          )}
          <form onSubmit={submit} className="auth-form">
            {page !== "security" && (
              <label>
                学号
                <input
                  name="studentId"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={32}
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                />
                {fieldError("studentId")}
              </label>
            )}
            {page === "security" && (
              <label>
                当前密码
                <input
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                {fieldError("currentPassword")}
              </label>
            )}
            <label>
              {page === "login" || page === "register"
                ? "TeamUP 密码"
                : "新密码"}
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete={
                  page === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={page === "login" ? undefined : 15}
                maxLength={128}
                aria-describedby={
                  page === "login" ? undefined : "password-hint"
                }
                required
              />
              {page !== "login" && (
                <small id="password-hint">
                  请设置独立的密码，至少 15 个字符。
                </small>
              )}
              {fieldError("password")}
            </label>
            <button
              type="button"
              className="back"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? "隐藏密码" : "显示密码"}
            </button>
            <Button disabled={busy} type="submit">
              {busy
                ? "提交中…"
                : page === "login"
                  ? "登录"
                  : page === "register"
                    ? "注册"
                    : page === "reset"
                      ? "重置密码"
                      : "更新密码"}
            </Button>
          </form>
          <div className="auth-links">
            {page !== "security" && page !== "login" && (
              <button className="back" onClick={() => navigate("/login")}>
                登录
              </button>
            )}
            {page === "login" && (
              <>
                <button className="back" onClick={() => navigate("/register")}>
                  注册账号
                </button>
                <button
                  className="back"
                  onClick={() => navigate("/reset-password")}
                >
                  重置密码
                </button>
              </>
            )}
            {page === "security" && (
              <>
                <button className="back" onClick={() => navigate("/center")}>
                  返回个人中心
                </button>
                <button
                  className="back"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => authApi.logout(),
                      () => {
                        setMe(null);
                        navigate("/login", undefined, true);
                      },
                    )
                  }
                >
                  退出登录
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
