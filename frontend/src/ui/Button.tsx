import type { ComponentProps } from "react";

/** 提供可复用的按钮样式和原生交互属性。 */
export function Button({
  tone = "blue",
  className = "",
  ...props
}: ComponentProps<"button"> & { tone?: "blue" | "urgent" }) {
  return (
    <button
      className={`button button--${tone} ${className}`.trim()}
      {...props}
    />
  );
}
