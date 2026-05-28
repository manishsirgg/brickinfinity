import React from "react";

export default function Card({
  children,
  className = "",
}: any) {
  return (
    <div
      className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-[var(--shadow-soft)] p-4 md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
