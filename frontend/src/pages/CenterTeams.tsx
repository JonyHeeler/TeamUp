import { useEffect, useState } from "react";
import {
  api,
  type Profile,
  type Recruitment,
  type RecruitmentDuration,
  type RecruitmentInput,
  type TeamInvitation,
  type TeamSummary,
} from "../api/client";
import { copy as t } from "../copy";
import MemberInvitePicker, {
  type InviteeChoice,
} from "../MemberInvitePicker";
import { ProfileDetails } from "../ProfileEditor";
import RecruitmentEditor from "../RecruitmentEditor";
import { Tags } from "../SkillFields";
import { Button } from "../ui/Button";
import {
  Alert,
  Dialog,
  Feedback,
  IntentMessage,
  describeError,
  formatRemainingTime,
  useAction,
  useResource,
  type Notice,
} from "./shared";
import "./center-teams.css";

type EditorModal =
  | { kind: "create" }
  | { kind: "manage"; team: TeamSummary }
  | null;

function resolveRecruitmentState(
  recruitment: Recruitment | null | undefined,
  nowMs: number,
): "none" | "active" | "unpublished" | "expired" {
  if (!recruitment) return "none";
  if (recruitment.status === "unpublished" || !recruitment.isPublished) {
    return "unpublished";
  }
  if (
    recruitment.status === "expired" ||
    (recruitment.expiresAt && nowMs >= Date.parse(recruitment.expiresAt))
  ) {
    return "expired";
  }
  return "active";
}

function teamToRecruitmentDraft(team: TeamSummary): Recruitment {
  if (team.recruitment) return team.recruitment;
  return {
    id: team.id,
    teamId: team.id,
    ownerId: team.captainId,
    teamNumber: team.teamNumber,
    competition: team.competition,
    teamName: team.teamName,
    openings: "",
    skills: [],
    requirements: [],
    background: team.description,
    isPublished: false,
    createdAt: team.createdAt,
    memberCount: team.memberCount,
    members: team.members,
    status: "unpublished",
    isPubliclyActive: false,
  };
}

export default function CenterTeams({
  teams: initialTeams,
  loadError,
  onTeamSaved,
  onTeamRemoved,
  onInvitationsCreated,
}: {
  teams: TeamSummary[];
  loadError?: string;
  onTeamSaved?: (team: TeamSummary) => void;
  onTeamRemoved?: (teamId: string) => void;
  onInvitationsCreated?: (invitations: TeamInvitation[]) => void;
}) {
  const [changes, setChanges] = useState<TeamSummary[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorModal>(null);
  const [visibility, setVisibility] = useState<TeamSummary | null>(null);
  const [lifecycleModal, setLifecycleModal] = useState<
    { kind: "renew" | "republish"; team: TeamSummary } | null
  >(null);
  const [lifecycleDuration, setLifecycleDuration] =
    useState<RecruitmentDuration>(14);
  const [viewMembersTeam, setViewMembersTeam] = useState<TeamSummary | null>(
    null,
  );
  const [leaveTarget, setLeaveTarget] = useState<TeamSummary | null>(null);

  const [publishRecruitment, setPublishRecruitment] = useState(true);
  const [selectedInvitees, setSelectedInvitees] = useState<InviteeChoice[]>([]);
  const [inviteMessage, setInviteMessage] = useState("");

  // Unified management modal states
  const [membersOpen, setMembersOpen] = useState(true);
  const [invitationsOpen, setInvitationsOpen] = useState(true);
  const [inlineInviteOpen, setInlineInviteOpen] = useState(false);
  const [inlineInviteBusy, setInlineInviteBusy] = useState(false);
  const [inlineInviteError, setInlineInviteError] = useState("");
  const [inlineInviteNotice, setInlineInviteNotice] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [teamInvitationsLoading, setTeamInvitationsLoading] = useState(false);
  const [teamInvitationsError, setTeamInvitationsError] = useState("");
  const [memberCard, setMemberCard] = useState<Profile | null>(null);
  const [memberCardLoading, setMemberCardLoading] = useState(false);
  const [memberCardError, setMemberCardError] = useState("");

  const catalog = useResource(api.competitions, editor !== null);
  const { busy, error, clear, run, setError, fieldError } = useAction();
  const [notice, setNotice] = useState<Notice>();

  const teams = [
    ...changes,
    ...initialTeams.filter(
      (team) => !changes.some((changed) => changed.id === team.id),
    ),
  ].filter((team) => !removedIds.includes(team.id));

  const managedTeamId = editor?.kind === "manage" ? editor.team.id : null;
  const managedTeam =
    managedTeamId !== null
      ? (teams.find((item) => item.id === managedTeamId) ??
        (editor?.kind === "manage" ? editor.team : null))
      : null;

  useEffect(() => {
    if (!managedTeamId) return;
    let active = true;
    setTeamInvitationsLoading(true);
    setTeamInvitationsError("");
    void api
      .teamInvitationsForTeam(managedTeamId)
      .then(
        (res) => {
          if (active) setTeamInvitations(res.items);
        },
        (err: unknown) => {
          if (active) setTeamInvitationsError(describeError(err));
        },
      )
      .finally(() => {
        if (active) setTeamInvitationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [managedTeamId]);

  function resetSubStates() {
    setPublishRecruitment(true);
    setSelectedInvitees([]);
    setInviteMessage("");
    setMembersOpen(true);
    setInvitationsOpen(true);
    setInlineInviteOpen(false);
    setInlineInviteBusy(false);
    setInlineInviteError("");
    setInlineInviteNotice("");
    setConfirmRemoveId(null);
    setConfirmDisband(false);
    setTeamInvitations([]);
    setTeamInvitationsError("");
    setMemberCard(null);
    setMemberCardError("");
  }

  function close() {
    clear();
    setEditor(null);
    setVisibility(null);
    setLifecycleModal(null);
    setLifecycleDuration(14);
    setViewMembersTeam(null);
    setLeaveTarget(null);
    resetSubStates();
  }

  function applyTeamUpdate(team: TeamSummary) {
    setChanges((items) => [
      team,
      ...items.filter((item) => item.id !== team.id),
    ]);
    onTeamSaved?.(team);
  }

  function saveTeam(team: TeamSummary, result: Notice) {
    applyTeamUpdate(team);
    close();
    setNotice(result);
  }

  function removeTeamLocally(teamId: string, result: Notice) {
    setRemovedIds((ids) => (ids.includes(teamId) ? ids : [...ids, teamId]));
    setChanges((items) => items.filter((item) => item.id !== teamId));
    onTeamRemoved?.(teamId);
    close();
    setNotice(result);
  }

  function openMemberProfile(userId: string) {
    setMemberCard(null);
    setMemberCardError("");
    setMemberCardLoading(true);
    void api
      .profile(userId)
      .then(
        (profile) => setMemberCard(profile),
        (err: unknown) => setMemberCardError(describeError(err)),
      )
      .finally(() => setMemberCardLoading(false));
  }

  function submitEditor(draft: RecruitmentInput) {
    if (!editor) return;
    if (editor.kind === "create") {
      const inviteeIds = selectedInvitees.map((item) => item.userId);
      const trimmedMessage = inviteMessage.trim();
      void run(
        () =>
          api.createTeam({
            competition: draft.competition,
            teamName: draft.teamName,
            description: draft.background,
            publishRecruitment,
            ...(publishRecruitment
              ? {
                  openings: draft.openings,
                  requirements: draft.requirements,
                  ...(draft.durationDays
                    ? { durationDays: draft.durationDays }
                    : {}),
                }
              : {}),
            inviteeIds,
            ...(trimmedMessage ? { inviteMessage: trimmedMessage } : {}),
          }),
        (result) => {
          const { team, invitations = [] } = result;
          if (invitations.length > 0) onInvitationsCreated?.(invitations);
          if (inviteeIds.length > 0 && invitations.length === 0) {
            applyTeamUpdate(team);
            close();
            setError(
              "队伍已创建，但正式组队邀请未成功返回，请检查邀请列表或重新邀请。",
            );
            return;
          }
          saveTeam(
            team,
            invitations.length > 0 ? "teamInviteSent" : "teamCreatedOnly",
          );
        },
      );
      return;
    }

    const targetTeam = managedTeam ?? editor.team;
    const hasRecruitment = Boolean(targetTeam.recruitment);
    if (!hasRecruitment && !publishRecruitment) {
      void run(
        () =>
          api.updateTeam(targetTeam.id, {
            competition: draft.competition,
            teamName: draft.teamName,
            description: draft.background,
          }),
        (updatedTeam) => saveTeam(updatedTeam, "teamUpdated"),
      );
      return;
    }

    void run(
      () =>
        hasRecruitment && targetTeam.recruitment
          ? api.updateRecruitment(targetTeam.recruitment.id, draft)
          : api.upsertTeamRecruitment(targetTeam.id, draft),
      (recruitment) =>
        saveTeam(
          {
            ...targetTeam,
            teamName: recruitment.teamName,
            competition: recruitment.competition,
            description: recruitment.background,
            recruitment,
          },
          hasRecruitment ? "teamSaved" : "published",
        ),
    );
  }

  async function sendInlineInvitations() {
    if (!managedTeam || selectedInvitees.length === 0 || inlineInviteBusy) {
      return;
    }
    setInlineInviteBusy(true);
    setInlineInviteError("");
    setInlineInviteNotice("");
    const trimmedMessage = inviteMessage.trim();
    try {
      const { items } = await api.createTeamInvitations(managedTeam.id, {
        inviteeIds: selectedInvitees.map((item) => item.userId),
        ...(trimmedMessage ? { message: trimmedMessage } : {}),
      });
      if (items.length > 0) {
        onInvitationsCreated?.(items);
        setTeamInvitations((prev) => [
          ...items,
          ...prev.filter((old) => !items.some((n) => n.id === old.id)),
        ]);
      }
      setSelectedInvitees([]);
      setInviteMessage("");
      setInlineInviteOpen(false);
      setInvitationsOpen(true);
      setInlineInviteNotice(t.formalInviteSent);
    } catch (err: unknown) {
      setInlineInviteError(describeError(err));
    } finally {
      setInlineInviteBusy(false);
    }
  }

  function handleRemoveMember(teamId: string, memberUserId: string) {
    void run(
      () => api.removeTeamMember(teamId, memberUserId),
      (updatedTeam) => {
        applyTeamUpdate(updatedTeam);
        setConfirmRemoveId(null);
        setNotice("memberRemoved");
      },
    );
  }

  function handleDisbandTeam(teamId: string) {
    void run(
      () => api.disbandTeam(teamId),
      () => removeTeamLocally(teamId, "teamDisbanded"),
    );
  }

  function handleLeaveTeam(teamId: string) {
    void run(
      () => api.leaveTeam(teamId),
      () => removeTeamLocally(teamId, "leftTeam"),
    );
  }

  const nowMs = Date.now();
  const pendingTeamInvitations = teamInvitations.filter(
    (inv) =>
      inv.status === "pending" &&
      !inv.isExpired &&
      nowMs < Date.parse(inv.expiresAt),
  );
  const recentTeamInvitations = teamInvitations.filter(
    (inv) =>
      inv.status !== "pending" ||
      inv.isExpired ||
      nowMs >= Date.parse(inv.expiresAt),
  );

  return (
    <section className="center-teams" aria-labelledby="center-teams-title">
      <header className="center-teams-heading">
        <h2 id="center-teams-title">我的队伍</h2>
        <Button
          onClick={() => {
            clear();
            setNotice(undefined);
            resetSubStates();
            setEditor({ kind: "create" });
          }}
        >
          <span aria-hidden="true">＋</span> {t.create}
        </Button>
      </header>
      {teams.length ? (
        <ul className="managed-teams">
          {teams.map((team) => {
            const recruitment = team.recruitment;
            const isCaptain = team.myRole === "captain";
            const recState = resolveRecruitmentState(recruitment, nowMs);
            const remaining =
              recState === "active" && recruitment?.expiresAt
                ? formatRemainingTime(recruitment.expiresAt, nowMs)
                : null;
            return (
              <li key={team.id}>
                <div className="managed-team-info">
                  <div className="managed-team-title-row">
                    <h3>{team.teamName}</h3>
                    <span
                      className={`role-badge${isCaptain ? " captain" : ""}`}
                    >
                      {isCaptain ? t.roleCaptain : t.roleMember}
                    </span>
                  </div>
                  <p>
                    {[
                      team.competition,
                      `${team.memberCount} 名成员`,
                      recruitment?.openings
                        ? t.openCount(recruitment.openings)
                        : "",
                      remaining ? t.recruitmentRemaining(remaining) : "",
                      team.teamNumber,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <span
                    className={`status${recState === "active" ? " accepted" : ""}`}
                  >
                    {recState === "active"
                      ? "招募中"
                      : recState === "expired"
                        ? t.recruitmentExpired
                        : recState === "unpublished"
                          ? "已下架"
                          : t.notRecruiting}
                  </span>
                </div>
                <div className="managed-team-actions">
                  {isCaptain ? (
                    <>
                      <Button
                        onClick={() => {
                          clear();
                          setNotice(undefined);
                          resetSubStates();
                          setPublishRecruitment(Boolean(recruitment));
                          setEditor({ kind: "manage", team });
                        }}
                      >
                        {t.manageTeam}
                      </Button>
                      {recState === "active" && recruitment && (
                        <>
                          <Button
                            onClick={() => {
                              clear();
                              setNotice(undefined);
                              setLifecycleDuration(14);
                              setLifecycleModal({ kind: "renew", team });
                            }}
                          >
                            {t.renewRecruitment}
                          </Button>
                          <Button
                            onClick={() => {
                              clear();
                              setNotice(undefined);
                              setVisibility(team);
                            }}
                          >
                            下架
                          </Button>
                        </>
                      )}
                      {(recState === "unpublished" ||
                        recState === "expired") &&
                        recruitment && (
                          <Button
                            onClick={() => {
                              clear();
                              setNotice(undefined);
                              setLifecycleDuration(14);
                              setLifecycleModal({ kind: "republish", team });
                            }}
                          >
                            {t.republishRecruitment}
                          </Button>
                        )}
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => {
                          clear();
                          setNotice(undefined);
                          resetSubStates();
                          setViewMembersTeam(team);
                        }}
                      >
                        {t.viewTeamMembers}
                      </Button>
                      <Button
                        onClick={() => {
                          clear();
                          setNotice(undefined);
                          setLeaveTarget(team);
                        }}
                      >
                        {t.leaveTeam}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : loadError ? (
        <Alert message={loadError} />
      ) : (
        <p className="empty">还没有创建或加入队伍。</p>
      )}
      {!editor && !visibility && !lifecycleModal && !viewMembersTeam && !leaveTarget && (
        <Feedback
          error={error}
          notice={notice}
          onDismiss={() => setNotice(undefined)}
        />
      )}
      {editor && (
        <Dialog
          title={
            editor.kind === "create"
              ? t.create
              : `${t.manageTeam} · ${(managedTeam ?? editor.team).teamName}`
          }
          close={close}
          closeLabel={t.close}
          busy={busy}
        >
          <Alert message={error || catalog.error || ""} />
          {catalog.data ? (
            <RecruitmentEditor
              competitions={catalog.data.items}
              initialTeam={
                editor.kind === "create"
                  ? undefined
                  : teamToRecruitmentDraft(managedTeam ?? editor.team)
              }
              busy={busy}
              fieldError={fieldError}
              onPublish={submitEditor}
              showPublishToggle={
                editor.kind === "create" ||
                !(managedTeam ?? editor.team).recruitment
              }
              showDurationPicker={
                editor.kind === "create" ||
                !(managedTeam ?? editor.team).recruitment
              }
              publishRecruitment={publishRecruitment}
              onPublishToggle={setPublishRecruitment}
              submitLabel={
                editor.kind === "create"
                  ? selectedInvitees.length > 0
                    ? t.createTeamAndSendInvite
                    : t.create
                  : "保存队伍设置"
              }
              extraSection={
                editor.kind === "create" ? (
                  <section
                    className="editor-section"
                    aria-labelledby="create-team-invite-heading"
                  >
                    <h2 id="create-team-invite-heading">
                      {t.sendInviteSection}
                    </h2>
                    <MemberInvitePicker
                      selected={selectedInvitees}
                      onChange={setSelectedInvitees}
                      disabled={busy}
                    />
                    {selectedInvitees.length > 0 && (
                      <>
                        <IntentMessage
                          value={inviteMessage}
                          onChange={setInviteMessage}
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
                ) : managedTeam ? (
                  <>
                    <section
                      className="editor-section"
                      aria-labelledby="managed-team-members-heading"
                    >
                      <div className="requirements-header">
                        <button
                          type="button"
                          id="managed-team-members-heading"
                          className="requirements-toggle"
                          aria-expanded={membersOpen}
                          onClick={() => setMembersOpen((open) => !open)}
                        >
                          <span>
                            {t.existingMembersTitle(managedTeam.members.length)}
                          </span>
                          <span
                            className={`collapse-chevron${membersOpen ? " open" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      {membersOpen && (
                        <>
                          <ul className="team-members-list">
                            {managedTeam.members.map((member) => {
                              const isCaptainRow = member.role === "captain";
                              const confirming =
                                confirmRemoveId === member.userId;
                              return (
                                <li
                                  className="team-member-row"
                                  key={member.userId}
                                >
                                  <div className="team-member-main">
                                    <div className="candidate-title">
                                      <strong>{member.nickname}</strong>
                                      <span
                                        className={`role-badge${isCaptainRow ? " captain" : ""}`}
                                      >
                                        {isCaptainRow
                                          ? t.roleCaptain
                                          : t.roleMember}
                                      </span>
                                    </div>
                                    <Tags
                                      skills={(member.skills ?? []).slice(0, 4)}
                                      custom={(member.customSkills ?? []).slice(
                                        0,
                                        2,
                                      )}
                                    />
                                  </div>
                                  <div className="team-member-actions">
                                    {member.hasProfile && (
                                      <Button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          openMemberProfile(member.userId)
                                        }
                                      >
                                        {t.card}
                                      </Button>
                                    )}
                                    {!isCaptainRow &&
                                      (confirming ? (
                                        <>
                                          <button
                                            type="button"
                                            className="requirement-delete-confirm"
                                            disabled={busy}
                                            onClick={() =>
                                              handleRemoveMember(
                                                managedTeam.id,
                                                member.userId,
                                              )
                                            }
                                          >
                                            {t.confirmRemoveMember}
                                          </button>
                                          <button
                                            type="button"
                                            className="requirement-delete-cancel"
                                            disabled={busy}
                                            onClick={() =>
                                              setConfirmRemoveId(null)
                                            }
                                          >
                                            {t.cancel}
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          className="requirement-delete"
                                          disabled={busy}
                                          onClick={() =>
                                            setConfirmRemoveId(member.userId)
                                          }
                                        >
                                          {t.removeMember}
                                        </button>
                                      ))}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                          {memberCardLoading && (
                            <small className="consent" role="status">
                              {t.loading}
                            </small>
                          )}
                          {memberCardError && (
                            <Alert message={memberCardError} />
                          )}
                          {memberCard && (
                            <div className="inline-member-card">
                              <div className="inline-member-card-header">
                                <strong>{memberCard.nickname}</strong>
                                <Button
                                  type="button"
                                  onClick={() => setMemberCard(null)}
                                >
                                  {t.close}
                                </Button>
                              </div>
                              <ProfileDetails profile={memberCard} />
                            </div>
                          )}
                          {inlineInviteNotice && (
                            <small className="consent" role="status">
                              {inlineInviteNotice}
                            </small>
                          )}
                          {inlineInviteOpen ? (
                            <div className="inline-invite-panel">
                              <Alert message={inlineInviteError} />
                              <MemberInvitePicker
                                teamId={managedTeam.id}
                                selected={selectedInvitees}
                                onChange={setSelectedInvitees}
                                disabled={inlineInviteBusy}
                              />
                              <IntentMessage
                                value={inviteMessage}
                                onChange={setInviteMessage}
                                kind="formal-invite"
                              />
                              <small className="consent">
                                {t.formalInviteConfirmHint}
                              </small>
                              <small className="consent">
                                {t.formalInviteNoQqHint}
                              </small>
                              <div className="dialog-actions">
                                <Button
                                  type="button"
                                  disabled={inlineInviteBusy}
                                  onClick={() => {
                                    setInlineInviteOpen(false);
                                    setInlineInviteError("");
                                    setSelectedInvitees([]);
                                    setInviteMessage("");
                                  }}
                                >
                                  {t.cancel}
                                </Button>
                                <Button
                                  type="button"
                                  tone="blue"
                                  disabled={
                                    inlineInviteBusy ||
                                    selectedInvitees.length === 0
                                  }
                                  onClick={() => void sendInlineInvitations()}
                                >
                                  发送正式组队邀请
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <Button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setInlineInviteError("");
                                  setInlineInviteNotice("");
                                  setInlineInviteOpen(true);
                                }}
                              >
                                {t.inlineInviteButton}
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </section>

                    <section
                      className="editor-section"
                      aria-labelledby="managed-team-invitations-heading"
                    >
                      <div className="requirements-header">
                        <button
                          type="button"
                          id="managed-team-invitations-heading"
                          className="requirements-toggle"
                          aria-expanded={invitationsOpen}
                          onClick={() => setInvitationsOpen((open) => !open)}
                        >
                          <span>
                            {t.pendingInvitationsTitle(
                              pendingTeamInvitations.length,
                            )}
                          </span>
                          <span
                            className={`collapse-chevron${invitationsOpen ? " open" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      {invitationsOpen && (
                        <>
                          {teamInvitationsLoading ? (
                            <small className="consent" role="status">
                              {t.loading}
                            </small>
                          ) : teamInvitationsError ? (
                            <Alert message={teamInvitationsError} />
                          ) : pendingTeamInvitations.length > 0 ? (
                            <ul className="team-invitations-list">
                              {pendingTeamInvitations.map((inv) => {
                                const remaining = formatRemainingTime(
                                  inv.expiresAt,
                                  nowMs,
                                );
                                return (
                                  <li
                                    className="team-invitation-row"
                                    key={inv.id}
                                  >
                                    <div className="team-invitation-main">
                                      <strong>
                                        {inv.inviteeNickname ?? inv.inviteeId}
                                      </strong>
                                      <span className="team-invitation-meta">
                                        {[
                                          `发出：${inv.createdAt.slice(0, 10)}`,
                                          remaining
                                            ? t.pendingRemaining(remaining)
                                            : "",
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </span>
                                      {inv.message && (
                                        <span className="team-invitation-meta">
                                          附言：{inv.message}
                                        </span>
                                      )}
                                    </div>
                                    <span className="status pending">
                                      {t.pending}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="picker-empty">
                              {t.emptyFormalInvitations}
                            </p>
                          )}
                          {recentTeamInvitations.length > 0 && (
                            <details className="recent-declined">
                              <summary>
                                {t.recentFormalResults}（
                                {recentTeamInvitations.length}）
                              </summary>
                              <ul className="team-invitations-list">
                                {recentTeamInvitations.map((inv) => (
                                  <li
                                    className="team-invitation-row"
                                    key={inv.id}
                                  >
                                    <div className="team-invitation-main">
                                      <strong>
                                        {inv.inviteeNickname ?? inv.inviteeId}
                                      </strong>
                                      {inv.message && (
                                        <span className="team-invitation-meta">
                                          附言：{inv.message}
                                        </span>
                                      )}
                                      {inv.responseMessage && (
                                        <span className="team-invitation-meta">
                                          回应：{inv.responseMessage}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`status ${inv.status}`}>
                                      {inv.status === "pending" && inv.isExpired
                                        ? "已过期"
                                        : t[inv.status]}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      )}
                    </section>

                    <div className="team-danger-zone">
                      {confirmDisband ? (
                        <>
                          <small className="consent">
                            解散后队伍及公开招募将停止展示，未处理邀请将失效，已有击掌记录与个人名片不会被删除。此操作不可恢复。
                          </small>
                          <div className="team-danger-actions">
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDisband(false)}
                            >
                              {t.cancel}
                            </Button>
                            <Button
                              type="button"
                              tone="urgent"
                              disabled={busy}
                              onClick={() => handleDisbandTeam(managedTeam.id)}
                            >
                              {t.confirmDisbandTeam}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="team-danger-actions">
                          <Button
                            type="button"
                            tone="urgent"
                            disabled={busy}
                            onClick={() => setConfirmDisband(true)}
                          >
                            {t.disbandTeam}
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                ) : undefined
              }
            />
          ) : (
            !catalog.error && <p role="status">{t.loading}</p>
          )}
        </Dialog>
      )}
      {viewMembersTeam && (
        <Dialog
          title={`${viewMembersTeam.teamName} · ${t.existingMembersTitle(viewMembersTeam.members.length)}`}
          close={close}
          closeLabel={t.close}
        >
          <ul className="team-members-list">
            {viewMembersTeam.members.map((member) => (
              <li className="team-member-row" key={member.userId}>
                <div className="team-member-main">
                  <div className="candidate-title">
                    <strong>{member.nickname}</strong>
                    <span
                      className={`role-badge${member.role === "captain" ? " captain" : ""}`}
                    >
                      {member.role === "captain"
                        ? t.roleCaptain
                        : t.roleMember}
                    </span>
                  </div>
                  <Tags
                    skills={(member.skills ?? []).slice(0, 4)}
                    custom={(member.customSkills ?? []).slice(0, 2)}
                  />
                </div>
                {member.hasProfile && (
                  <div className="team-member-actions">
                    <Button
                      type="button"
                      onClick={() => openMemberProfile(member.userId)}
                    >
                      {t.card}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {memberCardLoading && (
            <small className="consent" role="status">
              {t.loading}
            </small>
          )}
          {memberCardError && <Alert message={memberCardError} />}
          {memberCard && (
            <div className="inline-member-card">
              <div className="inline-member-card-header">
                <strong>{memberCard.nickname}</strong>
                <Button type="button" onClick={() => setMemberCard(null)}>
                  {t.close}
                </Button>
              </div>
              <ProfileDetails profile={memberCard} />
            </div>
          )}
        </Dialog>
      )}
      {leaveTarget && (
        <Dialog
          title={t.leaveTeam}
          close={close}
          closeLabel={t.close}
          busy={busy}
        >
          <p>
            确定要退出「{leaveTarget.teamName}
            」吗？退出后不影响该队伍的招募信息，也不会删除已有击掌记录与 QQ
            查看权限。
          </p>
          <Alert message={error} />
          <div className="dialog-actions">
            <Button type="button" disabled={busy} onClick={close}>
              {t.cancel}
            </Button>
            <Button
              type="button"
              tone="urgent"
              disabled={busy}
              onClick={() => handleLeaveTeam(leaveTarget.id)}
            >
              {t.confirmLeaveTeam}
            </Button>
          </div>
        </Dialog>
      )}
      {lifecycleModal && lifecycleModal.team.recruitment && (
        <Dialog
          title={
            lifecycleModal.kind === "renew"
              ? `${t.renewRecruitment} · ${lifecycleModal.team.teamName}`
              : `${t.republishRecruitment} · ${lifecycleModal.team.teamName}`
          }
          close={close}
          closeLabel={t.close}
          busy={busy}
        >
          <p>
            {lifecycleModal.kind === "renew"
              ? "续期将从当前尚未到期的招募截止时间向后延长所选期限，保留原有剩余有效期。"
              : "重新发布将复用当前队伍与招募信息，并从现在起重新计算所选招募期限。"}
          </p>
          <Alert message={error} />
          <div className="dialog-section">
            <label>
              {t.recruitmentDuration}
              <select
                value={lifecycleDuration}
                disabled={busy}
                onChange={(event) =>
                  setLifecycleDuration(
                    Number(event.target.value) as RecruitmentDuration,
                  )
                }
              >
                {([7, 14, 30] as const).map((days) => (
                  <option key={days} value={days}>
                    {t.durationOption(days)}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <Button type="button" disabled={busy} onClick={close}>
                {t.cancel}
              </Button>
              <Button
                type="button"
                tone="blue"
                disabled={busy}
                onClick={() => {
                  const target = lifecycleModal.team;
                  const rec = target.recruitment;
                  if (!rec) return;
                  if (lifecycleModal.kind === "renew") {
                    void run(
                      () =>
                        api.renewRecruitment(
                          rec.id,
                          lifecycleDuration,
                          rec.expiresAt ?? undefined,
                        ),
                      (updatedRec) =>
                        saveTeam(
                          { ...target, recruitment: updatedRec },
                          "recruitmentRenewed",
                        ),
                    );
                  } else {
                    void run(
                      () =>
                        api.republishRecruitment(rec.id, lifecycleDuration),
                      (updatedRec) =>
                        saveTeam(
                          { ...target, recruitment: updatedRec },
                          "recruitmentRepublished",
                        ),
                    );
                  }
                }}
              >
                {lifecycleModal.kind === "renew"
                  ? t.confirmRenew
                  : t.confirmRepublish}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
      {visibility && visibility.recruitment && (
        <Dialog
          title={
            visibility.recruitment.isPublished ? "下架招募" : "重新上架招募"
          }
          close={close}
          closeLabel={t.close}
          busy={busy}
        >
          <p>
            {visibility.recruitment.isPublished
              ? "下架后，其他同学无法在找队伍中看到这条招募或发起新申请。已有击掌记录与正式队伍成员关系不受影响。"
              : "重新上架后，这条招募会再次出现在找队伍。"}{" "}
          </p>
          <Alert message={error} />
          <div className="dialog-actions">
            <Button type="button" disabled={busy} onClick={close}>
              取消
            </Button>
            <Button
              disabled={busy}
              tone={visibility.recruitment.isPublished ? "urgent" : "blue"}
              onClick={() =>
                void run(
                  () =>
                    api.setRecruitmentVisibility(
                      visibility.recruitment!.id,
                      !visibility.recruitment!.isPublished,
                    ),
                  (recruitment) =>
                    saveTeam(
                      { ...visibility, recruitment },
                      recruitment.isPublished ? "teamRestored" : "teamArchived",
                    ),
                )
              }
            >
              {visibility.recruitment.isPublished ? "确认下架" : "确认上架"}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
