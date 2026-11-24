import { useMemo, useState } from "react";
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import { ArrowRight, ChevronRight, Quote } from "lucide-react";
import { sourceLabel, type MindMapContent, type MindMapNode } from "./api";

type ConceptData = {
  id: string;
  label: string;
  detail?: string;
  sourceRef?: string;
  hasChildren: boolean;
  expanded: boolean;
  mastery?: number;
  lessonTitle?: string;
  canPractice?: boolean;
  sourceLabel?: string;
  onToggle: (id: string) => void;
  onPractice?: (id: string) => void;
};

function ConceptNode({ data }: NodeProps<Node<ConceptData>>) {
  return (
    <div className="studio-map-node" data-testid="mind-map-node">
      <Handle type="target" position={Position.Left} className="studio-map-handle" />
      <div className="studio-map-node-label">{data.label}</div>
      {data.detail && <div className="studio-map-node-detail">{data.detail}</div>}
      {data.mastery !== undefined && (
        <div
          className={`studio-map-node-mastery ${data.mastery < 0.5 ? "weak" : data.mastery < 0.75 ? "growing" : "strong"}`}
          data-testid="concept-mastery" data-concept={data.label}
        >
          <span>Mastery</span> <b>{Math.round(data.mastery * 100)}%</b>
        </div>
      )}
      {data.canPractice && data.mastery !== undefined && data.mastery < 0.5 && (
        <button
          type="button" className="studio-map-practice" data-testid="concept-practice" data-concept={data.label}
          aria-label={`Practice ${data.label}`}
          onClick={(event) => { event.stopPropagation(); data.onPractice?.(data.id); }}
        >
          <ArrowRight size={12} aria-hidden="true" /> Practice
        </button>
      )}
      <div className="studio-map-node-foot">
        {data.sourceRef && <span className="studio-map-source surface-provenance"><Quote size={10} /> {sourceLabel(data.sourceRef, data.sourceLabel)}</span>}
        {data.hasChildren && (
          <button
            type="button"
            className="studio-map-toggle"
            aria-label={data.expanded ? "Collapse branch" : "Expand branch"}
            onClick={(event) => { event.stopPropagation(); data.onToggle(data.id); }}
          >
            <ChevronRight size={13} style={{ transform: data.expanded ? "rotate(90deg)" : undefined }} />
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="studio-map-handle" />
    </div>
  );
}

const nodeTypes = { concept: ConceptNode };

export default function MindMapView({ content, onOpenSource, onPractice }: { content: MindMapContent; onOpenSource: (ref: string) => void; onPractice?: (node: MindMapNode) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  const graph = useMemo(() => {
    const byId = new Map(content.nodes.map((node) => [node.id, node]));
    const children = new Map<string, string[]>();
    for (const node of content.nodes) {
      if (!node.parentId) continue;
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    }
    const depth = (id: string, seen = new Set<string>()): number => {
      if (seen.has(id)) return 0;
      seen.add(id);
      const node = byId.get(id);
      return node?.parentId && byId.has(node.parentId) ? 1 + depth(node.parentId, seen) : 0;
    };
    const visible = new Set<string>();
    const visit = (id: string) => {
      if (visible.has(id)) return;
      visible.add(id);
      if (collapsed.has(id)) return;
      for (const child of children.get(id) ?? []) visit(child);
    };
    const roots = content.nodes.filter((node) => !node.parentId);
    if (roots.length) for (const root of roots) visit(root.id);
    // A malformed graph with no root still renders every node.
    else for (const node of content.nodes) visit(node.id);

    const counts = new Map<number, number>();
    const nodes: Node<ConceptData>[] = content.nodes.filter((node) => visible.has(node.id)).map((node) => {
      const level = depth(node.id);
      const row = counts.get(level) ?? 0;
      counts.set(level, row + 1);
      const kids = children.get(node.id) ?? [];
      return {
        id: node.id,
        type: "concept",
        position: { x: 40 + level * 290, y: 40 + row * 130 },
        data: {
          id: node.id, label: node.label, detail: node.detail, sourceRef: node.sourceRef,
          mastery: node.mastery, lessonTitle: node.lessonTitle, canPractice: node.canPractice, sourceLabel: node.sourceLabel,
          hasChildren: kids.length > 0, expanded: !collapsed.has(node.id),
          onToggle: (id: string) => setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          }),
          onPractice: onPractice ? (id: string) => {
            const target = content.nodes.find((item) => item.id === id);
            if (target) onPractice(target);
          } : undefined,
        },
      };
    });
    const derived: Edge[] = content.nodes
      .filter((node) => node.parentId && visible.has(node.id) && visible.has(node.parentId))
      .map((node) => ({
        id: `${node.parentId}-${node.id}`,
        source: node.parentId!, target: node.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      }));
    const drawn = new Set(derived.map((edge) => `${edge.source}-${edge.target}`));
    const extra: Edge[] = (content.edges ?? [])
      .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
      .filter((edge) => {
        const key = `${edge.source}-${edge.target}`;
        if (drawn.has(key)) return false;
        drawn.add(key);
        return true;
      })
      .map((edge) => ({
        id: `${edge.source}-${edge.target}-relation`,
        source: edge.source, target: edge.target, label: edge.label,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { strokeDasharray: "5 4" },
      }));
    return { nodes, edges: [...derived, ...extra] };
  }, [content, collapsed, onPractice]);

  const active = content.nodes.find((node) => node.id === selected);

  return (
    <div className="studio-map" data-testid="mind-map">
      <div className="studio-map-canvas">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelected(node.id)}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
        >
          <Background gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="studio-map-inspector">
        {!active ? <p className="studio-muted">Select a node to see its evidence. Expand a branch with the arrow on a node.</p> : (
          <>
            <span className="studio-eyebrow">SELECTED CONCEPT</span>
            <h4>{active.label}</h4>
            {active.lessonTitle && <p className="studio-muted">{active.lessonTitle}</p>}
            {active.mastery !== undefined && (
              <p data-testid="concept-inspector-mastery">Mastery: {Math.round(active.mastery * 100)}%</p>
            )}
            {active.canPractice && active.mastery !== undefined && active.mastery < 0.5 && onPractice && (
              <button type="button" className="studio-map-practice" data-testid="concept-inspector-practice" onClick={() => onPractice(active)}>
                <ArrowRight size={12} aria-hidden="true" /> Practice {active.label}
              </button>
            )}
            {active.detail && <p>{active.detail}</p>}
            {active.sourceRef?.startsWith("studyai://") ? (
              <button type="button" className="studio-source-button surface-provenance" onClick={() => onOpenSource(active.sourceRef!)}>
                <Quote size={12} /> Open source · {sourceLabel(active.sourceRef, active.sourceLabel)}
              </button>
            ) : active.sourceRef ? (
              <p className="studio-muted">Evidence: {sourceLabel(active.sourceRef, active.sourceLabel)} (from this lesson's canvas scene graph).</p>
            ) : <p className="studio-muted">No direct citation — this is a structural concept.</p>}
          </>
        )}
      </aside>
    </div>
  );
}
