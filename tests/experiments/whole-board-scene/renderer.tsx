import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Quickdraw, type Camera, type Editor, type Snapshot } from "@quickdrawjs/react";
import { ScientificLayer } from "../../../src/canvas/ScientificLayer.js";
import { captureQuickdrawOCRRegions } from "../../../src/canvas/ocr-capture.js";
import type { ScientificObject } from "../../../src/canvas/model.js";
import "../../../src/styles.css";
import "../../../src/overrides.css";

type SceneBootstrap = { snapshot: Snapshot; objects: ScientificObject[]; camera: Camera; width: number; height: number };
type SceneProbe = { width: number; height: number; camera: Camera; viewSize: { w: number; h: number }; shapeCount: number; scienceObjectCount: number; scientificLayerBounds: { x: number; y: number; width: number; height: number }; worldRoundTrips: Array<{ source: { x: number; y: number }; output: { x: number; y: number }; error: number }>; crops: Awaited<ReturnType<typeof captureQuickdrawOCRRegions>> };

declare global {
  interface Window {
    __STUDYAI_SCENE__?: SceneBootstrap;
    __STUDYAI_SCENE_PROBE__?: () => Promise<SceneProbe>;
  }
}

function Renderer() {
  const scene = window.__STUDYAI_SCENE__;
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    if (!scene || !editor) return;
    const layer = document.querySelector<SVGSVGElement>(".scientific-layer");
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const camera = editor.camera;
    const points = [
      { x: -camera.x, y: -camera.y },
      { x: scene.width / camera.z - camera.x, y: scene.height / camera.z - camera.y },
      { x: 0, y: 0 },
    ];
    window.__STUDYAI_SCENE_PROBE__ = async () => {
      const crops = await captureQuickdrawOCRRegions(editor, [], scene.objects);
      const worldRoundTrips = points.map((source) => {
        const screen = editor.pageToScreen(source.x, source.y);
        const output = editor.screenToPage(screen.x, screen.y);
        return { source, output, error: Math.hypot(source.x - output.x, source.y - output.y) * camera.z };
      });
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        camera,
        viewSize: editor.viewSize(),
        shapeCount: editor.store.shapes().length,
        scienceObjectCount: scene.objects.length,
        scientificLayerBounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        worldRoundTrips,
        crops,
      };
    };
    document.getElementById("scene")?.setAttribute("data-ready", "true");
  }, [editor, scene]);

  if (!scene) return <div>Scene data was not provided.</div>;
  return <div id="scene" style={{ width: scene.width, height: scene.height, position: "relative", overflow: "hidden", background: "#fff" }}>
    <Quickdraw className="quickdraw-native" theme="light" grid="none" readonly hideUi themeToggle={false} gridControl={false} watermark={false} autoFit={false} camera={scene.camera} snapshot={scene.snapshot} onMount={(instance) => setEditor(instance)} style={{ position: "absolute", inset: 0 }} />
    {editor && <ScientificLayer objects={scene.objects} editor={editor} mode={null} selectedId={undefined} interactive={false} onSelect={() => undefined} onEdit={() => undefined} onCommit={() => undefined} onFinish={() => undefined} onActivateMolecule={() => undefined} onOpenNote={() => undefined} onOpenDocument={() => undefined} />}
  </div>;
}

createRoot(document.getElementById("root")!).render(<Renderer />);
