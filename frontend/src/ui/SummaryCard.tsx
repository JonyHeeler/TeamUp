import "./summary-card.css";
import type { ReactNode } from "react";

/** 呈现列表项的标题、摘要和操作。 */
export function SummaryCard({
  title,
  context,
  badge,
  actions,
  children,
}: {
  title: string;
  context?: string;
  badge?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      className={`result-card profile-card summary-card${context ? " own-profile" : ""}`}
      aria-label={context}
    >
      <header className="summary-card-header">
        <div className="summary-card-title">
          {context ? (
            <>
              <h2 className="summary-card-context">{context}</h2>
              <p className="summary-card-name">{title}</p>
            </>
          ) : (
            <h2>{title}</h2>
          )}
        </div>
        {badge}
      </header>
      <div className="summary-card-content">{children}</div>
      <footer className="summary-card-actions">{actions}</footer>
    </article>
  );
}

/** 呈现卡片中的标签与对应内容。 */
export function CardFacts({
  items,
}: {
  items: ReadonlyArray<readonly [label: string, value: string]>;
}) {
  return (
    <dl
      className={
        items.length === 3 ? "card-facts card-facts--three" : "card-facts"
      }
    >
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
