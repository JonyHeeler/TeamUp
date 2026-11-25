import { SummaryCard } from "../ui/SummaryCard";
import { FilterSelect } from "../ui/FilterSelect";
import { Button } from "../ui/Button";
import { useState } from "react";
import "./people.css";
import { api, type Profile, type Recruitment } from "../api/client";
import { copy as t } from "../copy";
import EvidenceImage from "../EvidenceImage";
import { ProfileDetails, ProfileSummary } from "../ProfileEditor";
import {
  buildSkillFilterGroups,
  filterPeople,
  type SkillFilterValue,
} from "./peopleFilter";
import {
  Alert,
  Dialog,
  Feedback,
  Heading,
  IntentMessage,
  useAction,
  useResource,
  type Notice,
  type PageProps,
} from "./shared";

const skillFilterGroups = buildSkillFilterGroups();
type InviteMode = "team" | "personal";
type TeamsLoadState = "idle" | "loading" | "ready" | "error";

export default function PeoplePage({ me }: Pick<PageProps, "me">) {
  const list = useResource(api.profiles);
  const { busy, run, clear, error, fieldError } = useAction();
  const [notice, setNotice] = useState<Notice>();
  const [skill, setSkill] = useState<SkillFilterValue>("");
  const [skillKeyword, setSkillKeyword] = useState("");
  const [collegeFilter, setCollegeFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [person, setPerson] = useState<Profile | null>(null);
  const [inviteMode, setInviteMode] = useState<InviteMode>("personal");
  const [inviteTeam, setInviteTeam] = useState("");
  const [message, setMessage] = useState("");
  const [ownTeams, setOwnTeams] = useState<Recruitment[]>([]);
  const [teamsState, setTeamsState] = useState<TeamsLoadState>("idle");
  const [inviteError, setInviteError] = useState("");
  const people = list.data?.items ?? [];
  const colleges = [
    ...new Set(
      people.flatMap((entry) => (entry.college ? [entry.college] : [])),
    ),
  ].sort((left, right) => left.localeCompare(right, "zh"));
  const grades = [
    ...new Set(people.flatMap((entry) => (entry.grade ? [entry.grade] : []))),
  ].sort((a, b) => a.localeCompare(b, "zh"));
  const matchingPeople = filterPeople(people, {
    skillFilter: skill,
    skillKeyword,
    collegeFilter,
    gradeFilter,
    currentUserId: me?.userId,
  });
  const hasActiveFilters = Boolean(
    skill || skillKeyword || collegeFilter || gradeFilter,
  );
  const publishedOwnTeams = ownTeams.filter((team) => team.isPublished);
  const hasArchivedOnly =
    teamsState === "ready" &&
    ownTeams.length > 0 &&
    publishedOwnTeams.length === 0;
  const hasNoTeams = teamsState === "ready" && ownTeams.length === 0;
  const canUseTeamMode =
    teamsState === "ready" && publishedOwnTeams.length > 0;

  function clearFilters() {
    setSkill("");
    setSkillKeyword("");
    setCollegeFilter("");
    setGradeFilter("");
  }

  function closeDetail() {
    clear();
    setPerson(null);
    setTeamsState("idle");
    setInviteError("");
  }

  function openProfile(userId: string) {
    setNotice(undefined);
    setInviteError("");
    setTeamsState(me ? "loading" : "idle");
    void run(
      async () => {
        const [profile, teams] = await Promise.allSettled([
          api.profile(userId),
          me ? api.ownRecruitments() : Promise.resolve({ items: [] }),
        ]);
        if (profile.status === "rejected") throw profile.reason;
        return { profile: profile.value, teams };
      },
      ({ profile, teams }) => {
        if (!me) {
          setOwnTeams([]);
          setTeamsState("idle");
          setInviteError("");
        } else if (teams.status === "fulfilled") {
          const mine = teams.value.items.filter(
            (team) => team.ownerId === me.userId,
          );
          const active = mine.filter((team) => team.isPublished);
          setOwnTeams(mine);
          setTeamsState("ready");
          setInviteError("");
          setInviteMode(active.length > 0 ? "team" : "personal");
        } else {
          setOwnTeams([]);
          setTeamsState("error");
          setInviteError(t.failed);
          setInviteMode("personal");
        }
        setInviteTeam("");
        setMessage("");
        setPerson(profile);
      },
      false,
    );
  }

  return (
    <>
      <Heading title={t.people} />
      <div className="view-tools">
        <FilterSelect
          label={t.filter}
          category={t.skills}
          value={skill}
          onChange={(value) => setSkill(value as SkillFilterValue)}
          all={t.allSkills}
          groups={skillFilterGroups}
        />
        <FilterSelect
          label={t.filterCollege}
          category={t.college}
          value={collegeFilter}
          onChange={setCollegeFilter}
          all={t.allColleges}
          options={colleges.map((value) => ({ value, label: value }))}
        />
        <FilterSelect
          label={t.filterGrade}
          category={t.grade}
          value={gradeFilter}
          onChange={setGradeFilter}
          all={t.allGrades}
          options={grades.map((value) => ({ value, label: value }))}
        />
        <label
          className="filter-search"
          data-filtered={skillKeyword.trim() ? "" : undefined}
        >
          <span className="filter-category" aria-hidden="true">
            {t.skillKeyword}
          </span>
          <input
            type="search"
            aria-label={t.searchSkill}
            value={skillKeyword}
            onChange={(event) => setSkillKeyword(event.target.value)}
          />
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            className="filter-clear"
            onClick={clearFilters}
          >
            {t.clearFilters}
          </button>
        )}
      </div>
      {!person && (
        <Feedback
          error={error || list.error}
          notice={notice}
          onDismiss={() => {
            clear();
            setNotice(undefined);
          }}
        />
      )}
      <div className="results">
        {matchingPeople.map((entry) => (
          <SummaryCard
            key={entry.userId}
            title={entry.nickname}
            actions={
              <Button onClick={() => openProfile(entry.userId)}>
                {t.card}
              </Button>
            }
          >
            <ProfileSummary profile={entry} />
          </SummaryCard>
        ))}
        {!matchingPeople.length && !list.error && (
          <p className="empty">{list.data ? t.emptyPeople : t.loading}</p>
        )}
      </div>
      {person && (
        <Dialog
          title={person.nickname}
          closeLabel={t.close}
          busy={busy}
          close={closeDetail}
        >
          <Alert message={error} />
          <ProfileDetails profile={person} />
          {person.evidenceIds && person.evidenceIds.length > 0 && (
            <div className="proof-grid" role="group" aria-label={t.evidence}>
              {person.evidenceIds.map((id, index) => (
                <EvidenceImage
                  key={id}
                  entry={{ id }}
                  userId={person.userId}
                  label={t.evidenceLabel(index + 1)}
                />
              ))}
            </div>
          )}
          {me && (
            <div className="dialog-section">
              {teamsState === "error" && inviteError && (
                <Alert message={inviteError} />
              )}
              {teamsState === "loading" && (
                <small className="consent" role="status">
                  {t.loading}
                </small>
              )}
              <div className="invite-controls">
                {inviteMode === "team" && (
                  <select
                    aria-label={t.inviteTeam}
                    value={inviteTeam}
                    disabled={busy || !canUseTeamMode}
                    onChange={(event) => setInviteTeam(event.target.value)}
                  >
                    <option value="">{t.inviteTeam}</option>
                    {publishedOwnTeams.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.teamName} · {entry.competition}
                      </option>
                    ))}
                  </select>
                )}
                <div
                  className="invite-mode-switch"
                  role="group"
                  aria-label={t.inviteMode}
                >
                  <button
                    type="button"
                    aria-pressed={inviteMode === "team"}
                    disabled={busy || !canUseTeamMode}
                    onClick={() => setInviteMode("team")}
                  >
                    {t.inviteModeTeam}
                  </button>
                  <button
                    type="button"
                    aria-pressed={inviteMode === "personal"}
                    disabled={busy}
                    onClick={() => setInviteMode("personal")}
                  >
                    {t.inviteModePersonal}
                  </button>
                </div>
              </div>
              {hasArchivedOnly && (
                <small className="consent">{t.allTeamsArchivedForInvite}</small>
              )}
              {hasNoTeams && (
                <small className="consent">{t.noActiveTeamsForInvite}</small>
              )}
              <IntentMessage
                value={message}
                onChange={setMessage}
                kind={inviteMode === "team" ? "invite" : "personal"}
                error={fieldError("message")}
              />
              <Button
                tone="blue"
                disabled={busy || (inviteMode === "team" && !inviteTeam)}
                onClick={() =>
                  void run(
                    () =>
                      api.createIntent(
                        inviteMode === "team"
                          ? {
                              kind: "invite",
                              recruitmentId: inviteTeam,
                              candidateId: person.userId,
                              message,
                            }
                          : {
                              kind: "personal",
                              candidateId: person.userId,
                              message,
                            },
                      ),
                    (result) => {
                      setPerson(null);
                      setNotice(result.status);
                    },
                  )
                }
              >
                {t.invite}
              </Button>
              <small className="consent">{t.share}</small>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
