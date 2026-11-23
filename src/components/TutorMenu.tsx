import { useEffect, useState } from "react";
import { Copy, MessageSquarePlus, PanelRightClose } from "lucide-react";
import type { CopilotChatConfigurationValue } from "@copilotkit/react-core/v2";

type Props = {
  config: CopilotChatConfigurationValue | null;
  onToggleContext: () => void;
  onClose: () => void;
};

export default function TutorMenu({ config, onToggleContext, onClose }: Props) {
  const [status, setStatus] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyLastAnswer() {
    const messages = document.querySelectorAll('.copilot-slot [data-testid="copilot-assistant-message"]');
    const last = messages[messages.length - 1];
    if (!last) { setStatus("No answer to copy yet"); window.setTimeout(() => setStatus(""), 2000); return; }
    if (!navigator.clipboard) { setStatus("Copy failed"); window.setTimeout(() => setStatus(""), 2000); return; }
    try {
      await navigator.clipboard.writeText((last as HTMLElement).innerText);
      setStatus("Copied");
    } catch { setStatus("Copy failed"); }
    window.setTimeout(() => setStatus(""), 2000);
  }

  return (
    <div className="tutor-menu-wrap" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="tutor-menu" role="menu" aria-label="Tutor options" onMouseDown={(event) => event.stopPropagation()}>
        <button role="menuitem" disabled={!config?.startNewThread} title={config?.startNewThread ? undefined : "Tutor chat is not configured."} onClick={() => { config?.startNewThread(); onClose(); }}>
          <MessageSquarePlus size={14} /> New conversation
        </button>
        <button role="menuitem" onClick={() => { onToggleContext(); onClose(); }}>
          <PanelRightClose size={14} /> Toggle lesson context
        </button>
        <button role="menuitem" onClick={() => { void copyLastAnswer(); }}>
          <Copy size={14} /> Copy last answer
        </button>
        {status && <p className="tutor-menu-status" role="status">{status}</p>}
      </div>
      <style>{`
        .tutor-menu-wrap{position:fixed;inset:0;z-index:200}
        .tutor-menu{position:absolute;top:48px;right:18px;width:216px;padding:5px;border:1px solid #ded7c9;border-radius:10px;background:#fffdf8;box-shadow:0 14px 40px rgba(50,36,20,.18)}
        .tutor-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:9px 10px;border:0;border-radius:7px;background:transparent;color:#4a453e;text-align:left;font-size:11px;cursor:pointer}
        .tutor-menu button:hover:not(:disabled){background:#f4ece3;color:#9a623f}
        .tutor-menu button:disabled{opacity:.45;cursor:default}
        .tutor-menu-status{margin:4px 10px 7px;color:#5d8f68;font-size:10px}
      `}</style>
    </div>
  );
}
