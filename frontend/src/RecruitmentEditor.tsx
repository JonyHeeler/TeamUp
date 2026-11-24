import { useState, type ReactNode } from "react";
import type {
  Competition,
  Recruitment,
  RecruitmentInput,
  Skill,
} from "./api/client";
import { copy as t } from "./copy";
import { Skills, Tags } from "./SkillFields";

type RequirementDraft = { skills: Skill[]; expectation: string };
const MAX_POSITIONS = 100;
const newRequirement = (): RequirementDraft => ({
  skills: [],
  expectation: "",
});

export default function RecruitmentEditor({
  competitions,
  initialCompetition,
  busy,
  fieldError,
  onPublish,
}: {
  competitions: Competition[];
  initialCompetition: string;
  busy: boolean;
  fieldError: (field: string) => ReactNode;
  onPublish: (team: RecruitmentInput) => void;
}) {
  const [competition, setCompetition] = useState(initialCompetition);
  const [teamName, setTeamName] = useState("");
  const [openings, setOpenings] = useState(1);
  const [requirements, setRequirements] = useState([newRequirement()]);
  const [background, setBackground] = useState("");
  const [checked, setChecked] = useState(false);

  const validOpenings =
    Number.isInteger(openings) && openings > 0 && openings <= MAX_POSITIONS;
  const visibleRequirements = requirements.slice(
    0,
    validOpenings ? openings : 0,
  );
  const updateRequirement = (index: number, item: RequirementDraft) =>
    setRequirements((current) =>
      current.map((entry, position) => (position === index ? item : entry)),
    );

  return (
    <form
      className="editor team-editor"
      onSubmit={(event) => {
        event.preventDefault();
        setChecked(true);
        if (
          !validOpenings ||
          visibleRequirements.length !== openings ||
          visibleRequirements.some(
            (item) => !item.skills.length && !item.expectation.trim(),
          )
        )
          return;
        onPublish({
          competition,
          teamName: teamName.trim() || undefined,
          openings,
          requirements: visibleRequirements,
          background,
        });
      }}
    >
      <div className="editor-section">
        <label>
          {t.catalogCompetition}
          <select
            value={competition}
            onChange={(event) => setCompetition(event.target.value)}
            required
          >
            <option value="" disabled>
              {t.chooseCompetition}
            </option>
            {competitions.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          {fieldError("competition")}
        </label>
        <div className="form-row">
          <label>
            {t.teamName}
            <input
              value={teamName}
              maxLength={80}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder={t.defaultTeamNumber}
            />
            {fieldError("teamName")}
          </label>
          <label>
            {t.openings}
            <input
              type="number"
              min={1}
              max={MAX_POSITIONS}
              step={1}
              required
              value={openings || ""}
              onChange={(event) => {
                const next = event.target.valueAsNumber;
                if (!Number.isFinite(next)) {
                  setOpenings(0);
                  return;
                }
                setOpenings(next);
                if (!Number.isInteger(next) || next < 1 || next > MAX_POSITIONS)
                  return;
                setRequirements((current) =>
                  current.length >= next
                    ? current
                    : [
                        ...current,
                        ...Array.from(
                          { length: next - current.length },
                          newRequirement,
                        ),
                      ],
                );
              }}
            />
            {fieldError("openings")}
          </label>
        </div>
        <label>
          {t.background}
          <textarea
            required
            maxLength={1200}
            value={background}
            onChange={(event) => setBackground(event.target.value)}
            placeholder={t.backgroundHint}
          />
          {fieldError("background")}
        </label>
      </div>

      <section className="editor-section" aria-labelledby="team-requirements">
        <h2 id="team-requirements">{t.requirements}</h2>
        {fieldError("requirements")}
        {visibleRequirements.map((item, index) => (
          <fieldset className="position-editor" key={index}>
            <legend>{t.requirement(index + 1)}</legend>
            <details className="position-skills">
              <summary>
                {t.selectTags}
                {item.skills.length > 0 && (
                  <span className="badge">{item.skills.length}</span>
                )}
              </summary>
              <Skills
                value={item.skills}
                onChange={(skills) =>
                  updateRequirement(index, { ...item, skills })
                }
              />
            </details>
            <Tags skills={item.skills} />
            <label>
              {t.expectation}
              <textarea
                maxLength={500}
                value={item.expectation}
                onChange={(event) =>
                  updateRequirement(index, {
                    ...item,
                    expectation: event.target.value,
                  })
                }
              />
            </label>
            {checked && !item.skills.length && !item.expectation.trim() && (
              <p className="field-error">{t.pickRequirement}</p>
            )}
            {fieldError("requirements." + index)}
          </fieldset>
        ))}
      </section>
      <div className="form-actions">
        <button className="primary" disabled={busy}>
          {t.create}
        </button>
      </div>
    </form>
  );
}

export function RecruitmentDetails({
  recruitment,
}: {
  recruitment: Recruitment;
}) {
  return (
    <>
      {recruitment.teamName !== recruitment.teamNumber && (
        <span className="team-competition">
          {t.teamNumber} {recruitment.teamNumber}
        </span>
      )}
      <p className="body-text">{recruitment.background}</p>
      {recruitment.requirements.length ? (
        <details className="recruitment-positions">
          <summary>
            {t.requirements}{" "}
            <span className="badge">{recruitment.requirements.length}</span>
          </summary>
          <ol>
            {recruitment.requirements.map((item, index) => (
              <li key={index}>
                <strong>{t.requirement(index + 1)}</strong>
                <Tags skills={item.skills ?? []} />
                {item.expectation && (
                  <p className="body-text">{item.expectation}</p>
                )}
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <Tags skills={recruitment.skills} />
      )}
    </>
  );
}
