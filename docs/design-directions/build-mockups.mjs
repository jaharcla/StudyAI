// Generates three self-contained static HTML mockups for the owner's visual-direction choice.
// Output is plain HTML/CSS. No runtime JS, no external services, no product source edits.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = dirname(fileURLToPath(import.meta.url));

const ICONS = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-grid" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H19"/></symbol>
<symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
<symbol id="i-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
<symbol id="i-right" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></symbol>
<symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></symbol>
<symbol id="i-pen" viewBox="0 0 24 24"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14.5 7.5 3 3"/></symbol>
<symbol id="i-line" viewBox="0 0 24 24"><path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 19 19 5m0 0h-6m6 0v6"/></symbol>
<symbol id="i-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/></symbol>
<symbol id="i-erase" viewBox="0 0 24 24"><path d="m4 15 7-8 8 7-5 6H8z"/><path d="M8 20h12"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></symbol>
<symbol id="i-file" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></symbol>
<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
<symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5 10.2 12.6 4.5 10.8 10.2 9z"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
</svg>`;

const ic = (n, size = 16) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${n}"/></svg>`;

const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#e8eaed;color:var(--ink);font-family:var(--ui);-webkit-font-smoothing:antialiased}
button,input{font:inherit;color:inherit}
.doc{max-width:1512px;margin:0 auto;padding:30px 36px 70px}
.doc-head{max-width:1000px;margin:0 auto 34px}
.doc-head .kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--accent);margin:0 0 10px}
.doc-head h1{font:600 30px/1.18 var(--display);letter-spacing:-.025em;margin:0 0 10px;color:var(--ink)}
.doc-head p{margin:0;max-width:80ch;font-size:13px;line-height:1.65;color:var(--body)}
.rationale{max-width:1000px;margin:0 auto 44px;padding:22px 26px;border:1px solid var(--rule);border-radius:12px;background:var(--surface);box-shadow:var(--shadow)}
.rationale h2{margin:0 0 16px;font:600 13px/1.3 var(--display);letter-spacing:0;color:var(--ink)}
.rationale-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px 30px;margin:0}
.rationale-grid div{margin:0}
.rationale-grid dt{margin:0 0 5px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.rationale-grid dd{margin:0;font-size:12px;line-height:1.65;color:var(--body)}
.surface{width:1440px;margin:0 auto 46px}
.surface-cap{height:36px;display:flex;align-items:center;gap:12px;padding:0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:var(--body)}
.cap-n{display:grid;place-items:center;width:20px;height:20px;border-radius:5px;background:var(--accent);color:#fff;font-size:10px;letter-spacing:0}
.cap-world{margin-left:auto;color:var(--muted);font-weight:600;letter-spacing:.1em}
.frame{position:relative;width:1440px;height:864px;overflow:hidden;border:1px solid var(--rule);border-radius:12px;background:var(--ground);box-shadow:0 2px 6px rgba(24,32,44,.06),0 18px 42px rgba(24,32,44,.10)}
.app{display:flex;width:100%;height:100%}
.sidebar{position:relative;z-index:40;flex:0 0 248px;width:248px;height:100%;padding:20px 14px 16px;background:var(--sidebar-bg);border-right:1px solid var(--rule);display:flex;flex-direction:column;overflow:hidden}
.brand{display:flex;align-items:center;gap:10px;padding:2px 6px 26px;font:600 20px/1.1 var(--display);letter-spacing:-.02em;color:var(--ink)}
.brand-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--ink);color:var(--surface)}
.brand-mark svg{width:18px;height:18px}
.brand-ai{color:var(--accent);font-weight:500}
.search{display:flex;align-items:center;gap:9px;width:100%;height:36px;margin-bottom:24px;padding:0 11px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);color:var(--muted);font-size:12px;text-align:left}
.kbd{margin-left:auto;padding:2px 5px;border:1px solid var(--rule);border-radius:4px;font-size:10px;color:var(--muted)}
.nav-label{display:flex;align-items:center;justify-content:space-between;margin:0 8px 9px;font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
.nav-label button{display:grid;place-items:center;width:20px;height:20px;border:0;background:transparent;color:var(--muted);cursor:pointer}
.nav{display:grid;gap:2px}
.nav-item{display:flex;align-items:center;gap:11px;width:100%;height:38px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--body);font-size:13px;text-align:left}
.nav-item.active{background:var(--accent-tint);color:var(--accent);font-weight:700}
.course-list{display:grid;gap:2px}
.course{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:transparent;text-align:left}
.course.active{background:var(--accent-tint)}
.course-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none}
.course:not(.active) .course-dot{background:var(--rule-strong)}
.course b{display:block;font-size:12px;font-weight:600;color:var(--ink)}
.course small{display:block;margin-top:2px;font-size:10px;color:var(--muted)}
.tree{margin-top:18px;padding-top:14px;border-top:1px solid var(--rule)}
.tree-item{display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;border:0;border-radius:7px;background:transparent;color:var(--muted);font-size:11px;text-align:left}
.tree-item.current{background:var(--accent-tint);color:var(--accent);font-weight:700}
.tree-item .tick{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.6;flex:none}
.side-foot{margin-top:auto;padding:14px 8px 2px;border-top:1px solid var(--rule);display:flex;align-items:center;gap:8px;font-size:10px;color:var(--muted)}
.status-dot{width:7px;height:7px;border-radius:50%;background:var(--ok);flex:none}
.main{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;height:100%}
.topbar{display:flex;align-items:center;gap:14px;flex:0 0 54px;height:54px;padding:0 26px;border-bottom:1px solid var(--rule);background:var(--surface)}
.crumbs{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.crumbs b{color:var(--ink);font-weight:600}
.top-actions{display:flex;align-items:center;gap:6px;margin-left:auto}
.ibtn{display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);color:var(--body)}
.saved{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted)}
.stage{flex:1;min-height:0;display:grid;place-items:center;padding:40px;background:var(--ground)}
.stage-quiet{text-align:center;max-width:420px}
.stage-quiet .q-mark{display:grid;place-items:center;width:44px;height:44px;margin:0 auto 16px;border-radius:11px;background:var(--accent-tint);color:var(--accent)}
.stage-quiet h3{margin:0 0 8px;font:600 21px/1.3 var(--display);color:var(--ink)}
.stage-quiet p{margin:0;font-size:13px;line-height:1.6;color:var(--body)}
.lesson{flex:1;min-height:0;overflow:hidden;background:var(--ground)}
.lesson-head{padding:28px 32px 24px;border-bottom:1px solid var(--rule);background:var(--surface)}
.lesson-head h1{margin:0 0 9px;font:600 30px/1.18 var(--display);letter-spacing:-.025em;color:var(--ink)}
.lesson-sub{margin:0 0 20px;font-size:13px;line-height:1.6;color:var(--body)}
.lesson-actions{display:flex;align-items:center;gap:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 15px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease,color 140ms ease}
.btn-primary{border:1px solid var(--accent);background:var(--accent);color:#fff}
.btn-soft{border:1px solid var(--rule);background:var(--surface);color:var(--body)}
.lesson-body{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(250px,1fr);gap:26px;padding:26px 32px}
.reading{padding:24px 26px;border:1px solid var(--rule);border-radius:10px;background:var(--surface);box-shadow:var(--shadow)}
.reading h2{margin:0 0 14px;font:600 17px/1.3 var(--display);color:var(--ink)}
.reading p{margin:0 0 14px;font-size:13px;line-height:1.75;color:var(--body)}
.ref{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.equation{margin:18px 0;padding:16px 18px;border:1px solid var(--rule);border-radius:8px;background:var(--tint-2);font:500 17px/1.5 var(--mono);letter-spacing:-.01em;color:var(--ink)}
.side-stack{display:grid;gap:16px;align-content:start}
.mini{padding:18px 20px;border:1px solid var(--rule);border-radius:10px;background:var(--surface)}
.mini h3{margin:0 0 12px;font:600 12px/1.3 var(--display);color:var(--ink)}
.mini ul{margin:0;padding:0;list-style:none;display:grid;gap:10px}
.mini li{display:flex;gap:9px;font-size:12px;line-height:1.5;color:var(--body)}
.mini li .n{display:grid;place-items:center;flex:none;width:19px;height:19px;border-radius:5px;background:var(--accent-tint);color:var(--accent);font-size:10px;font-weight:700}
.workspace{display:flex;flex:1;min-height:0;flex-direction:column}
.toolbar{display:flex;align-items:center;gap:10px;flex:0 0 48px;height:48px;padding:0 20px;border-bottom:1px solid var(--rule);background:var(--surface)}
.view-switch{display:flex;gap:2px;padding:3px;border:1px solid var(--rule);border-radius:8px;background:var(--tint-2)}
.view-switch button{padding:6px 11px;border:0;border-radius:5px;background:transparent;color:var(--muted);font-size:11px;font-weight:600;cursor:pointer}
.view-switch button.current{background:var(--accent);color:#fff}
.chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:1px solid var(--rule);border-radius:7px;background:var(--surface);color:var(--body);font-size:11px;font-weight:600;cursor:pointer}
.chip.active{background:var(--accent-tint);border-color:var(--accent-tint);color:var(--accent)}
.toolbar-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.workarea{display:flex;flex:1;min-height:0}
.board-area{position:relative;flex:1;min-width:0;padding:16px;background:var(--ground)}
.board{position:relative;width:100%;height:100%;overflow:hidden;border:1px solid var(--rule);border-radius:10px;background-color:var(--board-bg);background-image:radial-gradient(var(--board-dot) 1px,transparent 1px);background-size:22px 22px}
.board-tag{position:absolute;top:14px;left:16px;padding:5px 9px;border:1px solid var(--rule);border-radius:6px;background:var(--surface);color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.board svg.diagram{position:absolute;inset:0;width:100%;height:100%}
.quickdock{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:3px;padding:6px;border:1px solid var(--rule);border-radius:11px;background:var(--surface);box-shadow:var(--shadow)}
.qd-btn{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:7px;background:transparent;color:var(--body);cursor:pointer}
.qd-btn.active{background:var(--accent);color:#fff}
.qd-div{width:1px;height:20px;margin:0 4px;background:var(--rule)}
.tutor{flex:0 0 340px;width:340px;display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--rule);background:var(--surface)}
.tutor-head{display:flex;align-items:center;gap:10px;flex:0 0 58px;height:58px;padding:0 17px;border-bottom:1px solid var(--rule)}
.tutor-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--accent-tint);color:var(--accent)}
.tutor-name b{display:block;font:600 13px/1.2 var(--display);color:var(--ink)}
.tutor-name small{display:block;margin-top:3px;font-size:10px;color:var(--muted)}
.tutor-head .ibtn{margin-left:auto}
.tutor-context{padding:14px 17px;border-bottom:1px solid var(--rule)}
.ctx-label{margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.ctx-card{display:flex;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--rule);border-radius:8px;background:var(--tint-2)}
.ctx-card .ic{color:var(--accent);flex:none}
.ctx-card b{display:block;font-size:12px;color:var(--ink)}
.ctx-card small{display:block;margin-top:2px;font-size:10px;color:var(--muted)}
.tutor-thread{flex:1;min-height:0;overflow:hidden;padding:18px 17px}
.msg{margin:0 0 14px}
.msg .who{margin:0 0 7px;font-size:10px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--accent)}
.msg p{margin:0 0 8px;font-size:12px;line-height:1.7;color:var(--body)}
.tag{display:inline-block;margin-right:6px;padding:3px 7px;border-radius:5px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.tag-obs{background:var(--accent-tint);color:var(--accent)}
.tag-interp{background:var(--tint-2);color:var(--muted)}
.suggestions{display:grid;gap:6px}
.suggestions button{padding:8px 10px;border:1px solid var(--rule);border-radius:7px;background:var(--tint-2);color:var(--body);font-size:11px;text-align:left;cursor:pointer}
.composer{display:flex;align-items:center;gap:8px;flex:0 0 62px;height:62px;padding:0 14px;border-top:1px solid var(--rule)}
.composer .field{flex:1;height:36px;display:flex;align-items:center;padding:0 11px;border:1px solid var(--rule);border-radius:8px;color:var(--muted);font-size:11px}
.disclaimer{flex:0 0 28px;display:flex;align-items:center;padding:0 17px;border-top:1px solid var(--rule);font-size:9px;color:var(--muted)}
.coach-layer{position:absolute;inset:0;z-index:60;display:grid;place-items:end center;padding-bottom:44px;background:var(--veil)}
.coach{width:min(720px,calc(100% - 80px));display:flex;align-items:center;gap:14px;padding:13px 14px;border:1px solid var(--rule);border-radius:11px;background:var(--surface);box-shadow:var(--shadow-lift)}
.coach-mark{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:9px;background:var(--accent);color:#fff}
.coach-body{flex:1;min-width:0}
.coach-reason{margin:0 0 4px;font-size:13px;font-weight:700;color:var(--ink)}
.coach-preview{margin:0;font-size:11px;color:var(--body)}
.coach-source{margin-top:6px;display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;color:var(--muted)}
.coach-actions{display:flex;align-items:center;gap:8px;flex:none}
.coach .btn-primary{min-height:42px;padding:0 17px}
.coach-more{display:grid;place-items:center;width:42px;height:42px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);color:var(--body)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const WORLDS = [
  {
    n: 1,
    slug: "quiet-scholarly",
    name: "Quiet scholarly",
    tagline: "Paper, ink, and one warm accent",
    theme: `
:root{
  --ui:"DM Sans",system-ui,-apple-system,Segoe UI,sans-serif;
  --display:Literata,Georgia,"Times New Roman",serif;
  --mono:"Cascadia Mono",Consolas,monospace;
  --ground:#f5f2ea; --sidebar-bg:#efebe1; --surface:#fffdf8;
  --ink:#28241e; --body:#544c41; --muted:#6f6658;
  --rule:#ded7c9; --rule-strong:#c7bdae; --rule-soft:#ebe5da;
  --accent:#7a452e; --accent-tint:#f4ebe3; --tint-2:#f7f4ed;
  --ok:#4f7358; --board-bg:#fdfbf6; --board-dot:#dcd3c4;
  --veil:rgba(40,36,30,.34);
  --shadow:0 1px 2px rgba(51,42,30,.07),0 10px 30px rgba(51,42,30,.08);
  --shadow-lift:0 2px 6px rgba(51,42,30,.10),0 20px 54px rgba(51,42,30,.18);
}
@font-face{font-family:"Literata";font-style:normal;font-weight:400 700;font-display:swap;src:url("../../assets/fonts/literata-latin.woff2") format("woff2")}
@font-face{font-family:"DM Sans";font-style:normal;font-weight:400 700;font-display:swap;src:url("../../assets/fonts/dm-sans-latin.woff2") format("woff2")}
::selection{background:#e3d2c1;color:var(--ink)}
*{scrollbar-width:thin;scrollbar-color:#cbc2b3 transparent}
`,
    overrides: ``,
    rationale: [
      ["Says", "Studying is reading and annotation. A bookish desk with one terracotta accent; the serif carries warmth, the rules carry order. Nothing performs youthfulness."],
      ["Suits", "Long reading sessions, written work and review. Best when the student wants a quiet desk and the lesson is text-heavy."],
      ["Cost", "Serif display can read conservative. Warm paper makes contrast and dark mode real work — the incumbent ink-3 is too light here and was darkened. Low chroma can feel textbook rather than tool."],
      ["Reuse", "The whole token set in `src/schemes/quiet-scholarly.css`, both bundled fonts in `assets/fonts/`, `.canvas-board` dot grid, `.qd-dock` paper dock, `.context-card`, `.button-primary`."],
      ["Motion", "One authored moment: the Coach dock lifts 8px on arrival (240ms, ease-out); exit is faster. Navigation stays instant."],
      ["Honest risk", "If the owner wants the product to feel like a modern instrument rather than a good notebook, this direction fights that goal."],
    ],
  },
  {
    n: 2,
    slug: "immersive-studio",
    name: "Immersive studio",
    tagline: "The board owns the screen; chrome floats",
    theme: `
:root{
  --ui:"DM Sans",system-ui,-apple-system,Segoe UI,sans-serif;
  --display:"DM Sans",system-ui,-apple-system,Segoe UI,sans-serif;
  --mono:"Cascadia Mono",Consolas,monospace;
  --ground:#f4f2ec; --sidebar-bg:#fffdf8; --surface:#fffdf8;
  --ink:#2a2621; --body:#574e43; --muted:#6f665a;
  --rule:#ded7c9; --rule-strong:#c6bdae; --rule-soft:#e9e4db;
  --accent:#a66843; --accent-tint:#f5ece5; --tint-2:#f7f4ee;
  --ok:#4f7358; --board-bg:#faf7f0; --board-dot:#ddd4c6;
  --veil:rgba(42,38,33,.22);
  --shadow:0 2px 6px rgba(50,36,20,.08),0 14px 38px rgba(50,36,20,.12);
  --shadow-lift:0 4px 10px rgba(50,36,20,.10),0 24px 60px rgba(50,36,20,.20);
}
@font-face{font-family:"DM Sans";font-style:normal;font-weight:400 700;font-display:swap;src:url("../../assets/fonts/dm-sans-latin.woff2") format("woff2")}
::selection{background:#e5d7c8;color:var(--ink)}
*{scrollbar-width:thin;scrollbar-color:#c8beb0 transparent}
`,
    overrides: `
/* Slide-over navigation; shown only in surface 1 so the dock can be judged open and closed. */
.world-2 .sidebar{position:absolute;top:0;bottom:0;left:0;z-index:80;width:276px;flex-basis:276px;transform:translateX(-101%);transition:transform 220ms cubic-bezier(.2,.8,.2,1);box-shadow:14px 0 50px rgba(40,30,20,.18)}
.world-2.sidebar-open .sidebar{transform:translateX(0)}
.world-2 .main{position:relative;width:100%}
.world-2.sidebar-open .main:before{content:"";position:absolute;z-index:65;inset:0;background:rgba(42,38,33,.16)}
.world-2 .workspace{padding-top:58px}
.world-2 .lesson-actions-float{display:flex;margin:20px 34px 0}
.world-2 .topbar{position:absolute;z-index:30;top:0;left:0;right:0;height:58px;padding:0 18px;border-bottom:0;background:transparent}
.world-2 .crumbs{font-size:12px;color:var(--muted)}
.world-2 .saved{display:none}
.world-2 .lesson-head{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.world-2 .lesson-body{padding:76px 34px 24px;grid-template-columns:minmax(0,1.4fr) minmax(250px,1fr)}
.world-2 .lesson-head{clip:rect(0 0 0 0)}
.world-2 .lesson-title-float{display:block}
.world-2 .toolbar{position:absolute;z-index:20;top:64px;left:50%;transform:translateX(-50%);width:auto;height:auto;padding:5px;border:1px solid var(--rule);border-radius:10px;background:rgba(255,253,248,.96);box-shadow:var(--shadow)}
.world-2 .view-switch{border:0;background:transparent;padding:0}
.world-2 .view-switch button.current{background:var(--ink);color:#fffdf8}
.world-2 .chip{height:28px}
.world-2.tutor-open .workarea{padding-right:356px}
.world-2 .board-area{padding:0}
.world-2 .board{border:0;border-radius:0;background-color:var(--board-bg);background-image:radial-gradient(var(--board-dot) 1px,transparent 1px)}
.world-2 .tutor{position:absolute;z-index:50;top:116px;right:16px;bottom:16px;width:340px;border:1px solid var(--rule);border-radius:14px;box-shadow:var(--shadow-lift)}
.world-2 .tutor-head{flex-basis:50px;height:50px}
.world-2 .world-menu{display:grid}
.world-2 .coach{width:min(680px,calc(100% - 80px))}
`,
    commonAdd: `
.world-menu{display:none;place-items:center;width:32px;height:32px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);color:var(--body)}
.lesson-title-float{display:none;margin:74px 34px 0;font:600 28px/1.2 var(--display);letter-spacing:-.025em;color:var(--ink)}
.world-2 .lesson-title-float + .lesson-sub-float{margin:8px 34px 0;font-size:13px;color:var(--body)}
.lesson-sub-float{display:none}
.world-2 .lesson-sub-float{display:block}
.lesson-actions-float{display:none}
`,
    rationale: [
      ["Says", "The canvas is the thinking surface. Navigation, view controls and the Tutor are things you summon and set aside, not permanent furniture."],
      ["Suits", "Sketch-heavy work and split view. Strongest when the student draws more than they read and wants the board uninterrupted."],
      ["Cost", "Floating panels demand strict z-index and reserved-column rules — the incumbent already had a Tutor panel covering board objects. Slide-over navigation is less scannable and discovery costs attention."],
      ["Reuse", "`src/schemes/immersive-real.css` already defines this grammar: `--tutor-width` reserve, floating `.view-switch`, `.tool-chip`, `.qd-dock`, `.reopen-tutor`, and the lucide icon set."],
      ["Motion", "One authored moment: the sidebar slides in 220ms and board controls reflow once; the Tutor card cross-fades only when summoned."],
      ["Honest risk", "The floating Tutor is the highest-maintenance of the three surfaces; every new inspector or tool has to negotiate the same space."],
    ],
  },
  {
    n: 3,
    slug: "cool-ledger",
    name: "Cool ledger",
    tagline: "Evidence first: cool, exact, traceable",
    theme: `
:root{
  --ui:"DM Sans",system-ui,-apple-system,Segoe UI,sans-serif;
  --display:"DM Sans",system-ui,-apple-system,Segoe UI,sans-serif;
  --mono:"Cascadia Mono",Consolas,monospace;
  --ground:#f6f8fa; --sidebar-bg:#f1f5f8; --surface:#ffffff;
  --ink:#16222e; --body:#3c4a59; --muted:#5d6b7a;
  --rule:#dbe3ea; --rule-strong:#b9c6d2; --rule-soft:#e8edf2;
  --accent:#1e5c72; --accent-tint:#e8f2f5; --tint-2:#f2f6f9;
  --ok:#2f6b4f; --board-bg:#fbfdfe; --board-dot:#d3dfe8;
  --veil:rgba(22,34,46,.30);
  --shadow:0 1px 2px rgba(22,34,46,.07),0 10px 26px rgba(22,34,46,.09);
  --shadow-lift:0 2px 6px rgba(22,34,46,.10),0 20px 50px rgba(22,34,46,.20);
}
@font-face{font-family:"DM Sans";font-style:normal;font-weight:400 700;font-display:swap;src:url("../../assets/fonts/dm-sans-latin.woff2") format("woff2")}
::selection{background:#cfe3ea;color:var(--ink)}
*{scrollbar-width:thin;scrollbar-color:#bdcbd6 transparent}
`,
    overrides: `
.world-3 .sidebar{border-right:1px solid var(--rule-strong)}
.world-3 .brand{font-size:19px;font-weight:700;letter-spacing:-.035em}
.world-3 .brand-mark{border-radius:6px}
.world-3 .nav-item.active{border-radius:6px}
.world-3 .lesson-head h1,.world-3 .lesson-title-float{font-weight:700;letter-spacing:-.035em}
.world-3 .reading,.world-3 .mini,.world-3 .ctx-card,.world-3 .board{border-radius:8px}
.world-3 .equation{background:var(--tint-2);border-radius:6px}
.world-3 .tutor{border-left:1px solid var(--rule-strong)}
.world-3 .tutor-head{background:var(--tint-2)}
.world-3 .tag-obs{background:var(--accent-tint);color:var(--accent)}
.world-3 .tag-interp{background:#eef1f4;color:var(--body)}
.world-3 .coach{border-radius:9px}
.world-3 .coach-mark{border-radius:7px}
.world-3 .mini li .n{font-family:var(--mono);border-radius:4px}
`,
    commonAdd: ``,
    rationale: [
      ["Says", "The workspace is an evidence ledger. Every answer is tagged observation or interpretation and tied back to a page, so trust is visible rather than promised."],
      ["Suits", "Science courses where grounding, checks and confidence matter — physics, chemistry, maths — and students who audit what the tutor says."],
      ["Cost", "Cool neutrals can read clinical or enterprise. It needs deliberate weight steps and the teal reserved strictly for state, or the hierarchy flattens into generic SaaS."],
      ["Reuse", "The neutral base in `src/styles.css`, `.science-result`, `Citation.tsx`, `.context-card`, `.canvas-object`, the `coach.css` dock and its focus ring, and tabular numerals for measurements."],
      ["Motion", "One authored moment: the evidence tag on a new tutor line fades in 160ms; nothing else moves."],
      ["Honest risk", "Least expressive of the three. Warmth has to come from craft, not colour."],
    ],
  },
];

function iconSprite() { return ICONS; }

function sidebarHtml(w, surface) {
  const open = w.n === 2 && surface === 1;
  return `<aside class="sidebar" aria-label="Course navigation">
    <div class="brand"><span class="brand-mark">${ic("grid", 18)}</span><span>study<span class="brand-ai">ai</span></span></div>
    <button class="search">${ic("search", 15)}<span>Search</span><span class="kbd">Ctrl K</span></button>
    <div class="nav-label"><span>Navigate</span></div>
    <nav class="nav">
      <button class="nav-item ${surface <= 2 ? "active" : ""}">${ic("grid", 16)} Lesson home</button>
      <button class="nav-item ${surface === 3 ? "active" : ""}">${ic("pen", 16)} Canvas</button>
      <button class="nav-item">${ic("book", 16)} Study</button>
      <button class="nav-item">${ic("layers", 16)} Studio</button>
    </nav>
    <div class="nav-label" style="margin-top:26px"><span>Courses</span><button aria-label="Add course">${ic("plus", 14)}</button></div>
    <div class="course-list">
      <button class="course active"><span class="course-dot"></span><span><b>DEMO Motion</b><small>4 lessons · current</small></span></button>
      <button class="course"><span class="course-dot"></span><span><b>CHEM 120</b><small>Introductory chemistry</small></span></button>
      <button class="course"><span class="course-dot"></span><span><b>KIN 120</b><small>Upper extremity</small></span></button>
    </div>
    <div class="tree">
      <div class="nav-label" style="margin-bottom:6px"><span>DEMO Motion</span></div>
      <button class="tree-item current"><span class="tick"></span> Vectors in equilibrium</button>
      <button class="tree-item"><span class="tick"></span> Projectile motion</button>
      <button class="tree-item"><span class="tick"></span> Newton's second law</button>
    </div>
    <div class="side-foot"><span class="status-dot"></span> Saved locally · model ready</div>
  </aside>`;
}

function topbarHtml(w, surface) {
  const menu = w.n === 2 ? `<button class="world-menu ibtn" aria-label="Open navigation">${ic("menu", 16)}</button>` : "";
  return `<header class="topbar">${menu}
    <div class="crumbs">DEMO Motion ${ic("chev", 12)} <b>${surface >= 3 ? "Vectors in equilibrium" : "Lesson home"}</b></div>
    <div class="top-actions"><span class="saved"><span class="status-dot"></span> Saved</span><button class="ibtn" aria-label="More actions">${ic("more", 16)}</button></div>
  </header>`;
}

function surface1(w) {
  return `<div class="frame world-${w.n} ${w.n === 2 ? "sidebar-open" : ""}">
  <div class="app">${sidebarHtml(w, 1)}<main class="main">${topbarHtml(w, 1)}
    <div class="stage"><div class="stage-quiet"><span class="q-mark">${ic("book", 20)}</span><h3>Your course, held together</h3><p>Courses, lessons and the current board live in one place. The active lesson is marked in the tree; nothing shows a raw slug.</p></div></div>
  </main></div>
</div>`;
}

function surface2(w) {
  return `<div class="frame world-${w.n}">
  <div class="app">${sidebarHtml(w, 2)}<main class="main">${topbarHtml(w, 2)}
    ${w.n === 2 ? `<div class="lesson-title-float">Vectors in equilibrium</div><div class="lesson-sub-float">Resolve a force into components, then check the result on the board.</div><div class="lesson-actions-float"><button class="btn btn-primary">Open board ${ic("right", 14)}</button><button class="btn btn-soft">${ic("file", 14)} View sources</button></div>` : ""}
    <div class="lesson">
      ${w.n === 2 ? "" : `<div class="lesson-head"><h1>Vectors in equilibrium</h1><p class="lesson-sub">Resolve a force into components, then check the result on the board.</p><div class="lesson-actions"><button class="btn btn-primary">Open board ${ic("right", 14)}</button><button class="btn btn-soft">${ic("file", 14)} View sources</button></div></div>`}
      <div class="lesson-body">
        <article class="reading">
          <span class="ref">${ic("file", 13)} Lecture notes · page 4</span>
          <h2 style="margin-top:14px">Forces in balance</h2>
          <p>An object is in equilibrium when the vector sum of the forces on it is zero. Resolving each force into horizontal and vertical components turns one diagram into two independent checks.</p>
          <div class="equation">&Sigma;F<sub>x</sub> = 0 &nbsp;&nbsp; &Sigma;F<sub>y</sub> = 0</div>
          <p>Demo lesson content, illustrative. Every explanation in StudyAI links back to this page rather than standing on its own.</p>
        </article>
        <div class="side-stack">
          <div class="mini"><h3>In this lesson</h3><ul><li><span class="n">1</span> Read the worked example on page 4</li><li><span class="n">2</span> Sketch the force diagram on the board</li><li><span class="n">3</span> Ask the Tutor to check your components</li></ul></div>
          <div class="mini"><h3>Sources</h3><ul><li>${ic("file", 14)} Lecture notes · 12 pages</li><li>${ic("file", 14)} Demo board · saved</li></ul></div>
        </div>
      </div>
    </div>
  </main></div>
</div>`;
}

function diagram(w) {
  const axis = w.n === 3 ? "#b9c6d2" : "#cfc5b5";
  const f1 = w.n === 3 ? "#1e5c72" : "#7a452e";
  const f2 = w.n === 3 ? "#5d6b7a" : "#877e71";
  const res = w.n === 2 ? "#2a2621" : f1;
  const label = w.n === 3 ? "#16222e" : "#28241e";
  return `<svg class="diagram" viewBox="0 0 700 520" preserveAspectRatio="xMidYMid meet" aria-label="Force vector diagram">
    <defs><marker id="ah-${w.n}" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0 9 4.5 0 9z" fill="${f1}"/></marker><marker id="ar-${w.n}" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0 9 4.5 0 9z" fill="${f2}"/></marker><marker id="ag-${w.n}" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0 9 4.5 0 9z" fill="${res}"/></marker></defs>
    <path d="M60 430H640M150 470V60" stroke="${axis}" stroke-width="1.5" fill="none"/>
    <path d="M150 430 420 430M150 430 150 190" stroke="${axis}" stroke-width="1" stroke-dasharray="5 5" fill="none"/>
    <circle cx="150" cy="430" r="5" fill="${label}"/>
    <path d="M150 430 420 430" stroke="${f1}" stroke-width="2.5" marker-end="url(#ah-${w.n})" fill="none"/>
    <path d="M150 430 150 190" stroke="${f2}" stroke-width="2.5" marker-end="url(#ar-${w.n})" fill="none"/>
    <path d="M150 430 420 190" stroke="${res}" stroke-width="2.5" stroke-dasharray="8 6" marker-end="url(#ag-${w.n})" fill="none"/>
    <text x="292" y="420" fill="${f1}" font-family="DM Sans,sans-serif" font-size="15" font-weight="700">F₁ = 4.0 N</text>
    <text x="164" y="300" fill="${f2}" font-family="DM Sans,sans-serif" font-size="15" font-weight="700">F₂ = 3.0 N</text>
    <text x="300" y="286" fill="${res}" font-family="DM Sans,sans-serif" font-size="15" font-weight="700">R = 5.0 N</text>
    <text x="612" y="450" fill="${axis}" font-family="DM Sans,sans-serif" font-size="12">x</text>
    <text x="132" y="66" fill="${axis}" font-family="DM Sans,sans-serif" font-size="12">y</text>
  </svg>`;
}

function surface3(w) {
  return `<div class="frame world-${w.n} ${w.n === 2 ? "tutor-open" : ""}">
  <div class="app">${sidebarHtml(w, 3)}<main class="main">${topbarHtml(w, 3)}
    <div class="workspace">
      <div class="toolbar">
        <div class="view-switch"><button>Canvas</button><button>Lecture</button><button class="current">Split</button></div>
        <button class="chip">${ic("spark", 13)} Analyze</button><button class="chip">Labels</button><button class="chip active">Quickdraw</button>
        <div class="toolbar-right"><span class="saved"><span class="status-dot"></span> Demo board · rev 12</span><button class="ibtn">${ic("more", 16)}</button></div>
      </div>
      <div class="workarea">
        <div class="board-area">
          <div class="board"><span class="board-tag">Demo board</span>${diagram(w)}
            <div class="quickdock"><button class="qd-btn active">${ic("pen", 17)}</button><button class="qd-btn">${ic("line", 17)}</button><button class="qd-btn">${ic("arrow", 17)}</button><button class="qd-btn">${ic("circle", 17)}</button><span class="qd-div"></span><button class="qd-btn">${ic("erase", 17)}</button></div>
          </div>
        </div>
        <aside class="tutor">
          <div class="tutor-head"><span class="tutor-avatar">${ic("spark", 17)}</span><span class="tutor-name"><b>Tutor</b><small>Grounded in your sources</small></span><button class="ibtn">${ic("more", 16)}</button></div>
          <div class="tutor-context"><p class="ctx-label">In context</p><div class="ctx-card">${ic("file", 16)}<span><b>Vectors in equilibrium</b><small>DEMO Motion · page 4</small></span></div></div>
          <div class="tutor-thread">
            <div class="msg"><p class="who">You</p><p>Are my two components right?</p></div>
            <div class="msg"><p class="who">Tutor</p><p><span class="tag tag-obs">Observation</span> Your horizontal arrow is 4.0 N and your vertical arrow is 3.0 N, at right angles.</p><p><span class="tag tag-interp">Interpretation</span> That makes the resultant 5.0 N by Pythagoras — worth checking against the worked example on page 4.</p></div>
            <div class="suggestions"><button>Why does the resultant point here?</button><button>Check my components</button></div>
          </div>
          <div class="composer"><div class="field">Ask about this board…</div><button class="ibtn">${ic("right", 16)}</button></div>
          <div class="disclaimer">Answers use your course material. Check the cited page before relying on a result.</div>
        </aside>
      </div>
    </div>
  </main></div>
</div>`;
}

function surface4(w) {
  return `<div class="frame world-${w.n}">
  <div class="app">${sidebarHtml(w, 4)}<main class="main">${topbarHtml(w, 4)}
    <div class="workspace">
      <div class="toolbar"><div class="view-switch"><button>Canvas</button><button>Lecture</button><button class="current">Split</button></div><button class="chip">${ic("spark", 13)} Analyze</button><button class="chip">Labels</button><div class="toolbar-right"><span class="saved"><span class="status-dot"></span> Demo board · rev 12</span></div></div>
      <div class="workarea"><div class="board-area"><div class="board"><span class="board-tag">Demo board</span>${diagram(w)}</div></div></div>
    </div>
    <div class="coach-layer">
      <div class="coach">
        <span class="coach-mark">${ic("spark", 18)}</span>
        <div class="coach-body"><p class="coach-reason">You stopped before checking the vertical component.</p><p class="coach-preview">Open Demo board at the point you left off.</p><span class="coach-source">${ic("file", 12)} DEMO Motion · page 4</span></div>
        <div class="coach-actions"><button class="btn btn-primary">Continue ${ic("right", 14)}</button><button class="coach-more">${ic("more", 16)}</button></div>
      </div>
    </div>
  </main></div>
</div>`;
}

const SURFACE_NAMES = ["Sidebar", "Lesson home", "Canvas with Tutor dock", "Coach prompt"];
function wrap(w, index, html) {
  return `<section class="surface"><div class="surface-cap"><span class="cap-n">${index + 1}</span>${SURFACE_NAMES[index]}<span class="cap-world">Direction ${w.n} · ${w.name}</span></div>${html}</section>`;
}

function doc(w) {
  const rat = w.rationale.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1440">
<title>StudyAI — visual direction ${w.n}: ${w.name}</title>
<style>
${w.theme}
${BASE_CSS}
${w.commonAdd || ""}
${w.overrides}
</style>
</head>
<body>
${iconSprite()}
<div class="doc">
  <header class="doc-head">
    <p class="kicker">Visual direction ${w.n} of 3</p>
    <h1>${w.name}</h1>
    <p>${w.tagline}. One shell, four surfaces, same content — so the three directions can be compared directly. Static mockup for a decision; not product code. No winner is declared.</p>
  </header>
  <section class="rationale" aria-label="Written rationale">
    <h2>Rationale — what this world says, suits and costs</h2>
    <dl class="rationale-grid">${rat}</dl>
  </section>
  ${wrap(w, 0, surface1(w))}
  ${wrap(w, 1, surface2(w))}
  ${wrap(w, 2, surface3(w))}
  ${wrap(w, 3, surface4(w))}
</div>
</body>
</html>
`;
}

for (const w of WORLDS) {
  const path = join(outDir, `direction-${w.n}-${w.slug}.html`);
  writeFileSync(path, doc(w), "utf8");
  console.log(path);
}
