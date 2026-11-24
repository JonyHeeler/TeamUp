import CenterTeams from "./CenterTeams";
import { SummaryCard } from "../ui/SummaryCard";
import { Button } from "../ui/Button";
import { useCallback, useState } from "react";
import { ApiError, api, type Intent } from "../api/client";
import { copy as t } from "../copy";
import { ProfileDetails, ProfileSummary } from "../ProfileEditor";
import EvidenceImage from "../EvidenceImage";
import {
  Alert,
  Dialog,
  Feedback,
  Heading,
  describeError,
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
  const [profile, publicProfile, teams, requests] = await Promise.allSettled([
    loadOwnProfile(),
    api.profile(userId),
    api.ownRecruitments(),
    api.intents(),
  ]);
  return {
    profile: sectionResult(profile),
    publicProfile: sectionResult(publicProfile),
    teams: sectionResult(teams),
    requests: sectionResult(requests),
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
  const [intent, setIntent] = useState<Intent | null>(null);
  const { busy, run, clear, error, setError } = useAction();
  const intents = (dashboard?.requests.data?.items ?? []).map(
    (item) => updated[item.id] ?? item,
  );
  const teamName = (entry: Intent) => entry.teamName ?? t.unknownTeam;
  const otherParty = (entry: Intent) => entry.counterpartNickname;
  const sentIntents: Intent[] = [];
  const receivedIntents: Intent[] = [];
  for (const entry of intents) {
    const sender = entry.kind === "apply" ? entry.candidateId : entry.ownerId;
    (sender === me?.userId ? sentIntents : receivedIntents).push(entry);
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
  function openIntent(id: string) {
    void run(() => api.intent(id), setIntent, false);
  }

  function closeDetail() {
    clear();
    setIntent(null);
  }

  function respond(entry: Intent, decision: "accepted" | "declined") {
    void run(
      async () => {
        const summary = await api.respond(entry.id, decision);
        try {
          return { summary, detail: await api.intent(entry.id) };
        } catch (error) {
          return { summary, error: describeError(error) };
        }
      },
      ({ summary, detail, error }) => {
        setUpdated((items) => ({ ...items, [entry.id]: summary }));
        setIntent(detail ?? { ...entry, ...summary });
        if (error) setError(error);
      },
    );
  }

  const status = (entry: Intent) => (
    <span className={"status " + entry.status}>{t[entry.status]}</span>
  );
  return (
    <>
      <Heading title={t.center} />
      {!intent && <Feedback error={error} notice={arrival} />}
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
            teams={dashboard.teams.data?.items ?? []}
            loadError={dashboard.teams.error}
          />
          <div className="request-columns">
            {requestColumns.map(({ id, title, empty, items }) => (
              <section key={id} aria-labelledby={id} className="request-column">
                <h2 id={id}>{title}</h2>
                <div className="request-list">
                  {items.map((entry) => (
                    <button
                      className="request-row"
                      key={entry.id}
                      onClick={() => openIntent(entry.id)}
                    >
                      <span className="request-text">
                        <strong>{teamName(entry)}</strong>
                        <span>
                          {[
                            entry.kind === "apply"
                              ? t.application
                              : t.invitation,
                            otherParty(entry),
                          ]
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
                  ))}
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
      {intent && (
        <Dialog
          title={teamName(intent)}
          closeLabel={t.close}
          busy={busy}
          close={closeDetail}
        >
          <Alert message={error} />
          <div className="request-meta">
            {status(intent)}
            <span>
              {[
                intent.kind === "apply" ? t.application : t.invitation,
                otherParty(intent),
              ]
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
          {intent.status === "accepted" && intent.counterpartQq && (
            <div className="contact">
              <small>{t.otherContact}</small>
              <strong>{intent.counterpartQq}</strong>
            </div>
          )}
          {intent.canRespond && (
            <div className="dialog-section">
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
    </>
  );
}
