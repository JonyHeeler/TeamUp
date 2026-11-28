import type { Recruitment } from "../api/client";
import { copy as t } from "../copy";
import CaptainProfile from "../pages/CaptainProfile";
import { Tags } from "../SkillFields";
import { CardFacts } from "../ui/SummaryCard";
import "./recruitment-details.css";

/** 显示队伍招募资料和各名额的要求。 */
export function RecruitmentDetails({
  recruitment,
}: {
  recruitment: Recruitment;
}) {
  return (
    <div className="team-detail">
      <div className="team-overview">
        <CardFacts
          items={[
            [t.catalogCompetition, recruitment.competition],
            ...(recruitment.openings
              ? [[t.openings, recruitment.openings] as const]
              : []),
            ...(recruitment.teamName !== recruitment.teamNumber
              ? [[t.teamNumber, recruitment.teamNumber] as const]
              : []),
          ]}
        />
        <CaptainProfile
          userId={recruitment.ownerId}
          nickname={recruitment.ownerNickname}
        />
      </div>
      <section>
        <h3>队伍介绍</h3>
        <p className="body-text">{recruitment.background}</p>
      </section>
      {recruitment.requirements.length ? (
        <section className="recruitment-positions" aria-label={t.requirements}>
          <h3>{t.requirements}</h3>
          <ol className="detail-entries" role="list">
            {recruitment.requirements.map((item, index) => (
              <li key={index}>
                {recruitment.requirements.length > 1 && (
                  <strong>{t.requirement(index + 1)}</strong>
                )}
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
    </div>
  );
}
