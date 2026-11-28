import { toast } from "sonner";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { copy as t } from "../copy";

import type { Notice } from "../pageTypes";

export { Dialog } from "../ui/Dialog";
export type { Notice, Navigate, PageProps } from "../pageTypes";
export { describeError, useAction, useResource } from "./useRequest";

/** 显示页面标题。 */
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

/** 显示返回操作。 */
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

/** 通过提示消息显示操作结果。 */
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
      /** 响应用户手动关闭提示。 */
      onDismiss: () => dismiss.current?.(),
      /** 响应提示超时关闭。 */
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

/** 编辑意向附言。 */
export function IntentMessage({
  value,
  onChange,
  kind,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  kind: "apply" | "invite" | "personal" | "response";
  error?: ReactNode;
}) {
  const hintId = useId();
  const responding = kind === "response";
  const placeholders = {
    apply: t.applyHint,
    invite: t.inviteHint,
    personal: "说说想和对方交流或合作的方向。",
    response: "可以补充你的想法或下一步安排。",
  };
  return (
    <label className="intent-message">
      <span>{responding ? "回应" : t.intentMessage}</span>
      <textarea
        rows={3}
        maxLength={300}
        value={value}
        placeholder={placeholders[kind]}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <small id={hintId} className="consent">
        {responding ? "回应选填，最多 300 字。" : t.optionalMessage}
      </small>
      {error}
    </label>
  );
}

/** 生成赛事对应的队伍列表地址。 */
export function teamsHref(competitionId?: string) {
  const path = "/teams";
  return competitionId
    ? path + "?" + new URLSearchParams({ competition: competitionId })
    : path;
}

/** 显示错误提示。 */
export function Alert({ message }: { message: string }) {
  return (
    message && (
      <p className="alert" role="alert">
        {message}
      </p>
    )
  );
}
