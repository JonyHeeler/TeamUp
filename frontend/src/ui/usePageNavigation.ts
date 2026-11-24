import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Notice } from "../pages/shared";

type Location = { href: string; notice?: Notice };
type HistoryAction = "push" | "replace" | "pop";

const browserLocation = () => window.location.pathname + window.location.search;
const pathname = (href: string) => href.split("?")[0];

function routeOrder(path: string) {
  if (path === "/teams") return 1;
  if (path === "/people") return 2;
  if (path.startsWith("/center") || path === "/teams/new")
    return path === "/center" || path === "/teams/new" ? 3 : 3.5;
  if (path === "/about" || path.startsWith("/competitions/")) return 0.5;
  return 0;
}

export function usePageNavigation() {
  const [location, setLocation] = useState<Location>(() => ({
    href: browserLocation(),
  }));
  const current = useRef(location.href);
  const sequence = useRef(0);
  const transition = useRef<ViewTransition | null>(null);
  const fallback = useRef<Animation | null>(null);
  const focusHeading = useRef(false);

  const move = useCallback(
    (
      href: string,
      notice?: Notice,
      action: HistoryAction = "push",
      allowMotion = true,
    ) => {
      const revision = ++sequence.current;
      transition.current?.skipTransition();
      transition.current = null;
      fallback.current?.cancel();
      fallback.current = null;
      const root = document.documentElement;
      delete root.dataset.routeDirection;
      root.style.removeProperty("--route-header-edge");

      const previous = pathname(current.current);
      const next = pathname(href);
      const changedPage = previous !== next;
      const update = () => {
        if (revision !== sequence.current) return;
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
        if (changedPage && action !== "pop") window.scrollTo(0, 0);
      };

      if (
        !changedPage ||
        !allowMotion ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ) {
        update();
        return;
      }

      const direction =
        routeOrder(next) < routeOrder(previous) ? "back" : "forward";
      if (typeof document.startViewTransition === "function") {
        root.dataset.routeDirection = direction;
        const bottom =
          document.querySelector(".topbar")?.getBoundingClientRect().bottom ??
          0;
        root.style.setProperty(
          "--route-header-edge",
          `${Math.max(0, bottom)}px`,
        );
        const incoming = document.startViewTransition(() => flushSync(update));
        transition.current = incoming;
        // Interrupted transitions still run their update callback; the revision keeps it from committing.
        void incoming.ready.catch(() => {});
        const cleanup = () => {
          if (transition.current !== incoming) return;
          transition.current = null;
          delete root.dataset.routeDirection;
          root.style.removeProperty("--route-header-edge");
        };
        void incoming.finished.then(cleanup, cleanup);
        return;
      }

      const stage = document.querySelector(".page-viewport");
      if (!stage?.animate) {
        update();
        return;
      }
      flushSync(update);
      fallback.current = stage.animate(
        [
          {
            transform: `translateX(${direction === "back" ? -24 : 24}px)`,
            opacity: 0.85,
          },
          { transform: "none", opacity: 1 },
        ],
        { duration: 260, easing: "cubic-bezier(0.25, 0.65, 0.3, 1)" },
      );
    },
    [],
  );

  useEffect(() => {
    const onPop = () => move(browserLocation(), undefined, "pop");
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      sequence.current += 1;
      transition.current?.skipTransition();
      transition.current = null;
      fallback.current?.cancel();
      delete document.documentElement.dataset.routeDirection;
      document.documentElement.style.removeProperty("--route-header-edge");
    };
  }, [move]);

  return { location, setLocation, move, focusHeading };
}
