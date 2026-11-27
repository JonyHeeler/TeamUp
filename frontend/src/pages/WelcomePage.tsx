import { useRef } from "react";
import { api } from "../api/client";
import { copy as t } from "../copy";
import Welcome from "../Welcome";
import { Alert, useResource, type Navigate } from "./shared";

const competitionCovers = new Map([
  ["mcm-icm", "mcm-icm.svg"],
  ["ai-agent-campus", "ai-agent-campus.svg"],
]);

/** 为比赛卡片选择封面图。 */
function CompetitionArt({ id }: { id: string }) {
  const filename = competitionCovers.get(id) ?? "default.svg";
  return (
    <img
      className="competition-art"
      src={`${import.meta.env.BASE_URL}competitions/${filename}`}
      alt=""
      width={960}
      height={480}
    />
  );
}
/** 加载官方比赛目录并呈现欢迎页。 */
export default function WelcomePage({ navigate }: { navigate: Navigate }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const catalog = useResource(api.competitions);
  const recruitments = useResource(api.recruitments);
  const competitions = catalog.data?.items;
  const teams = recruitments.data?.items ?? [];
  return (
    <Welcome heading={heading} onAbout={() => navigate("/about")}>
      {competitions ? (
        competitions.length > 0 ? (
          <div className="competition-grid">
            {competitions.map((item) => (
              <button
                className="competition-card"
                key={item.id}
                onClick={() => navigate(`/competitions/${item.id}`)}
              >
                <CompetitionArt id={item.id} />
                <span className="competition-caption">
                  <span className="caption-content">
                    <strong>{item.name}</strong>
                    {recruitments.data && (
                      <span>
                        {t.teamCount(
                          teams.filter(
                            (entry) => entry.competition === item.name,
                          ).length,
                        )}
                      </span>
                    )}
                  </span>
                  <span className="card-arrow" aria-hidden="true">
                    <i className="chevron" />
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">{t.emptyCatalog}</p>
        )
      ) : catalog.error ? (
        <Alert message={catalog.error} />
      ) : (
        <p className="empty" role="status">
          {t.loading}
        </p>
      )}
    </Welcome>
  );
}
