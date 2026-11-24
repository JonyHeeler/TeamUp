import type { ComponentProps } from "react";

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
