import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { API } from "../api";
import type { ActivityAttempt, ActivitySpec } from "./activities/contracts";

type SourceHit = { sourceRef: string; excerpt: string; title: string; unitType: string; unitNumber: number };
type ActivityRow = { id: string; version: number; title: string };
type AttemptRow = { attempt: ActivityAttempt; activityTitle: string };
type ActivitySession = { spec: ActivitySpec; attempt: ActivityAttempt; canvas: { id: string; revision: number; document?: unknown }; currentTask?: ActivitySpec["tasks"][number] | null; latestResult?: { status: string; summary: string } | null };

type Props = { courseId: string; lessonId: string; onClose: () => void; onStart: (session: ActivitySession) => void };

export function ActivityLibrary({ courseId, lessonId, onClose, onStart }: Props) {
  const [specs, setSpecs] = useState<ActivityRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceHits, setSourceHits] = useState<SourceHit[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceHit>();
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<{ spec: ActivitySpec; document: { objects: Array<{ id: string; kind: string; label?: string; value?: number; units?: string }> } }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`${API}/activities?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Activities could not be loaded.");
    setSpecs(value.specs ?? []);
    setAttempts(value.attempts ?? []);
  }, [courseId, lessonId]);

  useEffect(() => { void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Activities could not be loaded.")); }, [refresh]);

  const searchSource = async () => {
    setError(""); setNotice("");
    try {
      const response = await fetch(`${API}/document-intelligence/search?course=${encodeURIComponent(courseId)}&q=${encodeURIComponent(sourceQuery)}`);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Course source search failed.");
      setSourceHits(value.results ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Course source search failed."); }
  };

  const chooseSource = async (hit: SourceHit) => {
    setError(""); setNotice("");
    try {
      const response = await fetch(`${API}/document-intelligence/source?course=${encodeURIComponent(courseId)}&ref=${encodeURIComponent(hit.sourceRef)}`);
      const value = await response.json();
      if (!response.ok || typeof value.content !== "string") throw new Error(value.error || "The exact course excerpt could not be loaded.");
      setSelectedSource({ ...hit, excerpt: value.content.trim().slice(0, 900) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The exact course excerpt could not be loaded."); }
  };

  const insertTemplate = (domain: "force" | "graph") => {
    if (!selectedSource) { setError("Search this course and select a source excerpt first."); return; }
    const refs = [{ sourceRef: selectedSource.sourceRef, excerpt: selectedSource.excerpt }];
    const base = { schemaVersion: 1, version: 1, courseId, lessonId, objectives: [{ id: domain === "force" ? "motion-model" : "linear-graphs", concept: domain === "force" ? "net force, acceleration, and velocity-time graphs" : "linear graph interpretation", text: domain === "force" ? "Relate signed horizontal forces and mass to acceleration, velocity, and a velocity-time graph." : "Interpret the slope, intercept, or predicted value of a linear graph.", sourceRefs: refs }] };
    const spec = domain === "force" ? {
      ...base, id: "force-motion", title: "Force and motion", description: "Adjust the one-dimensional model, predict its motion, and read the linked velocity-time graph.",
      artifacts: [
        { id: "velocity-time", capabilityId: "canvas.linear-graph", config: { slope: 3, intercept: 3, xRange: [0, 5], xLabel: "time (s)", yLabel: "velocity (m/s)", position: { x: 145, y: 220 }, equationPosition: { x: 145, y: 30 } }, editablePaths: ["equation.variables", "equation.mathWorkspace.parameters"] },
        { id: "mass", capabilityId: "canvas.measurement", config: { label: "Mass", value: 2, units: "kg", position: { x: 60, y: 100 } }, editablePaths: ["object.value"] },
        { id: "initial-velocity", capabilityId: "canvas.vector", config: { label: "Initial velocity", components: [3, 0, 0], units: "m/s", position: { x: 60, y: 280 } }, editablePaths: ["object.components"] },
        { id: "force-right", capabilityId: "canvas.force-vector", config: { label: "Applied force", components: [8, 0, 0], units: "N", position: { x: 250, y: 100 } }, editablePaths: ["object.components"] },
        { id: "force-left", capabilityId: "canvas.force-vector", config: { label: "Opposing force", components: [-2, 0, 0], units: "N", position: { x: 250, y: 280 } }, editablePaths: ["object.components"] },
      ],
      checkers: [
        { id: "acceleration", capabilityId: "physics.force-motion", config: { mode: "acceleration", massArtifactId: "mass", forceArtifactIds: ["force-right", "force-left"], tolerance: 0.01 } },
        { id: "velocity-at-time", capabilityId: "physics.force-motion", config: { mode: "velocity-after-time", massArtifactId: "mass", velocityArtifactId: "initial-velocity", forceArtifactIds: ["force-right", "force-left"], timeSeconds: 2, tolerance: 0.01 } },
        { id: "graph-slope", capabilityId: "physics.force-motion", config: { mode: "velocity-time-graph", graphMode: "slope", massArtifactId: "mass", velocityArtifactId: "initial-velocity", forceArtifactIds: ["force-right", "force-left"], graphArtifactId: "velocity-time", tolerance: 0.01 } },
        { id: "graph-intercept", capabilityId: "physics.force-motion", config: { mode: "velocity-time-graph", graphMode: "intercept", massArtifactId: "mass", velocityArtifactId: "initial-velocity", forceArtifactIds: ["force-right", "force-left"], graphArtifactId: "velocity-time", tolerance: 0.01 } },
      ],
      tasks: [
        { id: "predict-acceleration", objectiveId: "motion-model", prompt: "Use the signed horizontal forces and mass to predict acceleration in m/s².", checkerId: "acceleration", artifactIds: ["mass", "force-right", "force-left"], hints: ["Add the signed horizontal force components.", "Divide the net force by the mass."], assessment: { mastery: "bkt" } },
        { id: "predict-velocity", objectiveId: "motion-model", prompt: "Using the current model, predict velocity after 2 seconds in m/s.", checkerId: "velocity-at-time", artifactIds: ["mass", "initial-velocity", "force-right", "force-left"], hints: ["Find acceleration from the current forces first.", "Use final velocity = initial velocity + acceleration × time."], assessment: { mastery: "bkt" } },
        { id: "match-graph-slope", objectiveId: "motion-model", prompt: "Update the linked graph so its slope matches the current force model, then enter that slope in m/s².", checkerId: "graph-slope", artifactIds: ["mass", "initial-velocity", "force-right", "force-left", "velocity-time"], hints: ["The slope of a velocity-time graph is acceleration.", "Set the graph parameter m to the net force divided by mass."], assessment: { mastery: "bkt" } },
        { id: "match-graph-intercept", objectiveId: "motion-model", prompt: "Make the graph's y-intercept match the current initial velocity, then enter the intercept in m/s.", checkerId: "graph-intercept", artifactIds: ["mass", "initial-velocity", "force-right", "force-left", "velocity-time"], hints: ["The y-intercept is the velocity when time is zero.", "Set the graph parameter b to the initial velocity vector's x component."], assessment: { mastery: "bkt" } },
      ], interactions: { allowMove: true, allowDrawing: false },
    } : {
      ...base, id: "linear-graph-interpretation", title: "Interpret a linear graph", description: "Explore a Math.js-backed function and interpret its graph.",
      artifacts: [{ id: "line", capabilityId: "canvas.linear-graph", config: { slope: 2, intercept: 3, xRange: [-5, 5], xLabel: "x", yLabel: "y", position: { x: 250, y: 240 }, equationPosition: { x: 145, y: 50 } }, editablePaths: ["equation.variables", "equation.mathWorkspace.parameters"] }],
      checkers: [{ id: "interpretation", capabilityId: "math.graph-interpretation", config: { mode: "slope", graphArtifactId: "line", atX: 0, tolerance: 0.01 } }],
      tasks: [{ id: "read-slope", objectiveId: "linear-graphs", prompt: "What is the slope of the current linked graph?", checkerId: "interpretation", artifactIds: ["line"], hints: ["Use the linked equation or compare rise with run."], assessment: { mastery: "bkt" } }],
      interactions: { allowMove: true, allowDrawing: false },
    };
    setJson(JSON.stringify(spec, null, 2)); setPreview(undefined); setError(""); setNotice("Template loaded. Edit the JSON, then preview or save it.");
  };

  const parseEditor = () => {
    const spec = JSON.parse(json) as ActivitySpec;
    if (spec.courseId !== courseId || spec.lessonId !== lessonId) throw new Error("Set courseId and lessonId to the selected course and lesson.");
    return spec;
  };

  const previewSpec = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const spec = parseEditor();
      const response = await fetch(`${API}/activities/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, lessonId, spec }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Activity preview failed.");
      setPreview({ spec: value.spec, document: value.document });
      setNotice("Spec, source scope, capabilities, and generated canvas validated.");
    } catch (reason) { setPreview(undefined); setError(reason instanceof Error ? reason.message : "Activity preview failed."); }
    finally { setBusy(false); }
  };

  const saveSpec = async () => {
    const spec = parseEditor();
    const response = await fetch(`${API}/activities/specs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, lessonId, spec }) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Activity could not be saved.");
    await refresh();
    const loaded = await fetch(`${API}/activities/specs/${encodeURIComponent(value.id)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`).then(async (result) => { const body = await result.json(); if (!result.ok) throw new Error(body.error || "Saved activity could not be loaded."); return body.spec as ActivitySpec; });
    setJson(JSON.stringify(loaded, null, 2));
    return value as { id: string; version: number };
  };

  const save = async () => {
    setBusy(true); setError(""); setNotice("");
    try { const saved = await saveSpec(); setNotice(`Saved version ${saved.version}.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Activity could not be saved."); }
    finally { setBusy(false); }
  };

  const start = async (activityId?: string) => {
    setBusy(true); setError("");
    try {
      let target = activityId;
      if (!target) target = (await saveSpec()).id;
      const response = await fetch(`${API}/activities/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, lessonId, activityId: target }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Activity could not be started.");
      onStart(value);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Activity could not be started."); }
    finally { setBusy(false); }
  };

  const resume = async (attemptId: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/activities/attempts/${encodeURIComponent(attemptId)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Attempt could not be resumed.");
      onStart(value);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Attempt could not be resumed."); }
    finally { setBusy(false); }
  };

  const loadSpec = async (id: string) => {
    setError("");
    try {
      const response = await fetch(`${API}/activities/specs/${encodeURIComponent(id)}?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Activity could not be loaded.");
      setJson(JSON.stringify(value.spec, null, 2)); setPreview(undefined); setNotice(`Loaded ${value.spec.title} v${value.spec.version}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Activity could not be loaded."); }
  };

  return <div className="modal-shade activity-library-shade" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="activity-library" role="dialog" aria-modal="true" aria-label="Learning activities">
      <header className="activity-library-head"><div><span className="eyebrow">{courseId} · {lessonId}</span><h2>Learning activities</h2><p>Use a course-backed specification to create a structured canvas task.</p></div><button className="icon-button" aria-label="Close activities" onClick={onClose}><X size={18} /></button></header>
      <div className="activity-library-grid">
        <section className="activity-library-list"><h3>Saved activities</h3>{specs.length ? specs.map((row) => <article className="activity-list-row" key={row.id}><div><b>{row.title}</b><small>{row.id} · v{row.version}</small></div><button className="button-soft" disabled={busy} onClick={() => void loadSpec(row.id)}>Inspect</button><button className="button-primary" disabled={busy} onClick={() => void start(row.id)}>Start</button></article>) : <p className="activity-muted">No activities for this lesson yet.</p>}
          <h3>Recent attempts</h3>{attempts.length ? attempts.map(({ attempt, activityTitle }) => <article className="activity-list-row" key={attempt.id}><div><b>{activityTitle}</b><small>{attempt.status} · {attempt.responses.length} checked</small></div><button className="button-soft" disabled={busy} onClick={() => void resume(attempt.id)}>Resume</button></article>) : <p className="activity-muted">Attempts appear here after you start an activity.</p>}
          <h3>Course source</h3><div className="activity-source-search"><input aria-label="Search course sources" value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchSource(); }} placeholder="Search indexed course material" /><button className="button-soft" disabled={!sourceQuery.trim()} onClick={() => void searchSource()}>Search</button></div>
          {sourceHits.map((hit) => <button className={`activity-source-hit ${selectedSource?.sourceRef === hit.sourceRef ? "selected" : ""}`} key={hit.sourceRef} onClick={() => void chooseSource(hit)}><b>{hit.title} · {hit.unitType} {hit.unitNumber}</b><span>{hit.excerpt}</span></button>)}
          {selectedSource && <div className="activity-template-actions"><button className="button-soft" onClick={() => insertTemplate("force")}>Use in force template</button><button className="button-soft" onClick={() => insertTemplate("graph")}>Use in graph template</button></div>}
        </section>
        <section className="activity-spec-editor"><div className="activity-editor-heading"><div><h3>Specification JSON</h3><small>Versioned data · registered capabilities only</small></div><button className="button-soft" disabled={busy || !json.trim()} onClick={() => void previewSpec()}>{busy ? "Checking…" : "Preview"}</button></div>
          <textarea aria-label="Activity specification JSON" spellCheck={false} value={json} onChange={(event) => { setJson(event.target.value); setPreview(undefined); }} placeholder="Select a source excerpt, then load a demonstration template or paste an ActivitySpec." />
          <div className="activity-editor-actions"><button className="button-soft" disabled={busy || !json.trim()} onClick={() => void save()}>Save version</button><button className="button-primary" disabled={busy || !json.trim()} onClick={() => void start()}>{busy ? "Working…" : "Save and start"}</button></div>
          {notice && <p className="activity-notice" role="status">{notice}</p>}{error && <p className="activity-error" role="alert">{error}</p>}
          {preview && <div className="activity-preview"><b>{preview.spec.title}</b><small>{preview.document.objects.length} generated canvas objects · {preview.spec.objectives.length} objectives · {preview.spec.tasks.length} tasks</small><div className="activity-preview-objects">{preview.document.objects.map((object) => <span key={object.id}>{object.label || object.kind}{object.kind === "measurement" ? ` · ${object.value} ${object.units}` : ` · ${object.kind}`}</span>)}</div><ol>{preview.spec.tasks.map((task) => <li key={task.id}>{task.prompt}</li>)}</ol></div>}
        </section>
      </div>
    </section>
  </div>;
}

export type { ActivitySession };
