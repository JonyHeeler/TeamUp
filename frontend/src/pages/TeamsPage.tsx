import { CardFacts, SummaryCard } from "../ui/SummaryCard";
import { FilterSelect } from "../ui/FilterSelect";
import { Button } from "../ui/Button";
import { useState } from "react";
import { api, type Recruitment } from "../api/client";
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

  function openTeam(entry: Recruitment) {
    clear();
    setMessage("");
    setApplying(false);
    setTeam(entry);
  }

  function closeTeam() {
    clear();
    setTeam(null);
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
        {matchingTeams.map((entry) => (
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
                [t.openings, t.openCount(entry.openings)],
              ]}
            />
            <p className="profile-card-summary">{entry.background}</p>
            <Tags skills={entry.skills.slice(0, 4)} />
          </SummaryCard>
        ))}
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
            <span className="badge">{t.openCount(team.openings)}</span>
          </div>
          <Alert message={error} />
          <RecruitmentDetails recruitment={team} />
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
