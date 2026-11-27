import { useState, type ReactNode } from "react";
import type { IntentDetail } from "../api/client";
import { copy as t } from "../copy";
import { Button } from "../ui/Button";
import { Alert, Dialog, IntentMessage } from "./shared";
import { intentLabels } from "./intentLabels";

/** 展示意向详情并提供回应操作。 */
export default function IntentDialog({
  intent,
  busy,
  error,
  close,
  respond,
  fieldError,
}: {
  intent: IntentDetail;
  busy: boolean;
  error: string;
  close: () => void;
  respond: (
    intent: IntentDetail,
    decision: "accepted" | "declined",
    message: string,
  ) => void;
  fieldError?: ReactNode;
}) {
  const [message, setMessage] = useState("");
  const { title, context } = intentLabels(intent);
  return (
    <Dialog title={title} closeLabel={t.close} busy={busy} close={close}>
      <Alert message={error} />
      <div className="request-meta">
        <span className={"status " + intent.status}>{t[intent.status]}</span>
        <span>{context}</span>
      </div>
      {intent.message && (
        <div className="intent-note">
          <strong>{t.intentMessage}</strong>
          <p>{intent.message}</p>
        </div>
      )}
      {intent.responseMessage && (
        <div className="intent-note">
          <strong>回应</strong>
          <p>{intent.responseMessage}</p>
        </div>
      )}
      {intent.status === "accepted" && intent.counterpartQq && (
        <div className="contact">
          <small>{t.otherContact}</small>
          <strong>{intent.counterpartQq}</strong>
        </div>
      )}
      {intent.canRespond && (
        <div className="dialog-section">
          <IntentMessage
            value={message}
            onChange={setMessage}
            kind="response"
            error={fieldError}
          />
          <div className="dialog-actions">
            <Button
              disabled={busy}
              onClick={() => respond(intent, "declined", message)}
            >
              {t.decline}
            </Button>
            <Button
              tone="blue"
              disabled={busy}
              onClick={() => respond(intent, "accepted", message)}
            >
              {t.accept}
            </Button>
          </div>
          <small className="consent">{t.share}</small>
        </div>
      )}
    </Dialog>
  );
}
