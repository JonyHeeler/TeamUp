import { CardFacts } from "./ui/SummaryCard";
import { Button } from "./ui/Button";
import type { ReactNode } from "react";
import type { Profile, ProfileInput } from "./api/client";
import { copy as t } from "./copy";
import { Skills, Tags } from "./SkillFields";

const fields = [
  "college",
  "major",
  "grade",
  "competitionIntent",
  "experience",
] as const;

type Project = NonNullable<ProfileInput["projects"]>[number];

const projectFields = [
  ["competition", t.projectCompetition],
  ["role", t.projectRole],
  ["award", t.projectAward],
  ["description", t.projectDescription],
] as const;

export default function ProfileEditor({
  profile,
  onChange,
  fieldError,
  skillError,
  onSave,
  saveLabel = t.save,
  busy,
  children,
}: {
  profile: ProfileInput;
  onChange: (profile: ProfileInput) => void;
  fieldError: (field: string) => ReactNode;
  skillError?: string;
  onSave: () => void;
  saveLabel?: string;
  busy: boolean;
  children: ReactNode;
}) {
  const customSkills = profile.customSkills ?? [];
  const projects = profile.projects ?? [];
  const setProjects = (projects: Project[]) =>
    onChange({ ...profile, projects });

  const profileSetting = (field: (typeof fields)[number]) => (
    <div className="profile-setting" key={field}>
      <label>
        {t[field]}
        {field === "experience" || field === "competitionIntent" ? (
          <textarea
            maxLength={500}
            value={profile[field] ?? ""}
            placeholder={t.optional}
            onChange={(event) =>
              onChange({ ...profile, [field]: event.target.value })
            }
          />
        ) : (
          <input
            required={["college", "major", "grade"].includes(field)}
            maxLength={80}
            value={profile[field] ?? ""}
            placeholder={
              ["college", "major", "grade"].includes(field)
                ? "必填，公开展示"
                : t.optional
            }
            onChange={(event) =>
              onChange({ ...profile, [field]: event.target.value })
            }
          />
        )}
        {fieldError(field)}
      </label>
      {["college", "major", "grade"].includes(field) ? (
        <small className="consent">必填，所有人可见</small>
      ) : (
        <Visibility
          label={t[field]}
          checked={profile.publicFields[field] ?? field === "college"}
          onChange={(checked) =>
            onChange({
              ...profile,
              publicFields: { ...profile.publicFields, [field]: checked },
            })
          }
        />
      )}
    </div>
  );

  return (
    <form
      className="editor profile-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <section className="editor-section" aria-labelledby="profile-basics">
        <h2 id="profile-basics">{t.basicProfile}</h2>
        <div className="form-row profile-basics-row">
          <label>
            {t.nickname}
            <input
              required
              maxLength={80}
              value={profile.nickname ?? ""}
              onChange={(event) =>
                onChange({ ...profile, nickname: event.target.value })
              }
            />
            {fieldError("nickname")}
          </label>
          <label>
            {t.qq}
            <input
              required
              maxLength={64}
              inputMode="numeric"
              autoComplete="off"
              value={profile.qq}
              aria-describedby="qq-privacy"
              onChange={(event) =>
                onChange({ ...profile, qq: event.target.value })
              }
            />
            <small id="qq-privacy" className="consent">
              {t.qqPrivacy}
            </small>
            {fieldError("qq")}
          </label>
        </div>
        {fields.filter((field) => field !== "experience").map(profileSetting)}
        <label>
          {t.contribution}
          <textarea
            required
            maxLength={500}
            value={profile.contribution}
            onChange={(event) =>
              onChange({ ...profile, contribution: event.target.value })
            }
          />
          {fieldError("contribution")}
        </label>
      </section>

      <div className="editor-section">
        <Skills
          grouped
          value={profile.skills}
          onChange={(skills) => onChange({ ...profile, skills })}
          error={skillError}
        />
        <fieldset className="custom-editor">
          <legend>{t.customSkills}</legend>
          {customSkills.map((item, index) => (
            <div className="custom-skill-row" key={index}>
              <input
                aria-label={t.customSkills + " " + (index + 1)}
                maxLength={32}
                value={item}
                onChange={(event) =>
                  onChange({
                    ...profile,
                    customSkills: customSkills.map((skill, position) =>
                      position === index ? event.target.value : skill,
                    ),
                  })
                }
              />
              <Button
                type="button"

                aria-label={
                  t.removeImage + " " + t.customSkills + " " + (index + 1)
                }
                onClick={() =>
                  onChange({
                    ...profile,
                    customSkills: customSkills.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                {t.removeImage}
              </Button>
            </div>
          ))}
          {customSkills.length < 12 && (
            <Button
              type="button"

              onClick={() =>
                onChange({ ...profile, customSkills: [...customSkills, ""] })
              }
            >
              {t.addSkill}
            </Button>
          )}
          {fieldError("customSkills")}
        </fieldset>
      </div>

      <section className="editor-section" aria-labelledby="experience-heading">
        <h2 id="experience-heading">{t.experience}</h2>
        {profileSetting("experience")}
        <div className="custom-editor">
          {projects.map((project, index) => (
            <fieldset className="project-editor" key={index}>
              <legend>
                {t.project} {index + 1}
              </legend>
              {projectFields.map(([field, label]) => {
                const props = {
                  value: project[field] ?? "",
                  onChange: (
                    event: React.ChangeEvent<
                      HTMLInputElement | HTMLTextAreaElement
                    >,
                  ) =>
                    setProjects(
                      projects.map((item, position) =>
                        position === index
                          ? { ...item, [field]: event.target.value }
                          : item,
                      ),
                    ),
                };
                return (
                  <label key={field}>
                    {label}
                    {field === "description" ? (
                      <textarea {...props} maxLength={500} />
                    ) : (
                      <input
                        {...props}
                        required={field === "competition"}
                        maxLength={80}
                      />
                    )}
                    {fieldError(`projects.${index}.${field}`)}
                  </label>
                );
              })}
              <Button
                type="button"

                aria-label={t.removeProject + " " + (index + 1)}
                onClick={() =>
                  setProjects(
                    projects.filter((_, position) => position !== index),
                  )
                }
              >
                {t.removeProject}
              </Button>
            </fieldset>
          ))}
          {projects.length < 20 && (
            <Button
              type="button"

              onClick={() =>
                setProjects([
                  ...projects,
                  { competition: "", role: "", award: "", description: "" },
                ])
              }
            >
              {t.addProject}
            </Button>
          )}
          {fieldError("projects")}
        </div>
        {children}
      </section>

      <div className="form-actions">
        <Button tone="blue" disabled={busy}>
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}

function Visibility({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="visibility">
      {t.public}
      <input
        type="checkbox"
        role="switch"
        aria-label={label + " · " + t.public}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function ProfileDetails({
  profile,
  qq,
}: {
  profile: Profile;
  qq?: string | null;
}) {
  const visibleFields = fields.filter((field) => !!profile[field]);
  const projects = profile.projects ?? [];
  return (
    <>
      <Tags skills={profile.skills} custom={profile.customSkills} />
      <p className="body-text">{profile.contribution}</p>
      {(visibleFields.length > 0 || qq) && (
        <dl className="details">
          {qq && (
            <div>
              <dt>{t.qq}</dt>
              <dd>{qq}</dd>
            </div>
          )}
          {visibleFields.map((field) => (
            <div key={field}>
              <dt>{t[field]}</dt>
              <dd>{profile[field]}</dd>
            </div>
          ))}
        </dl>
      )}
      {projects.length > 0 && (
        <div className="profile-projects">
          <strong>{t.experience}</strong>
          {projects.map((project, index) => (
            <dl className="details" key={index}>
              {projectFields.map(
                ([field, label]) =>
                  project[field] && (
                    <div key={field}>
                      <dt>{label}</dt>
                      <dd>{project[field]}</dd>
                    </div>
                  ),
              )}
            </dl>
          ))}
        </div>
      )}
    </>
  );
}

export function ProfileSummary({ profile }: { profile: Profile }) {
  return (
    <>
      <CardFacts
        items={[
          [t.college, profile.college || "未填写"],
          [t.major, profile.major || "未填写"],
          [t.grade, profile.grade || "未填写"],
        ]}
      />
      <p className="profile-card-summary">{profile.contribution}</p>
      <Tags
        skills={profile.skills.slice(0, 4)}
        custom={profile.customSkills?.slice(
          0,
          Math.max(0, 4 - profile.skills.length),
        )}
      />
    </>
  );
}
