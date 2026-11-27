import type { Profile } from "../api/client";
import { copy as t } from "../copy";
import { Tags } from "../SkillFields";
import { CardFacts } from "../ui/SummaryCard";
import { fields, projectFields } from "./fields";

/** 展示可见的名片详情及已授权联系方式。 */
export function ProfileDetails({
  profile,
  qq,
}: {
  profile: Profile;
  qq?: string | null;
}) {
  qq = qq ?? profile.qq;
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

/** 展示名片列表所需的摘要。 */
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
