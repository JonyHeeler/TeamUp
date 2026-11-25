import CenterTeams from "./CenterTeams";
import { SummaryCard } from "../ui/SummaryCard";
import { Button } from "../ui/Button";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  type Intent,
  type RecruitmentInput,
  type TeamInvitation,
  type TeamSummary,
} from "../api/client";
import { copy as t } from "../copy";
import { ProfileDetails, ProfileSummary } from "../ProfileEditor";
import MemberInvitePicker, {
  type InviteeChoice,
} from "../MemberInvitePicker";
import RecruitmentEditor from "../RecruitmentEditor";
import EvidenceImage from "../EvidenceImage";
import {
  Alert,
  Dialog,
  Feedback,
  Heading,
  IntentMessage,
  IntentResponse,
  describeError,
  formatRemainingTime,
  useAction,
  useResource,
  type Notice,
  type PageProps,
} from "./shared";
import "./center.css";

async function loadOwnProfile() {
  try {
    return await api.ownProfile();
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") return null;
    throw error;
  }
}

function sectionResult<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled"
    ? { data: result.value }
    : { error: describeError(result.reason) };
}

async function loadDashboard(userId: string) {
  const [profile, publicProfile, teams, requests, teamInvitations] =
    await Promise.allSettled([
      loadOwnProfile(),
      api.profile(userId),
      api.myTeams(),
      api.intents(),
      api.teamInvitations(),
    ]);
  return {
    profile: sectionResult(profile),
    publicProfile: sectionResult(publicProfile),
    teams: sectionResult(teams),
    requests: sectionResult(requests),
    teamInvitations: sectionResult(teamInvitations),
  };
}

function CenterLoading() {
  return (
    <div className="center-loading" role="status" aria-label={t.loading}>
      <div className="center-loading-profile" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="center-loading-team" aria-hidden="true" />
      <div className="request-columns" aria-hidden="true">
        <div className="center-loading-request" />
        <div className="center-loading-request" />
      </div>
    </div>
  );
}

type FollowUpModal =
  | { kind: "create-team"; intent: Intent }
  | { kind: "existing-team"; intent: Intent }
  | null;

export default function CenterPage({
  me,
  navigate,
  arrival,
}: PageProps & { arrival?: Notice }) {
  const userId = me?.userId;
  const load = useCallback(() => loadDashboard(userId!), [userId]);
  const { data: dashboard, error: loadError } = useResource(load, Boolean(me));
  const ownProfile = dashboard?.profile.data;
  const publicProfile = dashboard?.publicProfile.data;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [updated, setUpdated] = useState<Record<string, Intent>>({});
  const [addedIntents, setAddedIntents] = useState<Intent[]>([]);
  const [teamChanges, setTeamChanges] = useState<TeamSummary[]>([]);
  const [removedTeamIds, setRemovedTeamIds] = useState<string[]>([]);
  const [updatedInvitations, setUpdatedInvitations] = useState<
    Record<string, TeamInvitation>
  >({});
  const [addedInvitations, setAddedInvitations] = useState<TeamInvitation[]>(
    [],
  );
  const [intent, setIntent] = useState<Intent | null>(null);
  const [activeInvitation, setActiveInvitation] =
    useState<TeamInvitation | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [formalResponseMessage, setFormalResponseMessage] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpModal>(null);
  const [followUpPublish, setFollowUpPublish] = useState(true);
  const [followUpInvitees, setFollowUpInvitees] = useState<InviteeChoice[]>([]);
  const [followUpTeam, setFollowUpTeam] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [notice, setNotice] = useState<Notice>();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const catalog = useResource(
    api.competitions,
    followUp?.kind === "create-team",
  );
  const { busy, run, clear, error, setError, fieldError } = useAction();

  useEffect(() => {
    const expiry = intent?.expiresAt ?? activeInvitation?.expiresAt;
    if (!expiry) return;
    const current = Date.now();
    setNowMs(current);
    const delay = Date.parse(expiry) - current;
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timeout = window.setTimeout(
      () => setNowMs(Date.now()),
      Math.min(delay + 50, 2147483647),
    );
    return () => window.clearTimeout(timeout);
  }, [
    intent?.id,
    intent?.expiresAt,
    activeInvitation?.id,
    activeInvitation?.expiresAt,
  ]);

  const initialIntents = dashboard?.requests.data?.items ?? [];
  const allIntents = [
    ...addedIntents.filter(
      (item) => !initialIntents.some((existing) => existing.id === item.id),
    ),
    ...initialIntents,
  ].map((item) => updated[item.id] ?? item);

  const isEntryExpired = (entry: { isExpired?: boolean; expiresAt?: string }) =>
    Boolean(entry.isExpired) ||
    (Boolean(entry.expiresAt) && nowMs >= Date.parse(entry.expiresAt!));

  const visibleIntents = allIntents.filter((entry) => !isEntryExpired(entry));
  const activeIntents = visibleIntents.filter(
    (entry) => entry.status === "pending" || entry.status === "accepted",
  );
  const recentDeclinedIntents = visibleIntents.filter(
    (entry) => entry.status === "declined",
  );

  const initialTeams = dashboard?.teams.data?.items ?? [];
  const ownTeams = [
    ...teamChanges,
    ...initialTeams.filter(
      (team) => !teamChanges.some((changed) => changed.id === team.id),
    ),
  ].filter((team) => !removedTeamIds.includes(team.id));
  const captainTeams = ownTeams.filter((team) => team.myRole === "captain");

  const initialFormalInvitations = dashboard?.teamInvitations.data?.items ?? [];
  const allFormalInvitations = [
    ...addedInvitations.filter(
      (item) =>
        !initialFormalInvitations.some((existing) => existing.id === item.id),
    ),
    ...initialFormalInvitations,
  ].map((item) => updatedInvitations[item.id] ?? item);

  const activeFormalInvitations = allFormalInvitations.filter(
    (item) => item.status === "pending" && !isEntryExpired(item),
  );
  const recentFormalInvitations = allFormalInvitations.filter(
    (item) => item.status !== "pending" && !isEntryExpired(item),
  );
  const receivedFormalInvitations = activeFormalInvitations.filter(
    (item) => item.inviteeId === me?.userId,
  );
  const sentFormalInvitations = activeFormalInvitations.filter(
    (item) => item.inviterId === me?.userId,
  );

  const intentSenderId = (entry: Intent) =>
    entry.senderId ??
    (entry.kind === "apply" ? entry.candidateId : (entry.ownerId ?? ""));
  const intentTitle = (entry: Intent) =>
    entry.kind === "personal"
      ? (entry.counterpartNickname ?? t.personalInvite)
      : (entry.teamName ?? t.unknownTeam);
  const intentKindLabel = (entry: Intent) =>
    entry.kind === "apply"
      ? t.application
      : entry.kind === "personal"
        ? t.personalInvite
        : t.invitation;
  const intentSubtitle = (entry: Intent) =>
    entry.kind === "personal"
      ? t.personalInvite
      : [intentKindLabel(entry), entry.counterpartNickname]
          .filter(Boolean)
          .join(" · ");
  const intentRemainingHint = (entry: Intent) => {
    if (!entry.expiresAt || isEntryExpired(entry)) return "";
    const remaining = formatRemainingTime(entry.expiresAt, nowMs);
    if (!remaining) return "";
    if (entry.status === "accepted") return t.qqRemaining(remaining);
    if (entry.status === "declined") return t.cooldownRemaining(remaining);
    return t.pendingRemaining(remaining);
  };

  const formalInvitationRemainingHint = (entry: TeamInvitation) => {
    if (!entry.expiresAt || isEntryExpired(entry)) return "";
    const remaining = formatRemainingTime(entry.expiresAt, nowMs);
    if (!remaining) return "";
    if (entry.status === "declined") return t.cooldownRemaining(remaining);
    if (entry.status === "pending") return t.pendingRemaining(remaining);
    return "";
  };

  const sentIntents: Intent[] = [];
  const receivedIntents: Intent[] = [];
  for (const entry of activeIntents) {
    (intentSenderId(entry) === me?.userId ? sentIntents : receivedIntents).push(
      entry,
    );
  }
  const requestColumns = [
    {
      id: "sent-requests",
      title: t.sentIntents,
      empty: t.emptySentIntents,
      items: sentIntents,
    },
    {
      id: "received-requests",
      title: t.receivedIntents,
      empty: t.emptyReceivedIntents,
      items: receivedIntents,
    },
  ];

  function recordTeam(team: TeamSummary) {
    setRemovedTeamIds((ids) => ids.filter((id) => id !== team.id));
    setTeamChanges((items) => [
      team,
      ...items.filter((item) => item.id !== team.id),
    ]);
  }

  function removeTeam(teamId: string) {
    setRemovedTeamIds((ids) => (ids.includes(teamId) ? ids : [...ids, teamId]));
    setTeamChanges((items) => items.filter((item) => item.id !== teamId));
  }

  function recordFormalInvitations(entries: TeamInvitation[]) {
    if (entries.length === 0) return;
    setUpdatedInvitations((prev) => {
      const next = { ...prev };
      for (const entry of entries) next[entry.id] = entry;
      return next;
    });
    setAddedInvitations((prev) => {
      const merged = [...prev];
      for (const entry of entries) {
        const idx = merged.findIndex((item) => item.id === entry.id);
        if (idx >= 0) merged[idx] = entry;
        else merged.unshift(entry);
      }
      return merged;
    });
  }

  function openIntent(id: string) {
    setResponseMessage("");
    setNotice(undefined);
    setNowMs(Date.now());
    void run(() => api.intent(id), setIntent, false);
  }

  function closeDetail() {
    clear();
    setResponseMessage("");
    setIntent(null);
  }

  function openFormalInvitation(entry: TeamInvitation) {
    clear();
    setNotice(undefined);
    setFormalResponseMessage("");
    setNowMs(Date.now());
    setActiveInvitation(entry);
  }

  function closeFormalInvitation() {
    clear();
    setFormalResponseMessage("");
    setActiveInvitation(null);
  }

  function openFollowUp(kind: "create-team" | "existing-team", entry: Intent) {
    clear();
    setNotice(undefined);
    setResponseMessage("");
    setIntent(null);
    setFollowUpTeam("");
    setFollowUpMessage("");
    setFollowUpPublish(true);
    const targetUserId = entry.recipientId ?? entry.candidateId;
    const targetNickname = entry.counterpartNickname ?? targetUserId;
    setFollowUpInvitees([
      {
        userId: targetUserId,
        nickname: targetNickname,
        skills: [],
        origin: "high-five",
      },
    ]);
    setFollowUp({ kind, intent: entry });
  }

  function closeFollowUp() {
    clear();
    setFollowUpTeam("");
    setFollowUpMessage("");
    setFollowUpPublish(true);
    setFollowUpInvitees([]);
    setFollowUp(null);
  }

  function respond(entry: Intent, decision: "accepted" | "declined") {
    const reply = responseMessage;
    void run(
      async () => {
        const summary = await api.respond(entry.id, decision, reply);
        try {
          return { summary, detail: await api.intent(entry.id) };
        } catch (error) {
          return { summary, error: describeError(error) };
        }
      },
      ({ summary, detail, error }) => {
        setUpdated((items) => ({ ...items, [entry.id]: summary }));
        setResponseMessage("");
        setNowMs(Date.now());
        setIntent(
          detail ?? {
            ...entry,
            ...summary,
            ...(reply.trim() ? { responseMessage: reply.trim() } : {}),
          },
        );
        if (decision === "declined") setNotice("declinedNotice");
        if (error) setError(error);
      },
    );
  }

  function respondFormal(
    entry: TeamInvitation,
    decision: "accepted" | "declined",
  ) {
    const reply = formalResponseMessage;
    void run(
      async () => {
        const updatedEntry = await api.respondTeamInvitation(
          entry.id,
          decision,
          reply,
        );
        if (decision === "accepted") {
          try {
            const refreshedTeams = await api.myTeams();
            return { updatedEntry, refreshedTeams: refreshedTeams.items };
          } catch {
            return { updatedEntry, refreshedTeams: null };
          }
        }
        return { updatedEntry, refreshedTeams: null };
      },
      ({ updatedEntry, refreshedTeams }) => {
        recordFormalInvitations([updatedEntry]);
        if (refreshedTeams) {
          setTeamChanges(refreshedTeams);
        }
        setFormalResponseMessage("");
        setNowMs(Date.now());
        setActiveInvitation(null);
        setNotice(
          decision === "accepted"
            ? "formalInviteAccepted"
            : "formalInviteDeclined",
        );
      },
    );
  }

  function submitCreateTeamAndInvite(draft: RecruitmentInput) {
    if (!followUp || followUp.kind !== "create-team") return;
    const inviteeIds = followUpInvitees.map((item) => item.userId);
    const trimmedMessage = followUpMessage.trim();
    void run(
      () =>
        api.createTeam({
          competition: draft.competition,
          teamName: draft.teamName,
          description: draft.background,
          publishRecruitment: followUpPublish,
          ...(followUpPublish
            ? {
                openings: draft.openings,
                requirements: draft.requirements,
                ...(draft.durationDays ? { durationDays: draft.durationDays } : {}),
              }
            : {}),
          inviteeIds,
          ...(trimmedMessage ? { inviteMessage: trimmedMessage } : {}),
        }),
      (result) => {
        const { team, invitations = [] } = result;
        recordTeam(team);
        if (invitations.length > 0) recordFormalInvitations(invitations);
        closeFollowUp();
        if (inviteeIds.length > 0 && invitations.length === 0) {
          setError(
            "队伍已创建，但正式组队邀请未成功返回，请检查邀请列表或重新邀请。",
          );
          return;
        }
        setNotice(
          invitations.length > 0 ? "teamInviteSent" : "teamCreatedOnly",
        );
      },
    );
  }

  function submitExistingTeamInvite() {
    if (!followUp || followUp.kind !== "existing-team" || !followUpTeam) return;
    const pairing = followUp.intent;
    const targetCandidateId = pairing.recipientId ?? pairing.candidateId;
    const trimmedMessage = followUpMessage.trim();
    void run(
      () =>
        api.createTeamInvitations(followUpTeam, {
          inviteeIds: [targetCandidateId],
          ...(trimmedMessage ? { message: trimmedMessage } : {}),
        }),
      ({ items }) => {
        recordFormalInvitations(items);
        closeFollowUp();
        setNotice("formalInviteSent");
      },
    );
  }

  const intentExpired = intent ? isEntryExpired(intent) : false;
  const activeFormalExpired = activeInvitation
    ? isEntryExpired(activeInvitation)
    : false;
  const canFollowUpPersonal = Boolean(
    intent &&
      intent.kind === "personal" &&
      intent.status === "accepted" &&
      !intentExpired &&
      intentSenderId(intent) === me?.userId,
  );

  const status = (entry: { status: "pending" | "accepted" | "declined" }) => (
    <span className={"status " + entry.status}>{t[entry.status]}</span>
  );

  return (
    <>
      <Heading title={t.center} />
      {!intent && !activeInvitation && !followUp && (
        <Feedback
          error={error}
          notice={notice ?? arrival}
          onDismiss={() => {
            clear();
            setNotice(undefined);
          }}
        />
      )}
      {!me ? (
        <p className="empty">{t.needPersona}</p>
      ) : loadError ? (
        <Alert message={loadError} />
      ) : !dashboard ? (
        <CenterLoading />
      ) : (
        <div className="center-dashboard">
          <SummaryCard
            title={ownProfile?.nickname ?? me.nickname}
            context="我的公开名片"
            actions={
              <>
                <div className="card-management">
                  <Button onClick={() => navigate("/center/profile")}>
                    {"kind" in me && ownProfile === null
                      ? "创建名片"
                      : t.editProfile}
                  </Button>
                  <Button onClick={() => navigate("/center/resume")}>
                    我的简历
                  </Button>
                </div>
                {publicProfile && (
                  <Button onClick={() => setPreviewOpen(true)}>
                    查看完整公开名片
                  </Button>
                )}
              </>
            }
          >
            {dashboard.profile.error ? (
              <Alert message={dashboard.profile.error} />
            ) : ownProfile && publicProfile ? (
              <ProfileSummary profile={publicProfile} />
            ) : ownProfile && dashboard.publicProfile.error ? (
              <Alert message={dashboard.publicProfile.error} />
            ) : (
              <p className="consent">{t.noProfile}</p>
            )}
          </SummaryCard>
          <CenterTeams
            teams={ownTeams}
            loadError={dashboard.teams.error}
            onTeamSaved={recordTeam}
            onTeamRemoved={removeTeam}
            onInvitationsCreated={recordFormalInvitations}
          />
          <section
            className="formal-invitations-section"
            aria-labelledby="formal-invitations-title"
          >
            <h2 id="formal-invitations-title">{t.formalInvitations}</h2>
            <div className="request-columns">
              <div className="request-column">
                <h3>{t.receivedFormalInvitations}</h3>
                <div className="request-list">
                  {receivedFormalInvitations.map((entry) => {
                    const remaining = formalInvitationRemainingHint(entry);
                    return (
                      <button
                        className="request-row"
                        key={entry.id}
                        onClick={() => openFormalInvitation(entry)}
                      >
                        <span className="request-text">
                          <strong>{entry.teamName}</strong>
                          <span>
                            {[
                              entry.competition,
                              `邀请人：${entry.inviterNickname}`,
                              remaining,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="status needs-response">
                          {t.actionRequired}
                        </span>
                        <span className="chevron" aria-hidden="true" />
                      </button>
                    );
                  })}
                  {!receivedFormalInvitations.length &&
                    (dashboard.teamInvitations.error ? (
                      <Alert message={dashboard.teamInvitations.error} />
                    ) : (
                      <p className="empty">{t.emptyFormalInvitations}</p>
                    ))}
                </div>
              </div>
              <div className="request-column">
                <h3>{t.sentFormalInvitations}</h3>
                <div className="request-list">
                  {sentFormalInvitations.map((entry) => {
                    const remaining = formalInvitationRemainingHint(entry);
                    return (
                      <button
                        className="request-row"
                        key={entry.id}
                        onClick={() => openFormalInvitation(entry)}
                      >
                        <span className="request-text">
                          <strong>{entry.teamName}</strong>
                          <span>
                            {[
                              entry.competition,
                              `被邀请：${entry.inviteeNickname}`,
                              remaining,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {status(entry)}
                        <span className="chevron" aria-hidden="true" />
                      </button>
                    );
                  })}
                  {!sentFormalInvitations.length &&
                    (dashboard.teamInvitations.error ? (
                      <Alert message={dashboard.teamInvitations.error} />
                    ) : (
                      <p className="empty">{t.emptyFormalInvitations}</p>
                    ))}
                </div>
              </div>
            </div>
            {recentFormalInvitations.length > 0 && (
              <details className="recent-declined">
                <summary>
                  {t.recentFormalResults}（{recentFormalInvitations.length}）
                </summary>
                <div className="request-list">
                  {recentFormalInvitations.map((entry) => {
                    const remaining = formalInvitationRemainingHint(entry);
                    const counterpart =
                      entry.inviterId === me.userId
                        ? `被邀请：${entry.inviteeNickname}`
                        : `邀请人：${entry.inviterNickname}`;
                    return (
                      <button
                        className="request-row"
                        key={entry.id}
                        onClick={() => openFormalInvitation(entry)}
                      >
                        <span className="request-text">
                          <strong>{entry.teamName}</strong>
                          <span>
                            {[entry.competition, counterpart, remaining]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {status(entry)}
                        <span className="chevron" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </details>
            )}
          </section>
          <div className="request-columns">
            {requestColumns.map(({ id, title, empty, items }) => (
              <section key={id} aria-labelledby={id} className="request-column">
                <h2 id={id}>{title}</h2>
                <div className="request-list">
                  {items.map((entry) => {
                    const remainingHint = intentRemainingHint(entry);
                    return (
                      <button
                        className="request-row"
                        key={entry.id}
                        onClick={() => openIntent(entry.id)}
                      >
                        <span className="request-text">
                          <strong>{intentTitle(entry)}</strong>
                          <span>
                            {[intentSubtitle(entry), remainingHint]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {entry.canRespond ? (
                          <span className="status needs-response">
                            {t.actionRequired}
                          </span>
                        ) : (
                          status(entry)
                        )}
                        <span className="chevron" aria-hidden="true" />
                      </button>
                    );
                  })}
                  {!items.length &&
                    (dashboard.requests.error ? (
                      <Alert message={dashboard.requests.error} />
                    ) : (
                      <p className="empty">{empty}</p>
                    ))}
                </div>
              </section>
            ))}
          </div>
          {recentDeclinedIntents.length > 0 && (
            <details className="recent-declined">
              <summary>
                {t.recentDeclined}（{recentDeclinedIntents.length}）
              </summary>
              <div className="request-list">
                {recentDeclinedIntents.map((entry) => {
                  const remainingHint = intentRemainingHint(entry);
                  return (
                    <button
                      className="request-row"
                      key={entry.id}
                      onClick={() => openIntent(entry.id)}
                    >
                      <span className="request-text">
                        <strong>{intentTitle(entry)}</strong>
                        <span>
                          {[intentSubtitle(entry), remainingHint]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {status(entry)}
                      <span className="chevron" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      )}
      {previewOpen && publicProfile && me && (
        <Dialog
          title="完整公开名片"
          closeLabel={t.close}
          close={() => setPreviewOpen(false)}
        >
          <strong>{publicProfile.nickname}</strong>
          <ProfileDetails profile={publicProfile} />
          {(publicProfile.evidenceIds?.length ?? 0) > 0 && (
            <div className="proof-grid" role="group" aria-label={t.evidence}>
              {publicProfile.evidenceIds?.map((id, index) => (
                <EvidenceImage
                  key={id}
                  entry={{ id }}
                  userId={me.userId}
                  label={t.evidenceLabel(index + 1)}
                />
              ))}
            </div>
          )}
        </Dialog>
      )}
      {activeInvitation && (
        <Dialog
          title={`${t.formalInvitations} · ${activeInvitation.teamName}`}
          closeLabel={t.close}
          busy={busy}
          close={closeFormalInvitation}
        >
          <Alert message={error} />
          <div className="request-meta">
            {status(activeInvitation)}
            <span>
              {[
                activeInvitation.competition,
                activeInvitation.inviterId === me?.userId
                  ? `被邀请：${activeInvitation.inviteeNickname}`
                  : `邀请人：${activeInvitation.inviterNickname}`,
                formalInvitationRemainingHint(activeInvitation),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {activeInvitation.message && (
            <div className="intent-note">
              <strong>{t.intentMessage}</strong>
              <p>{activeInvitation.message}</p>
            </div>
          )}
          {activeInvitation.responseMessage && (
            <div className="intent-note">
              <strong>{t.intentResponse}</strong>
              <p>{activeInvitation.responseMessage}</p>
            </div>
          )}
          <small className="consent">{t.formalInviteNoQqHint}</small>
          {activeInvitation.canRespond && !activeFormalExpired && (
            <div className="dialog-section">
              <IntentResponse
                value={formalResponseMessage}
                onChange={setFormalResponseMessage}
                disabled={busy}
                error={fieldError("responseMessage")}
              />
              <div className="dialog-actions">
                <Button
                  disabled={busy}
                  onClick={() => respondFormal(activeInvitation, "declined")}
                >
                  {t.declineFormalInvite}
                </Button>
                <Button
                  tone="blue"
                  disabled={busy}
                  onClick={() => respondFormal(activeInvitation, "accepted")}
                >
                  {t.acceptFormalInvite}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
      {intent && (
        <Dialog
          title={intentTitle(intent)}
          closeLabel={t.close}
          busy={busy}
          close={closeDetail}
        >
          <Alert message={error} />
          <div className="request-meta">
            {status(intent)}
            <span>
              {[intentSubtitle(intent), intentRemainingHint(intent)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {intent.message && (
            <div className="intent-note">
              <strong>{t.intentMessage}</strong>
              <p>{intent.message}</p>
            </div>
          )}
          {intent.responseMessage && (
            <div className="intent-note">
              <strong>{t.intentResponse}</strong>
              <p>{intent.responseMessage}</p>
            </div>
          )}
          {intent.status === "accepted" &&
            !intentExpired &&
            intent.counterpartQq && (
              <div className="contact">
                <small>{t.otherContact}</small>
                <strong>{intent.counterpartQq}</strong>
              </div>
            )}
          {intent.status === "accepted" && intentExpired && (
            <p className="consent">{t.qqExpiredHint}</p>
          )}
          {canFollowUpPersonal && (
            <div className="dialog-section follow-up-section">
              <strong>{t.followUpHeading}</strong>
              <div className="follow-up-actions">
                <Button
                  type="button"
                  tone="blue"
                  disabled={busy}
                  onClick={() => openFollowUp("create-team", intent)}
                >
                  {t.createTeamAndInvite}
                </Button>
                <Button
                  type="button"
                  disabled={busy || captainTeams.length === 0}
                  onClick={() => openFollowUp("existing-team", intent)}
                >
                  {t.inviteToExistingTeam}
                </Button>
              </div>
              {captainTeams.length === 0 && (
                <small className="consent">{t.noActiveTeamsForFollowUp}</small>
              )}
              <small className="consent">{t.formalInviteConfirmHint}</small>
            </div>
          )}
          {intent.canRespond && !intentExpired && (
            <div className="dialog-section">
              <IntentResponse
                value={responseMessage}
                onChange={setResponseMessage}
                disabled={busy}
                error={fieldError("responseMessage")}
              />
              <div className="dialog-actions">
                <Button
                  disabled={busy}
                  onClick={() => respond(intent, "declined")}
                >
                  {t.decline}
                </Button>
                <Button
                  tone="blue"
                  disabled={busy}
                  onClick={() => respond(intent, "accepted")}
                >
                  {t.accept}
                </Button>
              </div>
              <small className="consent">{t.share}</small>
            </div>
          )}
        </Dialog>
      )}
      {followUp?.kind === "create-team" && (
        <Dialog
          title={t.createTeamAndInvite}
          closeLabel={t.close}
          busy={busy}
          close={closeFollowUp}
        >
          <Alert message={error || catalog.error || ""} />
          {catalog.data ? (
            <RecruitmentEditor
              competitions={catalog.data.items}
              busy={busy}
              fieldError={fieldError}
              showPublishToggle
              showDurationPicker
              publishRecruitment={followUpPublish}
              onPublishToggle={setFollowUpPublish}
              submitLabel={
                followUpInvitees.length > 0
                  ? t.createTeamAndSendInvite
                  : t.create
              }
              onPublish={submitCreateTeamAndInvite}
              extraSection={
                <section
                  className="editor-section"
                  aria-labelledby="follow-up-invite-heading"
                >
                  <h2 id="follow-up-invite-heading">{t.sendInviteSection}</h2>
                  <MemberInvitePicker
                    selected={followUpInvitees}
                    onChange={setFollowUpInvitees}
                    disabled={busy}
                  />
                  {followUpInvitees.length > 0 && (
                    <>
                      <IntentMessage
                        value={followUpMessage}
                        onChange={setFollowUpMessage}
                        kind="formal-invite"
                        error={fieldError("inviteMessage")}
                      />
                      <small className="consent">
                        {t.formalInviteConfirmHint}
                      </small>
                      <small className="consent">
                        {t.formalInviteNoQqHint}
                      </small>
                    </>
                  )}
                </section>
              }
            />
          ) : (
            !catalog.error && <p role="status">{t.loading}</p>
          )}
        </Dialog>
      )}
      {followUp?.kind === "existing-team" && (
        <Dialog
          title={t.inviteToExistingTeam}
          closeLabel={t.close}
          busy={busy}
          close={closeFollowUp}
        >
          <Alert message={error} />
          <div className="invite-target-box">
            <small>{t.inviteTarget}</small>
            <strong>
              {followUp.intent.counterpartNickname ??
                followUp.intent.recipientId}
            </strong>
          </div>
          <div className="dialog-section">
            <select
              aria-label={t.inviteTeam}
              value={followUpTeam}
              disabled={busy}
              onChange={(event) => setFollowUpTeam(event.target.value)}
            >
              <option value="">{t.inviteTeam}</option>
              {captainTeams.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.teamName} · {entry.competition}
                </option>
              ))}
            </select>
            <IntentMessage
              value={followUpMessage}
              onChange={setFollowUpMessage}
              kind="formal-invite"
              error={fieldError("message")}
            />
            <Button
              tone="blue"
              disabled={!followUpTeam || busy}
              onClick={submitExistingTeamInvite}
            >
              发送正式组队邀请
            </Button>
            <small className="consent">{t.formalInviteConfirmHint}</small>
            <small className="consent">{t.formalInviteNoQqHint}</small>
          </div>
        </Dialog>
      )}
    </>
  );
}
