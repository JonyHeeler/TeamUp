import { Toaster } from "sonner";
import { usePageNavigation } from "./ui/usePageNavigation";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  api,
  authApi,
  type AuthMode,
  type Me,
  type Persona,
} from "./api/client";
import { copy as t } from "./copy";
import { BrandMark } from "./Welcome";
import WelcomePage from "./pages/WelcomePage";
import AboutPage from "./pages/AboutPage";
import TeamsPage from "./pages/TeamsPage";
import PeoplePage from "./pages/PeoplePage";
import CenterPage from "./pages/CenterPage";
import EditProfilePage from "./pages/EditProfilePage";
import ResumePage from "./pages/ResumePage";
import CompetitionPage from "./pages/CompetitionPage";
import AuthPages, { type AuthPage } from "./pages/AuthPages";
import {
  Feedback,
  Heading,
  describeError,
  type Navigate,
} from "./pages/shared";
import "./style.css";
import "./ui/motion.css";

const pages = new Map([
  ["/about", "about"],
  ["/teams", "teams"],
  ["/teams/new", "center"],
  ["/people", "people"],
  ["/center", "center"],
  ["/center/profile", "profile"],
  ["/center/resume", "resume"],
]);
const accountPages = new Map<string, AuthPage>([
  ["/login", "login"],
  ["/register", "register"],
  ["/reset-password", "reset"],
  ["/center/security", "security"],
  ["/onboarding", "onboarding"],
]);

export default function App() {
  const { location, setLocation, move, focusHeading } = usePageNavigation();
  const [me, setMe] = useState<Me | null>(null);
  const mock = import.meta.env.VITE_TEAMUP_MOCK === "true";
  const [mode, setMode] = useState<AuthMode | null>(mock ? "demo" : null);
  const [restoring, setRestoring] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const switchingRef = useRef(false);
  const [path, search] = location.href.split("?");
  const accountPage = accountPages.get(path);
  const competitionPageId = path.match(
    /^\/competitions\/(mcm-icm|ai-agent-campus)$/,
  )?.[1];
  const page = competitionPageId
    ? "competition"
    : (accountPage ?? pages.get(path) ?? "welcome");
  const competitionId = new URLSearchParams(search).get("competition") ?? "";

  useEffect(() => {
    let active = true;
    if (!mock) {
      void authApi.capabilities().then(
        (result) => {
          if (active) setMode(result.mode);
        },
        () => {
          if (active) setMode((current) => current ?? "demo");
        },
      );
    }
    void api
      .me()
      .then(
        (user) => {
          if (active) {
            setMe(user);
            if ("kind" in user && user.kind === "student") setMode("student");
          }
        },
        () => {},
      )
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [mock]);

  useEffect(() => {
    if (focusHeading.current && !switching) {
      document
        .querySelector<HTMLElement>("main h1")
        ?.focus({ preventScroll: true });
      focusHeading.current = false;
    }
  }, [path, switching]);

  const navigate: Navigate = (href, notice, replace = false) =>
    move(href, notice, replace ? "replace" : "push");

  async function switchPersona(next: Persona) {
    if (switchingRef.current || next === me?.persona) return;
    switchingRef.current = true;
    setSwitching(true);
    setSessionError("");
    try {
      setMe(await api.session(next));
      setLocation((current) => ({ ...current, notice: undefined }));
    } catch (error) {
      setSessionError(describeError(error));
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }

  const activeTab =
    page === "teams"
      ? 1
      : page === "people"
        ? 2
        : ["center", "profile", "resume", "security", "onboarding"].includes(
              page,
            )
          ? 3
          : 0;
  const props = { me, navigate };
  const sessionPage =
    ["people", "profile", "resume", "center"].includes(page) ||
    (mode !== "demo" && page === "teams");
  const loading =
    switching ||
    ((restoring || mode === null) && (sessionPage || Boolean(accountPage)));
  const requiresLogin = mode === "student" && sessionPage && !me;

  return (
    <>
      <header className="topbar">
        <div className="toolbar">
          <button
            className="brand"
            aria-label={t.brand + " · " + t.brandEnglish}
            onClick={(event) =>
              move("/", undefined, "push", event.detail !== 0)
            }
          >
            <span className="brand-mark" aria-hidden="true">
              <BrandMark />
            </span>
            <span className="brand-wordmark">
              {t.brand}
              <span lang="en">{t.brandEnglish}</span>
            </span>
          </button>
          <nav aria-label={t.navigation} data-tab={activeTab}>
            <span className="nav-indicator" aria-hidden="true" />
            <button
              aria-current={
                ["welcome", "competition", "about"].includes(page)
                  ? "page"
                  : undefined
              }
              onClick={(event) =>
                move("/", undefined, "push", event.detail !== 0)
              }
            >
              {t.welcome}
            </button>
            <button
              aria-current={page === "teams" ? "page" : undefined}
              onClick={(event) =>
                move("/teams", undefined, "push", event.detail !== 0)
              }
            >
              {t.teams}
            </button>
            <button
              aria-current={page === "people" ? "page" : undefined}
              onClick={(event) =>
                move("/people", undefined, "push", event.detail !== 0)
              }
            >
              {t.people}
            </button>
            <button
              aria-current={
                [
                  "center",
                  "profile",
                  "resume",
                  "security",
                  "onboarding",
                ].includes(page)
                  ? "page"
                  : undefined
              }
              onClick={(event) =>
                move("/center", undefined, "push", event.detail !== 0)
              }
            >
              {t.center}
            </button>
          </nav>
          <div className="toolbar-actions">
            {mode === "demo" ? (
              <select
                aria-label={t.persona}
                className="persona"
                value={me?.persona ?? ""}
                disabled={restoring || switching}
                onChange={(event) =>
                  void switchPersona(event.target.value as Persona)
                }
              >
                <option value="" disabled>
                  {t.choosePersona}
                </option>
                <option value="captain">
                  {t.captain}
                  {me?.persona === "captain" && me ? " · " + me.nickname : ""}
                </option>
                <option value="candidate-a">
                  {t.candidateA}
                  {me?.persona === "candidate-a" && me
                    ? " · " + me.nickname
                    : ""}
                </option>
                <option value="candidate-b">
                  {t.candidateB}
                  {me?.persona === "candidate-b" && me
                    ? " · " + me.nickname
                    : ""}
                </option>
              </select>
            ) : me && "kind" in me && me.kind === "student" ? (
              <span>{me.nickname}</span>
            ) : null}
          </div>
        </div>
      </header>
      <div className="page-viewport">
        <main
          className={page === "welcome" ? "welcome-page" : "workspace"}
          aria-busy={loading}
        >
          <Feedback
            error={sessionError}
            onDismiss={() => setSessionError("")}
          />
          {loading ? (
            <p className="empty" role="status">
              {t.loading}
            </p>
          ) : accountPage && mode !== "student" ? (
            <Heading title="当前环境未开放账号入口" />
          ) : requiresLogin ? (
            <>
              <Heading
                title={
                  page === "people"
                    ? t.people
                    : page === "teams"
                      ? t.teams
                      : t.center
                }
              />
              <p className="empty">登录学生账号后可使用此功能。</p>
            </>
          ) : (
            <Fragment key={`${me?.userId ?? ""}:${page}`}>
              {accountPage && (
                <AuthPages
                  page={accountPage}
                  me={me}
                  setMe={(user) => {
                    setMe(user);
                    if (user && "kind" in user && user.kind === "student")
                      setMode("student");
                  }}
                  navigate={navigate}
                />
              )}
              {page === "welcome" && <WelcomePage navigate={navigate} />}
              {page === "about" && <AboutPage navigate={navigate} />}
              {page === "competition" && competitionPageId && (
                <CompetitionPage id={competitionPageId} navigate={navigate} />
              )}
              {page === "resume" && <ResumePage {...props} />}
              {page === "teams" && (
                <TeamsPage {...props} competitionId={competitionId} />
              )}
              {page === "people" && <PeoplePage me={me} />}
              {page === "center" && (
                <CenterPage {...props} arrival={location.notice} />
              )}
              {page === "profile" && (
                <EditProfilePage {...props} updateMe={setMe} />
              )}
            </Fragment>
          )}
        </main>
      </div>
      <Toaster
        position="bottom-center"
        containerAriaLabel="操作提醒"
        className="app-toaster"
        duration={3300}
        closeButton
        toastOptions={{ closeButtonAriaLabel: t.close }}
      />
    </>
  );
}
