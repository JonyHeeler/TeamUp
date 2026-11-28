import { useCallback, useEffect, useRef } from "react";
import type { usePageNavigation } from "./usePageNavigation";

type Move = ReturnType<typeof usePageNavigation>["move"];

/** 冷启动时给个人中心一次短等待，让标题和数据一起进入。 */
export function useCenterNavigation(move: Move, prepare?: () => Promise<void>) {
  const pending = useRef<number | null>(null);

  /** 取消尚未提交的切页。 */
  const cancel = useCallback(() => {
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", cancel);
    return () => {
      window.removeEventListener("popstate", cancel);
      cancel();
    };
  }, [cancel]);

  /** 已有快照时立即切换，慢请求超过等待预算后走正常加载状态。 */
  const navigate: Move = (href, notice, action, allowMotion) => {
    cancel();
    if (
      !prepare ||
      window.location.pathname === href ||
      (href !== "/center" && href !== "/teams/new")
    ) {
      move(href, notice, action, allowMotion);
      return;
    }

    /** 只提交当前仍有效的导航。 */
    function enter() {
      if (pending.current !== timer) return;
      cancel();
      move(href, notice, action, allowMotion);
    }

    const timer = window.setTimeout(enter, 450);
    pending.current = timer;
    void prepare().then(enter, enter);
  };

  return { navigate, cancel };
}
