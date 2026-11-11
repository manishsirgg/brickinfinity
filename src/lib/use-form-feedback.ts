"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useFormFeedback() {
  const [feedback, setFeedback] = useState({ text: "", kind: "error" as "error" | "success", revision: 0 });
  const feedbackRef = useRef<HTMLDivElement>(null);
  const showFeedback = useCallback((text: string, kind: "error" | "success" = "error") => {
    setFeedback(previous => ({ text, kind, revision: previous.revision + 1 }));
  }, []);
  useEffect(() => {
    if (!feedback.text) return;
    feedbackRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [feedback]);
  return { feedback, feedbackRef, showFeedback };
}
