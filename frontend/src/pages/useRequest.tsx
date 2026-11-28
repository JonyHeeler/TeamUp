import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { copy as t } from "../copy";
import { showToast } from "../ui/ActionToast";

type ActionFeedback<T> = {
  success?: string | ((result: T) => string);
  inDialog?: boolean;
};

/** 将请求错误转换为界面提示。 */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return t.failed;
  return error.code === "unauthorized" ? t.needPersona : error.message;
}

/** 加载资源并忽略过期请求结果。 */
export function useResource<T>(request: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    if (!enabled) {
      setState((current) =>
        current.data !== undefined || current.error ? {} : current,
      );
      return;
    }
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

/** 管理操作的提交状态、错误和过期结果。 */
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

  /** 清除错误并作废已开始的操作结果。 */
  function clear() {
    revision.current += 1;
    setError("");
    setFieldErrors({});
  }

  /** 执行操作并在结果仍有效时更新界面。 */
  async function run<T>(
    request: () => Promise<T>,
    done: (result: T) => void,
    feedback: boolean | ActionFeedback<T> = true,
  ) {
    const write = feedback !== false;
    if (writing.current) return;
    clear();
    const operation = revision.current;
    if (write) {
      writing.current = true;
      setBusy(true);
    }
    try {
      const result = await request();
      if (operation === revision.current) {
        done(result);
        if (typeof feedback === "object" && feedback.success) {
          const message =
            typeof feedback.success === "function"
              ? feedback.success(result)
              : feedback.success;
          showToast(message, "success", feedback.inDialog);
        }
      }
    } catch (error) {
      if (operation === revision.current) {
        const message = describeError(error);
        setError(message);
        showToast(message, "error", true);
        if (error instanceof ApiError) setFieldErrors(error.fields ?? {});
      }
    } finally {
      if (write) {
        writing.current = false;
        setBusy(false);
      }
    }
  }

  /** 渲染指定字段的校验错误。 */
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
