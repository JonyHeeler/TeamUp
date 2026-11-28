import { useEffect, useState, type ReactNode } from "react";
import { copy as t } from "../copy";

/** 快速请求直接显示结果，慢请求才显示占位。 */
export function LoadingStatus({ children }: { children?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    children ?? (
      <p className="empty" role="status">
        {t.loading}
      </p>
    )
  );
}
