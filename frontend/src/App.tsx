import { ActionToaster, showToast } from "./ui/ActionToast";
import { usePageNavigation } from "./ui/usePageNavigation";
import { useCenterNavigation } from "./ui/useCenterNavigation";
import { useCenterDashboard } from "./pages/centerData";
import { Fragment, lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  api,
  authApi,
  type AuthMode,
  type Me,
  type Persona,
} from "./api/client";
import { copy as t } from "./copy";
import AppHeader from "./ui/AppHeader";
import WelcomePage from "./pages/WelcomePage";
import { LoadingStatus } from "./pages/LoadingStatus";
import { useTeamDiscovery } from "./pages/teamDiscovery";
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

const RhythmGame = lazy(() => import("./rhythm/RhythmGame"));

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

/** 管理会话、路由以及页面切换。 */
export default function App() {
  const {
    location,
    setLocation,
    move: movePage,
    focusHeading,
  } = usePageNavigation();
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
  const discovery = useTeamDiscovery({
    teamView:
      path !== "/rhythm" &&
      ["welcome", "about", "competition", "teams"].includes(page)
        ? page
        : undefined,
    showPeople: page === "people",
    scope:
      !restoring && !switching && (mode === "demo" || me)
        ? [mode, me?.userId].join(":")
        : undefined,
  });
  const centerUserId = restoring || switching ? undefined : me?.userId;
  const dashboard = useCenterDashboard(
    centerUserId,
    page === "center",
    path !== "/rhythm" && ["welcome", "teams", "people"].includes(page),
  );
  const { navigate: move, cancel: cancelPendingCenter } = useCenterNavigation(
    movePage,
    centerUserId && !dashboard.data ? dashboard.refresh : undefined,
  );

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

  /** 切换页面，按需替换当前历史记录。 */
  const navigate: Navigate = (href, notice, replace = false) =>
    move(href, notice, replace ? "replace" : "push");

  /** 切换演示身份并清理上一个身份的提示。 */
  async function switchPersona(next: Persona) {
    if (switchingRef.current || next === me?.persona) return;
    cancelPendingCenter();
    switchingRef.current = true;
    setSwitching(true);
    setSessionError("");
    try {
      setMe(await api.session(next));
      setLocation((current) => ({ ...current, notice: undefined }));
      showToast("已切换演示身份", "success");
    } catch (error) {
      setSessionError(describeError(error));
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }

  const props = { me, navigate };
  const sessionPage =
    ["people", "profile", "resume", "center"].includes(page) ||
    (mode !== "demo" && page === "teams");
  const loading =
    switching ||
    ((restoring || mode === null) && (sessionPage || Boolean(accountPage)));
  const requiresLogin = mode === "student" && sessionPage && !me;

  if (path === "/rhythm") {
    return (
      <Suspense
        fallback={
          <main className="workspace" aria-busy="true">
            {t.loading}
          </main>
        }
      >
        <RhythmGame exit={() => move("/", undefined, "push", false)} />
      </Suspense>
    );
  }

  return (
    <>
      <AppHeader
        page={page}
        mode={mode}
        me={me}
        restoring={restoring}
        switching={switching}
        move={move}
        switchPersona={switchPersona}
      />
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
            <LoadingStatus />
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
              {page === "welcome" && (
                <WelcomePage navigate={navigate} discovery={discovery} />
              )}
              {page === "about" && <AboutPage navigate={navigate} />}
              {page === "competition" && competitionPageId && (
                <CompetitionPage id={competitionPageId} navigate={navigate} />
              )}
              {page === "resume" && <ResumePage {...props} />}
              {page === "teams" && (
                <TeamsPage
                  {...props}
                  competitionId={competitionId}
                  discovery={discovery}
                />
              )}
              {page === "people" && (
                <PeoplePage me={me} unfiltered={discovery.profiles} />
              )}
              {page === "center" && (
                <CenterPage
                  {...props}
                  dashboard={dashboard}
                  arrival={location.notice}
                  invalidateProfiles={discovery.invalidateProfiles}
                  invalidateRecruitments={discovery.invalidateRecruitments}
                />
              )}
              {page === "profile" && (
                <EditProfilePage
                  {...props}
                  updateMe={setMe}
                  refreshCenter={() => {
                    discovery.invalidateProfiles();
                    discovery.invalidateRecruitments();
                    return dashboard.refresh(true);
                  }}
                />
              )}
            </Fragment>
          )}
        </main>
      </div>
      <ActionToaster />
    </>
  );
}
