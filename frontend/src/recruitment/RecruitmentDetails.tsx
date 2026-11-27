import type { Recruitment } from "../api/client";
import { copy as t } from "../copy";
import { Tags } from "../SkillFields";

/** 显示队伍招募资料和各名额的要求。 */
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
      <p className="body-text">队长：{recruitment.ownerNickname}</p>
      <p className="body-text">{recruitment.background}</p>
      {recruitment.requirements.length ? (
        <section className="recruitment-positions" aria-label={t.requirements}>
          <h3>{t.requirements}</h3>
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
        </section>
      ) : (
        <Tags skills={recruitment.skills} />
      )}
    </>
  );
}
