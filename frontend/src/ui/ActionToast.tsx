import { Toaster, toast } from "sonner";

/** 将提示显示在当前原生模态框内或页面底部。 */
export function showToast(
  message: string,
  tone: "success" | "error",
  inDialog = false,
) {
  const toasterId = inDialog
    ? document.querySelector<HTMLDialogElement>(
        "dialog[open][data-toast-scope]",
      )?.dataset.toastScope
    : undefined;
  return toast[tone](message, { toasterId });
}

/** 展示短时、可读的底部操作提示。 */
export function ActionToaster({ id }: { id?: string }) {
  return (
    <Toaster
      id={id}
      position="bottom-center"
      containerAriaLabel="操作提醒"
      className="app-toaster"
      duration={3000}
      visibleToasts={1}
    />
  );
}
