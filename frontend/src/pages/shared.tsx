import { toast } from "sonner";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ApiError, type Intent, type Me } from "../api/client";
import { copy as t } from "../copy";

export type Notice =
  | "saved"
  | "published"
  | "teamSaved"
  | "teamArchived"
  | "teamRestored"
  | "teamInviteSent"
  | "teamCreatedOnly"
  | "formalInviteSent"
  | "formalInviteAccepted"
  | "formalInviteDeclined"
  | "teamUpdated"
  | "memberRemoved"
  | "leftTeam"
  | "teamDisbanded"
  | "recruitmentRepublished"
  | "recruitmentRenewed"
  | "existingTeamInviteNotice"
  | "declinedNotice"
  | Intent["status"];
export type Navigate = (
  href: string,
  notice?: Notice,
  replace?: boolean,
) => void;
export type PageProps = { me: Me | null; navigate: Navigate };

export function formatRemainingTime(
  expiresAt: string,
  nowMs = Date.now(),
): string | null {
  const diffMs = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  if (diffMs < dayMs) {
    return `${Math.max(1, Math.ceil(diffMs / hourMs))} 小时`;
  }
  return `${Math.ceil(diffMs / dayMs)} 天`;
}

export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return t.failed;
  return error.code === "unauthorized" ? t.needPersona : error.message;
}

export function useResource<T>(request: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void request().then(
      (data) => {
        if (active) setState({ data });
      },
      (error: unknown) => {
        if (active) setState({ error: describeError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [request, enabled]);
  return state;
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const revision = useRef(0);
  const writing = useRef(false);

  useEffect(
    () => () => {
      revision.current += 1;
    },
    [],
  );

  function clear() {
    revision.current += 1;
    setError("");
    setFieldErrors({});
  }

  async function run<T>(
    request: () => Promise<T>,
    done: (result: T) => void,
    write = true,
  ) {
    if (writing.current) return;
    clear();
    const operation = revision.current;
    if (write) {
      writing.current = true;
      setBusy(true);
    }
    try {
      const result = await request();
      if (operation === revision.current) done(result);
    } catch (error) {
      if (operation === revision.current) {
        setError(describeError(error));
        if (error instanceof ApiError) setFieldErrors(error.fields ?? {});
      }
    } finally {
      if (write) {
        writing.current = false;
        setBusy(false);
      }
    }
  }

  const fieldError = (key: string) => {
    const message = Object.entries(fieldErrors).find(
      ([field]) => field === key || field.startsWith(key + "."),
    )?.[1];
    return message && <small className="field-error">{message}</small>;
  };
  return {
    run,
    busy,
    error,
    setError,
    clear,
    fieldErrors,
    setFieldErrors,
    fieldError,
  };
}

export function Heading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <h1 tabIndex={-1}>{title}</h1>
      {children}
    </div>
  );
}

export function Back({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="back" onClick={onClick}>
      <span className="chevron left" aria-hidden="true" />
      {label}
    </button>
  );
}

export function Feedback({
  error,
  notice,
  onDismiss,
}: {
  error?: string;
  notice?: Notice;
  onDismiss?: () => void;
}) {
  const message = error || (notice ? t[notice] : "");
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (!message) return;
    const options = {
      onDismiss: () => dismiss.current?.(),
      onAutoClose: () => dismiss.current?.(),
    };
    const id = error
      ? toast.error(message, options)
      : toast.success(message, options);
    return () => {
      toast.dismiss(id);
    };
  }, [error, message]);
  return null;
}

export function IntentMessage({
  value,
  onChange,
  kind,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  kind: "apply" | "invite" | "personal" | "formal-invite";
  error?: ReactNode;
}) {
  const inputId = useId();
  const hintId = useId();
  return (
    <div className="intent-message">
      <label htmlFor={inputId}>{t.intentMessage}</label>
      <textarea
        id={inputId}
        rows={3}
        maxLength={300}
        value={value}
        placeholder={
          kind === "apply"
            ? t.applyHint
            : kind === "personal"
              ? t.personalInviteHint
              : kind === "formal-invite"
                ? t.formalInviteHint
                : t.inviteHint
        }
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <small id={hintId} className="consent">
        {t.optionalMessage}
      </small>
      {error}
    </div>
  );
}

export function IntentResponse({
  value,
  onChange,
  disabled = false,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: ReactNode;
}) {
  const inputId = useId();
  const hintId = useId();
  return (
    <div className="intent-message">
      <label htmlFor={inputId}>{t.intentResponse}</label>
      <textarea
        id={inputId}
        rows={3}
        maxLength={300}
        disabled={disabled}
        value={value}
        placeholder={t.responseHint}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <small id={hintId} className="consent">
        {t.optionalResponse}
      </small>
      {error}
    </div>
  );
}

export function teamsHref(competitionId?: string) {
  const path = "/teams";
  return competitionId
    ? path + "?" + new URLSearchParams({ competition: competitionId })
    : path;
}

export function Dialog({
  title,
  close,
  closeLabel,
  busy = false,
  children,
}: {
  title: string;
  close: () => void;
  closeLabel: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal?.();
    return () => {
      dialog?.close?.();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={closeLabel}
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </div>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}

export function Alert({ message }: { message: string }) {
  return (
    message && (
      <p className="alert" role="alert">
        {message}
      </p>
    )
  );
}
