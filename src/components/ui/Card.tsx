import React from "react";

export default function Card({
  children,
  className = "",
}: any) {
  return (
    <div
      className={`bg-[var(--color-surface)] 
                  rounded-[var(--radius-lg)] 
                  shadow-[var(--shadow-soft)] 
                  p-6 
                  ${className}`}
    >
      {children}
    </div>
  );
}