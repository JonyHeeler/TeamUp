import { CardFacts, SummaryCard } from "../ui/SummaryCard";
import { FilterSelect } from "../ui/FilterSelect";
import { Button } from "../ui/Button";
import { useState } from "react";
import { api, type Profile, type Recruitment } from "../api/client";
import { ProfileDetails } from "../ProfileEditor";
import { Tags } from "../SkillFields";
import "./people.css";
import { copy as t } from "../copy";
import { RecruitmentDetails } from "../RecruitmentEditor";
import {
  Alert,
  Dialog,
  IntentMessage,
  Feedback,
  Heading,
  describeError,
  formatRemainingTime,
  teamsHref,
  useAction,
  useResource,
  type Notice,
  type PageProps,
} from "./shared";

export default function TeamsPage({
  me,
  navigate,
  competitionId,
}: PageProps & {
  competitionId: string;
}) {
  const catalog = useResource(api.competitions);
  const list = useResource(api.recruitments);
  const { busy, run, clear, setError, error, fieldError } = useAction();
  const [notice, setNotice] = useState<Notice>();
  const [team, setTeam] = useState<Recruitment | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [memberCard, setMemberCard] = useState<Profile | null>(null);
  const [memberCardLoading, setMemberCardLoading] = useState(false);
  const [memberCardError, setMemberCardError] = useState("");

  function openTeam(entry: Recruitment) {
    clear();
    setMessage("");
    setApplying(false);
    setMemberCard(null);
    setMemberCardError("");
    setTeam(entry);
  }

  function closeTeam() {
    clear();
    setMemberCard(null);
    setMemberCardError("");
    setTeam(null);
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

  const competitions = catalog.data?.items ?? [];
  const competition =
    competitions.find((item) => item.id === competitionId)?.name ?? "";
  const matchingTeams = (list.data?.items ?? []).filter(
    (entry) => !competition || entry.competition === competition,
  );
  const feedback = error || list.error || catalog.error;

  return (
    <>
      <Heading title={t.teams} />
      <div className="view-tools">
        <FilterSelect
          label={t.filterCompetition}
          category={t.catalogCompetition}
          value={competition}
          onChange={(value) => {
            clear();
            setNotice(undefined);
            navigate(
              teamsHref(competitions.find((item) => item.name === value)?.id),
            );
          }}
          all={t.allCompetitions}
          options={competitions.map((item) => ({
            value: item.name,
            label: item.name,
          }))}
        />
      </div>
      {!team && (
        <Feedback
          error={feedback}
          notice={notice}
          onDismiss={() => {
            clear();
            setNotice(undefined);
          }}
        />
      )}
      <div className="results">
        {matchingTeams.map((entry) => {
          const memberCount = entry.memberCount ?? entry.members?.length ?? 1;
          return (
            <SummaryCard
              key={entry.id}
              title={entry.teamName}
              badge={
                entry.ownerId === me?.userId && (
                  <span className="badge">{t.yourTeam}</span>
                )
              }
              actions={
                <Button onClick={() => openTeam(entry)}>{t.viewTeam}</Button>
              }
            >
              <CardFacts
                items={[
                  [t.catalogCompetition, entry.competition],
                  [t.currentMembersLabel, `${memberCount}人`],
                  ...(entry.openings?.trim()
                    ? ([[t.openings, entry.openings.trim()]] as [
                        string,
                        string,
                      ][])
                    : []),
                  ...(entry.expiresAt && formatRemainingTime(entry.expiresAt)
                    ? ([[
                        t.recruitmentRemainingLabel,
                        formatRemainingTime(entry.expiresAt) ?? "",
                      ]] as [string, string][])
                    : []),
                ]}
              />
              <p className="profile-card-summary">{entry.background}</p>
              <Tags skills={entry.skills.slice(0, 4)} />
            </SummaryCard>
          );
        })}
        {!matchingTeams.length && !list.error && (
          <p className="empty">
            {list.data
              ? competition
                ? t.emptyMatches
                : t.emptyTeams
              : t.loading}
          </p>
        )}
      </div>
      {team && (
        <Dialog
          title={team.teamName}
          closeLabel={t.close}
          close={closeTeam}
          busy={busy}
        >
          <div className="team-card-meta">
            <span>{team.competition}</span>
            <span className="badge">
              {t.currentMembersCount(
                team.memberCount ?? team.members?.length ?? 1,
              )}
            </span>
            {team.openings?.trim() && (
              <span className="badge">{t.openCount(team.openings)}</span>
            )}
            {team.expiresAt && formatRemainingTime(team.expiresAt) && (
              <span className="badge">
                {t.recruitmentRemaining(
                  formatRemainingTime(team.expiresAt) ?? "",
                )}
              </span>
            )}
          </div>
          <Alert message={error} />
          <RecruitmentDetails recruitment={team} />
          {(team.members?.length ?? 0) > 0 && (
            <section className="dialog-section" aria-label={t.currentMembersLabel}>
              <strong>
                {t.existingMembersTitle(team.members?.length ?? 0)}
              </strong>
              <ul className="team-members-list">
                {(team.members ?? []).map((member) => (
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
            </section>
          )}
          {team.ownerId === me?.userId ? (
            <span className="owned">{t.yourTeam}</span>
          ) : applying ? (
            <form
              className="dialog-section"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    api.createIntent({
                      kind: "apply",
                      recruitmentId: team.id,
                      message,
                    }),
                  (result) => {
                    setTeam(null);
                    setNotice(result.status);
                  },
                );
              }}
            >
              <IntentMessage
                value={message}
                onChange={setMessage}
                kind="apply"
                error={fieldError("message")}
              />
              <div className="dialog-actions">
                <Button tone="blue" disabled={busy}>
                  {t.sendApplication}
                </Button>
              </div>
              <small className="consent">{t.share}</small>
            </form>
          ) : (
            <div className="dialog-section">
              <Button
                tone="blue"
                onClick={() =>
                  me ? setApplying(true) : setError(t.needPersona)
                }
              >
                {t.apply}
              </Button>
              <small className="consent">{t.share}</small>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
