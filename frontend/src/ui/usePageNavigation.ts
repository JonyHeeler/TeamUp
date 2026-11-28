import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { Notice } from "../pageTypes";

type Location = { href: string; notice?: Notice };
type HistoryAction = "push" | "replace" | "pop";

const primaryPages = ["/", "/teams", "/people", "/center"];

/** 读取当前地址的路径和查询参数。 */
const browserLocation = () => window.location.pathname + window.location.search;
/** 提取地址中用于判断页面归属的路径。 */
const pathname = (href: string) => href.split("?")[0];

/** 返回页面的导航顺序，用于决定过渡方向。 */
function routeOrder(path: string) {
  const tab = primaryPages.indexOf(path);
  if (tab >= 0) return tab;
  if (path.startsWith("/center") || path === "/teams/new")
    return path === "/teams/new" ? 3 : 3.5;
  if (path === "/about" || path.startsWith("/competitions/")) return 0.5;
  return 0;
}

/** 同步浏览器历史、路由过渡和页面焦点。 */
export function usePageNavigation() {
  const [location, setLocation] = useState<Location>(() => ({
    href: browserLocation(),
  }));
  const current = useRef(location.href);
  const entrance = useRef<Animation | null>(null);
  const focusHeading = useRef(false);
  const scrollToTop = useRef(false);

  const move = useCallback(
    (
      href: string,
      notice?: Notice,
      action: HistoryAction = "push",
      allowMotion = true,
    ) => {
      entrance.current?.cancel();
      entrance.current = null;

      const previous = pathname(current.current);
      const next = pathname(href);
      const changedPage = previous !== next;
      /** 提交 URL 和页面状态，并定位新页面的标题。 */
      const update = () => {
        if (action !== "pop" && href !== current.current) {
          window.history[action === "replace" ? "replaceState" : "pushState"](
            null,
            "",
            href,
          );
        }
        current.current = href;
        focusHeading.current = changedPage;
        setLocation((latest) =>
          latest.href === href && latest.notice === notice
            ? latest
            : { href, notice },
        );
        scrollToTop.current = changedPage && action !== "pop";
      };

      if (
        !changedPage ||
        !allowMotion ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ) {
        update();
        return;
      }

      const primarySwitch =
        primaryPages.includes(previous) && primaryPages.includes(next);
      const distance = primarySwitch ? 48 : 8;
      const offset =
        routeOrder(next) < routeOrder(previous) ? -distance : distance;
      flushSync(update);
      // 页面内容只做短入场，避免捕获和同时移动两张整页快照。
      const stage = document.querySelector(".page-viewport > main");
      entrance.current =
        stage?.animate?.(
          [
            {
              transform: "translateX(" + offset + "px)",
            },
            { transform: "none" },
          ],
          {
            duration: primarySwitch ? 220 : 160,
            easing: "cubic-bezier(0.23, 1, 0.32, 1)",
          },
        ) ?? null;
    },
    [],
  );

  useLayoutEffect(() => {
    if (scrollToTop.current) window.scrollTo({ top: 0, behavior: "instant" });
    scrollToTop.current = false;
  }, [location.href]);

  useEffect(() => {
    /** 将前进与后退操作同步到应用路由。 */
    const onPop = () => move(browserLocation(), undefined, "pop", false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      entrance.current?.cancel();
    };
  }, [move]);

  return { location, setLocation, move, focusHeading };
}
