import type { ReactNode } from "react";
import type { Profile, ProfileInput } from "./api/client";
import { copy as t } from "./copy";
import { Skills, Tags } from "./SkillFields";

const fields = [
  "college",
  "major",
  "grade",
  "preferredRole",
  "availability",
  "interests",
  "experience",
] as const;

type CustomField = NonNullable<ProfileInput["customFields"]>[number];

export default function ProfileEditor({
  profile,
  onChange,
  fieldError,
  skillError,
  onSave,
  busy,
  children,
}: {
  profile: ProfileInput;
  onChange: (profile: ProfileInput) => void;
  fieldError: (field: string) => ReactNode;
  skillError?: string;
  onSave: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const customSkills = profile.customSkills ?? [];
  const customFields = profile.customFields ?? [];
  const updateCustomField = (index: number, changes: Partial<CustomField>) =>
    onChange({
      ...profile,
      customFields: customFields.map((item, position) =>
        position === index ? { ...item, ...changes } : item,
      ),
    });

  const profileSetting = (field: (typeof fields)[number]) => (
    <div className="profile-setting" key={field}>
      <label>
        {t[field]}
        {field === "experience" ? (
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
            required={field === "college"}
            maxLength={80}
            value={profile[field] ?? ""}
            placeholder={field === "college" ? undefined : t.optional}
            onChange={(event) =>
              onChange({ ...profile, [field]: event.target.value })
            }
          />
        )}
        {fieldError(field)}
      </label>
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
              <button
                type="button"
                className="secondary"
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
              </button>
            </div>
          ))}
          {customSkills.length < 12 && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange({ ...profile, customSkills: [...customSkills, ""] })
              }
            >
              {t.addSkill}
            </button>
          )}
          {fieldError("customSkills")}
        </fieldset>
      </div>

      <div className="editor-section">
        {profileSetting("experience")}
        {children}
      </div>

      <fieldset className="custom-editor editor-section">
        <legend>{t.customFields}</legend>
        {customFields.map((item, index) => (
          <div className="custom-profile-row" key={index}>
            <label>
              {t.customFieldName}
              <input
                required
                maxLength={32}
                value={item.label}
                onChange={(event) =>
                  updateCustomField(index, { label: event.target.value })
                }
              />
            </label>
            <label>
              {t.customFieldValue}
              <input
                required
                maxLength={200}
                value={item.value}
                onChange={(event) =>
                  updateCustomField(index, { value: event.target.value })
                }
              />
            </label>
            <div className="custom-profile-actions">
              <Visibility
                label={item.label || t.customFields + " " + (index + 1)}
                checked={item.isPublic ?? false}
                onChange={(isPublic) => updateCustomField(index, { isPublic })}
              />
              <button
                type="button"
                className="secondary"
                aria-label={
                  t.removeImage +
                  " " +
                  (item.label || t.customFields + " " + (index + 1))
                }
                onClick={() =>
                  onChange({
                    ...profile,
                    customFields: customFields.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                {t.removeImage}
              </button>
            </div>
            {fieldError("customFields." + index)}
          </div>
        ))}
        {fieldError("customFields")}
        {customFields.length < 8 && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              onChange({
                ...profile,
                customFields: [
                  ...customFields,
                  { label: "", value: "", isPublic: false },
                ],
              })
            }
          >
            {t.addField}
          </button>
        )}
      </fieldset>

      <div className="form-actions">
        <button className="primary" disabled={busy}>
          {t.save}
        </button>
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

export function ProfileDetails({ profile }: { profile: Profile }) {
  const visibleFields = fields.filter((field) => !!profile[field]);
  const customFields = profile.customFields ?? [];
  return (
    <>
      <Tags skills={profile.skills} custom={profile.customSkills} />
      <p className="body-text">{profile.contribution}</p>
      {(visibleFields.length > 0 || customFields.length > 0) && (
        <dl className="details">
          {visibleFields.map((field) => (
            <div key={field}>
              <dt>{t[field]}</dt>
              <dd>{profile[field]}</dd>
            </div>
          ))}
          {customFields.map((field) => (
            <div key={"custom-" + field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
