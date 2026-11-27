import type { Intent } from "../api/client";
import { copy as t } from "../copy";
import { Alert } from "./shared";
import { intentLabels } from "./intentLabels";

/** 分栏显示当前用户发出和收到的意向。 */
export default function IntentLists({
  intents,
  userId,
  error,
  openIntent,
}: {
  intents: Intent[];
  userId: string;
  error?: string;
  openIntent: (id: string) => void;
}) {
  const sentIntents: Intent[] = [];
  const receivedIntents: Intent[] = [];
  for (const entry of intents) {
    (entry.senderId === userId ? sentIntents : receivedIntents).push(entry);
  }
  const requestColumns = [
    {
      id: "sent-requests",
      title: t.sentIntents,
      empty: t.emptySentIntents,
      items: sentIntents,
    },
    {
      id: "received-requests",
      title: t.receivedIntents,
      empty: t.emptyReceivedIntents,
      items: receivedIntents,
    },
  ];
  return (
    <div className="request-columns">
      {requestColumns.map(({ id, title, empty, items }) => (
        <section key={id} aria-labelledby={id} className="request-column">
          <h2 id={id}>{title}</h2>
          <div className="request-list">
            {items.map((entry) => (
              <button
                className="request-row"
                key={entry.id}
                onClick={() => openIntent(entry.id)}
              >
                <span className="request-text">
                  <strong>{intentLabels(entry).title}</strong>
                  <span>{intentLabels(entry).context}</span>
                </span>
                {entry.canRespond ? (
                  <span className="status needs-response">
                    {t.actionRequired}
                  </span>
                ) : (
                  <span className={"status " + entry.status}>
                    {t[entry.status]}
                  </span>
                )}
                <span className="chevron" aria-hidden="true" />
              </button>
            ))}
            {!items.length &&
              (error ? (
                <Alert message={error} />
              ) : (
                <p className="empty">{empty}</p>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
