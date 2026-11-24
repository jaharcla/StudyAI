/**
 * React activation and the single Coach surface.
 * The surface follows the student across board, study and studio because it is mounted once
 * in App and pinned above the workspace. It never calls a view setter itself: App supplies
 * `onPrepare`, which prepares the real destination and reports success or failure.
 * This file is intentionally .ts: the surface is built with createElement so the named
 * module can own both activation and presentation without a second view file.
 */
import { createElement as h, useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ArrowRight, ChevronDown, Sparkles, X } from "lucide-react";
import { coachDismissalKey, type CoachContext, type CoachPrompt, type CoachTarget } from "./contract.js";
import { collectCoachPrompts } from "./service.js";
import "./coach.css";

const ENABLED_KEY = "studyai.coach.enabled";
const DISMISSED_KEY = "studyai.coach.dismissed";
const FAILURE_MESSAGE = "That step is not available right now. Nothing was changed.";
const READY_MESSAGE = {
  study: "Ready in Study. Your next question is loaded.",
  board: "Ready on the board. The saved activity is open.",
  studio: "Ready in Studio. Your source focus is set.",
};

export type CoachPreparation = (target: CoachTarget) => Promise<boolean> | boolean;

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function useCoach(context: CoachContext, onPrepare: CoachPreparation): { surface: ReactNode; refresh: () => void; prompts: CoachPrompt[] } {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(ENABLED_KEY) !== "0");
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(readDismissed);
  const [prompts, setPrompts] = useState<CoachPrompt[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const items = await collectCoachPrompts(context, dismissed);
    setPrompts(items);
  }, [context.courseId, context.lessonId, context.boardId, context.boardRevision, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void refresh().then(() => { if (!live) setPrompts([]); });
    return () => { live = false; };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const rememberDismissed = useCallback((key: string) => {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(key);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next].slice(-200)));
      return next;
    });
  }, []);

  const activate = useCallback(async (prompt: CoachPrompt) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const prepared = await onPrepare(prompt.target);
      if (prepared === false) setStatus({ text: FAILURE_MESSAGE, tone: "error" });
      else {
        rememberDismissed(coachDismissalKey(prompt, context));
        setExpanded(false);
        setStatus({ text: READY_MESSAGE[prompt.target.destination], tone: "success" });
      }
    } catch {
      setStatus({ text: FAILURE_MESSAGE, tone: "error" });
    } finally {
      setBusy(false);
    }
  }, [busy, context, onPrepare, rememberDismissed]);

  const toggleEnabled = useCallback(() => {
    setEnabled((current) => {
      localStorage.setItem(ENABLED_KEY, current ? "0" : "1");
      return !current;
    });
    setExpanded(false);
    setStatus(null);
  }, []);

  const top = prompts[0] ?? null;
  const secondary = useMemo(() => prompts.slice(1), [prompts]);
  const result = { prompts, refresh: () => void refresh() };

  if (!enabled) {
    return {
      ...result,
      surface: h("button", { type: "button", className: "coach-enable", "data-testid": "coach-enable", onClick: toggleEnabled },
        h(Sparkles, { size: 14, "aria-hidden": true }), " Show Coach"),
    };
  }

  const children: ReactNode[] = [
    h("span", { className: "coach-mark", "aria-hidden": true }, h(Sparkles, { size: 15 })),
    h("div", { className: "coach-copy" },
      top
        ? h("div", { "aria-live": "polite" },
            h("p", { className: "coach-reason", "data-testid": "coach-reason" }, top.reason),
            h("p", { className: "coach-preview", "data-testid": "coach-preview" }, top.preview))
        : h("p", { className: "coach-quiet", "data-testid": "coach-empty" }, "Coach is quiet for this lesson."),
      status ? h("p", { className: `coach-status ${status.tone}`, role: "status", "data-testid": "coach-status" }, status.text) : null),
  ];

  if (top) {
    children.push(h("button", {
      type: "button", className: "coach-continue", "data-testid": "coach-continue",
      disabled: busy, onClick: () => void activate(top),
    }, "Continue", h(ArrowRight, { size: 14, "aria-hidden": true })));
  }
  if (secondary.length > 0) {
    children.push(h("button", {
      type: "button", className: "coach-more", "data-testid": "coach-more",
      "aria-expanded": expanded, "aria-controls": "coach-secondary-list",
      onClick: () => setExpanded((current) => !current),
    }, `${secondary.length} more`, h(ChevronDown, { size: 14, "aria-hidden": true })));
  }
  children.push(h("button", {
    type: "button", className: "coach-icon coach-dismiss", "data-testid": "coach-dismiss",
    "aria-label": "Dismiss this Coach suggestion", disabled: !top,
    onClick: () => { if (top) rememberDismissed(coachDismissalKey(top, context)); },
  }, h(X, { size: 15, "aria-hidden": true })));
  children.push(h("button", {
    type: "button", className: "coach-icon coach-toggle", "data-testid": "coach-toggle",
    "aria-label": "Hide Coach", title: "Hide Coach", onClick: toggleEnabled,
  }, h(ChevronDown, { size: 15, "aria-hidden": true })));

  if (expanded) {
    children.push(h("ul", { className: "coach-secondary", id: "coach-secondary-list", "data-testid": "coach-secondary" },
      ...secondary.map((prompt) => h("li", { key: prompt.id, "data-testid": "coach-secondary-item", "data-prompt-id": prompt.id },
        h("div", null,
          h("p", null, prompt.reason),
          h("small", null, prompt.preview)),
        h("button", { type: "button", className: "coach-secondary-open", onClick: () => void activate(prompt) }, "Open")))));
  }

  return {
    ...result,
    surface: h("div", {
      className: "coach-dock", "data-testid": "coach-surface", role: "region", "aria-label": "Coach",
      onKeyDown: (event: ReactKeyboardEvent) => { if (event.key === "Escape") setExpanded(false); },
    }, ...children),
  };
}
