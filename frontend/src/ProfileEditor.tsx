import { Button } from "./ui/Button";
import type { ReactNode } from "react";
import type { ProfileInput } from "./api/client";
import { copy as t } from "./copy";
import { Skills } from "./SkillFields";

import { fields } from "./profile/fields";
import ProjectEditor from "./profile/ProjectEditor";

const fieldHints = {
  college: "必填，例如：统计学院",
  major: "必填，例如：数据科学与大数据技术",
  grade: "必填，例如：2024 级",
  competitionIntent:
    "选填，例如：希望参加数学建模比赛，寻找数据分析方向的队友。",
  experience: "选填，介绍你的参赛、项目或实践经历。",
} as const;

type Project = NonNullable<ProfileInput["projects"]>[number];

/** 编辑本人名片及其公开设置。 */
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
  /** 更新项目经历列表。 */
  const setProjects = (projects: Project[]) =>
    onChange({ ...profile, projects });

  /** 展示资料字段及其公开开关。 */
  const profileSetting = (field: (typeof fields)[number]) => (
    <div className="profile-setting" key={field}>
      <label>
        {t[field]}
        {field === "experience" || field === "competitionIntent" ? (
          <textarea
            maxLength={500}
            value={profile[field] ?? ""}
            placeholder={fieldHints[field]}
            onChange={(event) =>
              onChange({ ...profile, [field]: event.target.value })
            }
          />
        ) : (
          <input
            required={["college", "major", "grade"].includes(field)}
            maxLength={80}
            value={profile[field] ?? ""}
            placeholder={fieldHints[field]}
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
              placeholder="填写希望队友看到的称呼"
              value={profile.nickname ?? ""}
              onChange={(event) =>
                onChange({ ...profile, nickname: event.target.value })
              }
            />
            {fieldError("nickname")}
          </label>
          <div className="profile-contact">
            <label>
              {t.qq}
              <input
                required
                maxLength={64}
                placeholder="填写便于队友联系的 QQ 号"
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
            <Visibility
              label={t.qq}
              checked={profile.publicFields.qq ?? true}
              onChange={(checked) =>
                onChange({
                  ...profile,
                  publicFields: { ...profile.publicFields, qq: checked },
                })
              }
            />
          </div>
        </div>
        {fields.filter((field) => field !== "experience").map(profileSetting)}
        <label>
          {t.contribution}
          <textarea
            required
            maxLength={500}
            placeholder="介绍你的特长、能承担的任务，以及希望如何与队友合作。"
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
        <p className="consent">
          你也可以添加项目，展示参加过的比赛、担任的角色和取得的成果，让其他人更直观地了解你的经历。
        </p>
        <ProjectEditor
          projects={projects}
          setProjects={setProjects}
          fieldError={fieldError}
        />
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

/** 设置单个资料字段的公开状态。 */
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
    <div className="visibility" role="group" aria-label={label + "可见范围"}>
      <span className="visibility-caption">可见范围</span>
      <div className="visibility-options">
        <button
          type="button"
          aria-pressed={checked}
          onClick={() => onChange(true)}
        >
          公开
        </button>
        <button
          type="button"
          aria-pressed={!checked}
          onClick={() => onChange(false)}
        >
          隐藏
        </button>
      </div>
    </div>
  );
}
