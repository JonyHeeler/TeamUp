import type { Profile } from "../api/client";
import { copy as t } from "../copy";
import EvidenceImage from "../EvidenceImage";
import { Tags } from "../SkillFields";
import { CardFacts } from "../ui/SummaryCard";
import "./profile-details.css";

const basicFields = ["college", "major", "grade"] as const;
const projectFacts = [
  ["role", t.projectRole],
  ["award", t.projectAward],
] as const;

/** 展示可见的名片详情及已授权联系方式。 */
export function ProfileDetails({
  profile,
  qq,
}: {
  profile: Profile;
  qq?: string | null;
}) {
  const contact = qq ?? profile.qq;
  const facts = basicFields.flatMap((field) => {
    const value = profile[field];
    return value ? [{ label: t[field], value }] : [];
  });
  if (contact) facts.push({ label: t.qq, value: contact });
  const hasSkills = profile.skills.length > 0 || !!profile.customSkills?.length;
  const projects = profile.projects ?? [];
  const evidence = profile.evidenceIds ?? [];
  return (
    <div className="profile-details">
      {facts.length > 0 && (
        <dl className="profile-facts">
          {facts.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(profile.contribution || hasSkills) && (
        <div className="profile-overview">
          {profile.contribution && (
            <section>
              <h3>{t.contribution}</h3>
              <p className="body-text">{profile.contribution}</p>
            </section>
          )}
          {hasSkills && (
            <section>
              <h3>{t.skills}</h3>
              <Tags skills={profile.skills} custom={profile.customSkills} />
            </section>
          )}
        </div>
      )}
      {profile.competitionIntent && (
        <section>
          <h3>{t.competitionIntent}</h3>
          <p className="body-text">{profile.competitionIntent}</p>
        </section>
      )}
      {(profile.experience || projects.length > 0) && (
        <section>
          <h3>{t.experience}</h3>
          {profile.experience && (
            <p className="body-text">{profile.experience}</p>
          )}
          {projects.length > 0 && (
            <ul className="detail-entries profile-projects" role="list">
              {projects.map((project, index) => (
                <li key={index}>
                  {project.competition && <h4>{project.competition}</h4>}
                  {(project.role || project.award) && (
                    <dl className="profile-project-facts">
                      {projectFacts.map(
                        ([field, label]) =>
                          project[field] && (
                            <div key={field}>
                              <dt>{label}</dt>
                              <dd>{project[field]}</dd>
                            </div>
                          ),
                      )}
                    </dl>
                  )}
                  {project.description && (
                    <p className="body-text">{project.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {evidence.length > 0 && (
        <section>
          <h3>{t.evidence}</h3>
          <div className="proof-grid">
            {evidence.map((id, index) => (
              <EvidenceImage
                key={id}
                entry={{ id }}
                userId={profile.userId}
                label={t.evidenceLabel(index + 1)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
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
