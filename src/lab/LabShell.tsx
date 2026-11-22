import { useEffect, useState, type ReactElement } from "react";
import App from "../App";
import ImmersiveCanvas from "./ImmersiveCanvas";
import StudioCommand from "./StudioCommand";
import StudyFolio from "./StudyFolio";
import MissionControl from "./MissionControl";
import ConversationFirst from "./ConversationFirst";

export const LABS = [
  { id: "immersive", label: "Immersive Canvas", note: "CHOSEN · primary workspace", group: "Chosen" },
  { id: "conversation", label: "Conversation First", note: "CHOSEN · quizzes & flashcards", group: "Chosen" },
  { id: "studio", label: "Studio Command", note: "Slim rail, docked panels, command-first", group: "Explored" },
  { id: "folio", label: "Study Folio", note: "One scrolling document, tutor in the margin", group: "Explored" },
  { id: "mission", label: "Mission Control", note: "Dashboard first, canvas opens in focus", group: "Explored" },
] as const;

type LabId = (typeof LABS)[number]["id"] | "original";
type Mode = "session" | "quiz" | "flashcards";

function fromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("lab");
  const lab: LabId = value === "original" ? "original" : LABS.some((item) => item.id === value) ? (value as LabId) : "immersive";
  const rawMode = params.get("mode");
  const mode: Mode = rawMode === "quiz" || rawMode === "flashcards" ? rawMode : "session";
  return { lab, mode };
}

export default function LabShell() {
  const [{ lab, mode }, setState] = useState(fromUrl);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const onPop = () => setState(fromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(next: { lab?: LabId; mode?: Mode }) {
    const url = new URL(window.location.href);
    const target = next.lab ?? lab;
    if (target === "original") {
      url.searchParams.set("lab", "original");
      url.searchParams.delete("mode");
    } else {
      url.searchParams.set("lab", target);
      if (next.mode ?? mode) url.searchParams.set("mode", next.mode ?? mode);
    }
    window.history.pushState({}, "", url);
    setState(fromUrl());
  }

  function backToCanvas() {
    navigate({ lab: "immersive", mode: "session" });
  }

  let Active: ReactElement;
  if (lab === "original") Active = <App />;
  else if (lab === "conversation") Active = <ConversationFirst mode={mode} onBack={backToCanvas} />;
  else if (lab === "immersive") Active = <ImmersiveCanvas onOpenStudy={(next) => navigate({ lab: "conversation", mode: next })} />;
  else Active = (() => {
    const Component = components[lab];
    return <Component />;
  })();

  const chosen = LABS.filter((item) => item.group === "Chosen");
  const explored = LABS.filter((item) => item.group === "Explored");

  return (
    <>
      {Active}

      <aside className={`lab-switcher ${open ? "open" : "closed"}`} aria-label="Design lab switcher">
        <button className="lab-switcher-toggle" onClick={() => setOpen(!open)} title="Toggle design lab switcher">
          {open ? "✕" : "◆"}
        </button>
        {open && (
          <>
            <div className="lab-switcher-head"><strong>DESIGN LAB</strong><span>Immersive main · Conversation for study</span></div>
            <div className="lab-group-label">CHOSEN</div>
            <nav>
              {chosen.map((item) => (
                <button key={item.id} className={lab === item.id ? "active" : ""} onClick={() => navigate({ lab: item.id, mode: item.id === "conversation" ? mode : "session" })}>
                  <span>{item.label}</span><small>{item.note}</small>
                </button>
              ))}
            </nav>
            {lab === "conversation" && (
              <div className="lab-modes">
                <button className={mode === "session" ? "on" : ""} onClick={() => navigate({ lab: "conversation", mode: "session" })}>Session</button>
                <button className={mode === "quiz" ? "on" : ""} onClick={() => navigate({ lab: "conversation", mode: "quiz" })}>Quiz</button>
                <button className={mode === "flashcards" ? "on" : ""} onClick={() => navigate({ lab: "conversation", mode: "flashcards" })}>Cards</button>
              </div>
            )}
            <div className="lab-group-label">EXPLORED ALTERNATIVES</div>
            <nav className="quiet">
              {explored.map((item) => (
                <button key={item.id} className={lab === item.id ? "active" : ""} onClick={() => navigate({ lab: item.id, mode: "session" })}>
                  <span>{item.label}</span><small>{item.note}</small>
                </button>
              ))}
            </nav>
            <button className="lab-original" onClick={() => navigate({ lab: "original" })}>Original app</button>
          </>
        )}
      </aside>

      <style>{`
        .lab-switcher{position:fixed;z-index:9999;left:16px;bottom:16px;width:288px;border-radius:14px;background:#1d1b18;color:#f5efe6;box-shadow:0 18px 50px rgba(0,0,0,.35);font-family:system-ui,sans-serif;overflow:hidden}
        .lab-switcher.closed{width:46px;height:46px}
        .lab-switcher-toggle{position:absolute;right:8px;top:8px;width:28px;height:28px;border:0;border-radius:7px;background:#3a3630;color:#f5efe6;cursor:pointer;font-size:12px}
        .lab-switcher-head{padding:16px 16px 10px}
        .lab-switcher-head strong{display:block;font-size:11px;letter-spacing:.16em}
        .lab-switcher-head span{display:block;margin-top:3px;font-size:10px;color:#b7ac9e}
        .lab-group-label{padding:10px 16px 4px;color:#7f776c;font-size:8px;font-weight:700;letter-spacing:.15em}
        .lab-switcher nav{display:grid;gap:2px;padding:2px 8px 6px}
        .lab-switcher nav button{display:grid;gap:2px;text-align:left;padding:9px 10px;border:0;border-radius:8px;background:transparent;color:#e9e1d6;cursor:pointer}
        .lab-switcher nav button:hover{background:#302b25}
        .lab-switcher nav button.active{background:#b3643a;color:#fff}
        .lab-switcher nav button span{font-size:12px;font-weight:600}
        .lab-switcher nav button small{font-size:10px;color:#a99e90}
        .lab-switcher nav button.active small{color:#f3d9c9}
        .lab-switcher nav.quiet button{opacity:.62;padding:7px 10px}
        .lab-switcher nav.quiet button span{font-size:11px;font-weight:500}
        .lab-modes{display:flex;gap:4px;margin:0 12px 8px;padding:3px;border-radius:8px;background:#302b25}
        .lab-modes button{flex:1;padding:6px;border:0;border-radius:6px;background:transparent;color:#b7ac9e;font-size:10px;cursor:pointer}
        .lab-modes button.on{background:#f5efe6;color:#1d1b18;font-weight:700}
        .lab-original{display:block;width:calc(100% - 20px);margin:2px 10px 10px;padding:8px;border:0;border-top:1px solid #3a3630;background:transparent;color:#9c9386;font-size:10px;cursor:pointer}
      `}</style>
    </>
  );
}

const components: Record<string, () => ReactElement> = {
  studio: StudioCommand,
  folio: StudyFolio,
  mission: MissionControl,
};
