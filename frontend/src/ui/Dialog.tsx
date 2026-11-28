import { useEffect, useId, useRef, type ReactNode } from "react";
import { ActionToaster } from "./ActionToast";

/** 展示模态对话框并管理焦点。 */
export function Dialog({
  title,
  close,
  closeLabel,
  busy = false,
  className = "",
  children,
}: {
  title: string;
  close: () => void;
  closeLabel: string;
  busy?: boolean;
  className?: string;
  children: ReactNode | ((dismiss: () => void) => ReactNode);
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
  /** 播放退场后再卸载弹窗，期间保持原生模态的焦点约束。 */
  function dismiss() {
    const dialog = ref.current;
    if (!dialog?.open) {
      close();
      return;
    }
    if (dialog.hasAttribute("data-closing")) return;
    dialog.setAttribute("data-closing", "");
    const animations = dialog.getAnimations?.() ?? [];
    if (!animations.length) {
      close();
      return;
    }
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (ref.current === dialog) close();
    });
  }

  return (
    <dialog
      ref={ref}
      data-toast-scope={titleId}
      aria-labelledby={titleId}
      className={`dialog ${className}`.trim()}
      onClickCapture={(event) => {
        if (event.currentTarget.hasAttribute("data-closing")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onSubmitCapture={(event) => {
        if (event.currentTarget.hasAttribute("data-closing")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) dismiss();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={closeLabel}
          disabled={busy}
          onClick={dismiss}
        >
          ×
        </button>
      </div>
      <div className="dialog-content">
        {typeof children === "function" ? children(dismiss) : children}
      </div>
      <ActionToaster id={titleId} />
    </dialog>
  );
}
