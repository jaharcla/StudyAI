import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@quickdrawjs/react";
import { Volume2, Square, Play, X } from "lucide-react";
import type { ScientificObject } from "./model";
import { objectBounds } from "./scene";
import { buildNarrationSegments } from "../narration/segments";
import { WebSpeechEngine } from "../narration/speech";
import "../narration/narration.css";

type Props = {
  objects: readonly ScientificObject[];
  boardRevision: number;
  editor: Editor | null;
};

export function NarrationPanel({ objects, boardRevision, editor }: Props) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [rate, setRate] = useState(1);
  const [, setCameraTick] = useState(0);
  const engineRef = useRef<WebSpeechEngine | null>(null);
  const runRef = useRef(0);
  const segments = useMemo(() => buildNarrationSegments(objects), [objects]);
  const supported = typeof window === "undefined" || Boolean(window.speechSynthesis);
  const activeIndex = segments.findIndex((segment) => segment.objectId === activeId);
  const activeSegment = activeIndex >= 0 ? segments[activeIndex] : undefined;
  const activeObject = activeSegment ? objects.find((object) => object.id === activeSegment.objectId) : undefined;

  if (!engineRef.current) engineRef.current = new WebSpeechEngine();

  useEffect(() => {
    if (!open || !editor) return;
    return editor.on("camera", () => setCameraTick((tick) => tick + 1));
  }, [open, editor]);

  const stop = useCallback(() => {
    runRef.current += 1;
    engineRef.current?.cancel();
    setActiveId(null);
    setPlaying(false);
    setEnded(false);
  }, []);

  const playFrom = useCallback(async (startIndex: number) => {
    const engine = engineRef.current;
    if (!engine?.supported() || segments.length === 0 || startIndex >= segments.length) return;
    const token = ++runRef.current;
    setPlaying(true);
    setEnded(false);
    for (let index = startIndex; index < segments.length; index += 1) {
      if (runRef.current !== token) return;
      const segment = segments[index];
      setActiveId(segment.objectId);
      await new Promise<void>((resolve) => engine.speak(segment.text, rate, segment.estimatedMs, resolve));
    }
    if (runRef.current !== token) return;
    setActiveId(null);
    setPlaying(false);
    setEnded(true);
  }, [segments, rate]);

  useEffect(() => () => { runRef.current += 1; engineRef.current?.cancel(); }, []);

  const origin = editor?.pageToScreen(0, 0) ?? { x: 0, y: 0 };
  const zoom = editor?.camera.z ?? 1;
  const bounds = activeObject ? objectBounds(activeObject) : undefined;

  return <>
    <button
      type="button"
      className="narration-open"
      data-testid="narration-open"
      aria-pressed={open}
      disabled={segments.length === 0}
      title="Listen to a grounded walkthrough of the objects on this board"
      onClick={() => { if (open) stop(); setOpen((value) => !value); }}
    ><Volume2 size={14} aria-hidden="true" />Narrate board</button>
    {open && <>
      {bounds && <svg className="narration-highlights" aria-hidden="true">
        <g transform={`translate(${origin.x} ${origin.y}) scale(${zoom})`}>
          <rect
            data-testid="narration-highlight"
            data-node-id={activeObject?.id}
            x={bounds.x - 12 / zoom}
            y={bounds.y - 12 / zoom}
            width={bounds.w + 24 / zoom}
            height={bounds.h + 24 / zoom}
            rx={8 / zoom}
            fill="rgba(217, 119, 6, 0.12)"
            stroke="#d97706"
            strokeWidth={2.5 / zoom}
          />
        </g>
      </svg>}
      <section
        className="narration-panel"
        data-testid="narration-panel"
        role="region"
        aria-label="Board narration"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); stop(); }
          if (event.code === "Space" && event.target === event.currentTarget) { event.preventDefault(); if (playing) stop(); else void playFrom(0); }
        }}
      >
        <header>
          <div><strong>Narrate board</strong><span>Walkthrough of {segments.length} object{segments.length === 1 ? "" : "s"} on this board</span></div>
          <button type="button" className="icon-button" aria-label="Close narration" onClick={() => { stop(); setOpen(false); }}><X size={14} /></button>
        </header>
        {!supported && <p className="narration-notice" data-testid="narration-unsupported">Speech is unavailable in this browser. The transcript below is still complete; playback is disabled.</p>}
        <div className="narration-controls">
          <button type="button" className="button-primary" data-testid="narration-play" disabled={!supported || playing || segments.length === 0} onClick={() => void playFrom(0)}><Play size={13} aria-hidden="true" />Play</button>
          <button type="button" className="button-soft" data-testid="narration-stop" onClick={stop}><Square size={12} aria-hidden="true" />Stop</button>
          <label>Speed <select aria-label="Narration speed" value={rate} onChange={(event) => setRate(Number(event.target.value))}>
            <option value={0.9}>0.9×</option><option value={1}>1×</option><option value={1.15}>1.15×</option>
          </select></label>
        </div>
        <div className="narration-progress" aria-label="Narration progress">
          {segments.map((segment, index) => <button
            key={segment.id}
            type="button"
            className={index === activeIndex ? "current" : ""}
            aria-label={`Go to segment ${index + 1}`}
            onClick={() => void playFrom(index)}
          />)}
        </div>
        <p
          className="narration-caption"
          data-testid="narration-caption"
          aria-live="polite"
          aria-atomic="true"
        >{activeSegment?.caption ?? (ended ? "Walkthrough finished." : "Press Play to hear your board explained.")}</p>
        <ol className="narration-transcript">
          {segments.map((segment, index) => <li key={segment.id}>
            <button
              type="button"
              data-testid="narration-transcript-cue"
              data-active={index === activeIndex}
              onClick={() => void playFrom(index)}
            >
              <span className="narration-cue-index">{index + 1}</span>
              <span className="narration-cue-body">
                <span className="narration-cue-label">{segment.label}</span>
                <span className="narration-cue-text">{segment.caption}</span>
                <span className={`narration-grounding ${segment.grounding}`}>{segment.groundingLabel}</span>
                {segment.sourceLabels.map((source) => <span className="narration-source" key={source}>{source}</span>)}
              </span>
            </button>
          </li>)}
        </ol>
        <footer>Revision {boardRevision} · browser speech, no audio uploaded</footer>
      </section>
    </>}
  </>;
}
