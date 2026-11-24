import { SummaryCard } from "../ui/SummaryCard";
import { FilterSelect } from "../ui/FilterSelect";
import { Button } from "../ui/Button";
import { useState } from "react";
import "./people.css";
import { api, type Profile, type Recruitment, type Skill } from "../api/client";
import { copy as t } from "../copy";
import EvidenceImage from "../EvidenceImage";
import { ProfileDetails, ProfileSummary } from "../ProfileEditor";
import { skillGroups } from "../SkillFields";
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

export default function PeoplePage({ me }: Pick<PageProps, "me">) {
  const list = useResource(api.profiles);
  const { busy, run, clear, error, fieldError } = useAction();
  const [notice, setNotice] = useState<Notice>();
  const [skill, setSkill] = useState<Skill | "">("");
  const [collegeFilter, setCollegeFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [person, setPerson] = useState<Profile | null>(null);
  const [inviteTeam, setInviteTeam] = useState("");
  const [message, setMessage] = useState("");
  const [ownTeams, setOwnTeams] = useState<Recruitment[]>([]);
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
  const matchingPeople = people.filter(
    (entry) =>
      entry.userId !== me?.userId &&
      (!gradeFilter || entry.grade === gradeFilter) &&
      (!skill || entry.skills.includes(skill)) &&
      (!collegeFilter || entry.college === collegeFilter),
  );

  function closeDetail() {
    clear();
    setPerson(null);
  }

  function openProfile(userId: string) {
    setNotice(undefined);
    void run(
      async () => {
        const [profile, teams] = await Promise.allSettled([
          api.profile(userId),
          me ? api.recruitments() : Promise.resolve({ items: [] }),
        ]);
        if (profile.status === "rejected") throw profile.reason;
        return { profile: profile.value, teams };
      },
      ({ profile, teams }) => {
        setOwnTeams(
          teams.status === "fulfilled"
            ? teams.value.items.filter((team) => team.ownerId === me?.userId)
            : [],
        );
        setInviteError(teams.status === "rejected" ? t.failed : "");
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
          onChange={(value) => setSkill(value as Skill | "")}
          all={t.allSkills}
          groups={skillGroups.map(({ label, skills }) => ({
            label,
            options: skills.map((value) => ({
              value,
              label: t.skillNames[value],
            })),
          }))}
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
          label="按年级筛选"
          category={t.grade}
          value={gradeFilter}
          onChange={setGradeFilter}
          all="全部年级"
          options={grades.map((value) => ({ value, label: value }))}
        />
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
          {ownTeams.length ? (
            <div className="dialog-section">
              <select
                aria-label={t.inviteTeam}
                value={inviteTeam}
                onChange={(event) => setInviteTeam(event.target.value)}
              >
                <option value="">{t.inviteTeam}</option>
                {ownTeams.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.teamName} · {entry.competition}
                  </option>
                ))}
              </select>
              <IntentMessage
                value={message}
                onChange={setMessage}
                kind="invite"
                error={fieldError("message")}
              />
              <Button
                tone="blue"
                disabled={!inviteTeam || busy}
                onClick={() =>
                  void run(
                    () =>
                      api.createIntent({
                        kind: "invite",
                        recruitmentId: inviteTeam,
                        candidateId: person.userId,
                        message,
                      }),
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
          ) : inviteError ? (
            <Alert message={inviteError} />
          ) : (
            me && <p className="consent">{t.needTeam}</p>
          )}
        </Dialog>
      )}
    </>
  );
}
