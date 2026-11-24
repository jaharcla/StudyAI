# Agentic PPTX creation and editing for a Tutor: research brief

Date: 2026-11-23
Scope: agentic slide generation/editing, PPTX internals, images/fonts/themes/formatting/special features, and the learning-science evidence for using generated slides as study artifacts in StudyAI.
Method: web search + direct fetch of primary sources (official docs, arXiv abstracts, journal abstracts, official help pages). No paid search/firecrawl/exa calls. Citation verification: every arXiv ID and DOI below was resolved against arxiv.org, the DOI resolver, or the publisher page during this research. This is a preprint-heavy area; peer-review status is marked. No retraction scan was performed (all cited items are 2018–2026 and current at time of writing).

---

## 1. Executive summary

1. **The "extract JSON → agent edits JSON → write PPTX" shape is a known, workable pattern — but the field has moved past plain JSON element dumps.** The strongest systems (PPTAgent, AutoPresent, DeepPresenter, SlideLab) all use a *semantic/intermediate representation* (reference slide + content schema, or a visual program), expose a small set of typed **edit actions**, render intermediate slides, and run a bounded **render → inspect → repair** loop. A shape-index/absolute-coordinate JSON schema is the weakest of these representations and has documented failure modes (overlap, off-slide shapes) even in published systems.
2. **Template-based editing is the right instinct.** It preserves masters, layouts, theme, and media. Office's own model is hierarchical (presentation → master → layout → slide → placeholders), and a theme carries color/font/format schemes. But "fill placeholders by semantic name" beats "patch raw shape indices" both in Office's design and in production agent tooling.
3. **PPTX round-tripping is a fidelity minefield.** python-pptx explicitly says the format is richer than its feature set and that it round-trips what it does not understand; PptxGenJS cannot officially load an existing deck; direct OOXML editing can corrupt the package (namespace rewriting, element ordering, timing elements left behind after deleting animated shapes). Anthropic's production pptx skill mandates schema/relationship validation plus rendered-visual QA after every change.
4. **Visuals are not decoration. They are the learning mechanism, and they can also destroy learning.** Mayer's coherence/median effect sizes (~0.82–1.32) and the "seductive details" literature show irrelevant decorative graphics and text hurt transfer; spatial/temporal contiguity and signaling help. An agent that "makes slides pretty" without a semantic reason is likely to reduce learning.
5. **The educational evidence does not support "AI makes good slides ⇒ students learn more."** A 48-study meta-analysis found essentially no average effect of PowerPoint on cognitive learning (Hedges' g = 0.067, 95% CI −0.103 to 0.236), with a positive effect only in the small K-12 subgroup. A 2026 educational benchmark (SLATE) found content validity weakly associated with learning gain while *pedagogical design* was robustly associated, plus a near/far transfer gap and occasional negative gains. So the Tutor should optimize for pedagogy and transfer, not visual polish metrics.
6. **Accessibility constraints are actionable and mostly deterministic**: every slide needs a unique title, non-text content needs alt text, reading order must be logical, contrast ≥4.5:1 (3:1 for large text/graphics), captions for media, and body text large enough to read. These can be machine-checked before a deck ships.
7. **Concrete recommendation for StudyAI**: keep the PPTX renderer, but make the agent-facing object semantic (slide role, claim text, sourceRefs, image intent, notes), compute geometry deterministically from template placeholders, delegate font/theme to the template, run a deterministic validator + a rendered-slide inspect loop, and score the whole thing on grounded pedagogical criteria rather than beauty. Detailed design in §7.

---

## 2. What a PPTX actually is (and why it matters for editing)

Official Microsoft Open XML documentation [1] describes PresentationML as a package of separate XML parts:

| Part | Element | Role |
|---|---|---|
| Presentation | `<presentation/>` | slide list, master list, notes/handout masters, slide size |
| Slide master | `<sldMaster/>` | formatting/text/objects inherited by all derived slides |
| Slide layout | `<sldLayout/>` | default appearance/position of drawing objects for a slide type |
| Slide | `<sld/>` | one part per slide, referenced by ID + relationship |
| Theme | `<officeStyleSheet/>` | color scheme, font scheme, format/effects scheme |
| Notes master / notes slide | `<notesMaster/>`, `<notes/>` | presenter notes |
| Comments, handout master, images, charts, diagrams, media | separate parts | optional features |

Consequences for an editing design:

- **Slide order is not `slideN.xml` order.** The `<p:sldIdLst>` in `ppt/presentation.xml` plus `presentation.xml.rels` define order; `slideN.xml` filenames are incidental [1]. A JSON keyed only by filename will silently corrupt decks whose physical names differ from presentation order. This repo's `server/document-intelligence/extract.ts:69-86` already resolves order through `presentation.xml` + rels — reuse that authority.
- **Shape IDs are package-local identifiers.** `<p:cNvPr id="2" name="Title 1"/>` is an internal non-visual drawing property [1]; it is unique on a slide, not a semantic key. Treating it as a stable model-editable field is fragile. Use placeholder name/role + position in the slide's shape tree as the logical key, and let the serializer allocate IDs.
- **Geometry is EMU.** The example `<p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>` is 914400 EMU = 1 inch [1]. 16:9 is typically 12192000 × 6858000 EMU. Validation must check all `xfrm` offsets/extents against slide dimensions and detect overlap.
- **Inheritance is the styling system.** A slide layout "defines the default appearance and positioning of drawing objects" [1]; a theme's `clrScheme`/`fontScheme`/`fmtScheme` define the look and feel [1]. If the agent writes absolute colors/fonts/coordinates into each slide, restyling the template later no longer works and the deck drifts from the course brand.
- **Animations live in `<p:timing/>` on the slide/layout, transitions in `<p:transition/>`** [2]. Deleting a shape without deleting its timing entries leaves PowerPoint offering to repair the file [3].
- **Fonts can be embedded** via `<p:embeddedFontLst>` in `presentation.xml`, but OpenType/TrueType embedding flags govern what is legal; Microsoft's FAQ says "print and preview" fonts can lock the whole document for editing, "no embedding" fonts cannot be embedded, and third-party font licences may be stricter [4].

---

## 3. The agentic PPTX landscape

### 3.1 Peer-reviewed / preprint research systems

| System | What it actually does | Evidence / status |
|---|---|---|
| **PPTAgent** [5] | Two-stage, *edit-based*: analyse reference decks (cluster slides by function, extract content schemas), then draft an outline and iteratively apply typed edit actions (`del_span`, `replace_span`, `del_image`, `replace_image`, `clone_paragraph`) to reference slides. Renders slides to HTML for the LLM and uses a REPL with execution feedback for self-correction. Introduces PPTEval (Content / Design / Coherence). | EMNLP 2025 [5]. 500 tasks, 5 domains, 95% success rate, max 2 self-correction iterations per slide. Ablations: without schema 78.8% success; without code-render 74.6%. Authors note remaining flaws: occasional overlaps and dependence on reference quality. |
| **AutoPresent + SlidesBench** [6] | Benchmark of 7k training / 585 test examples from 310 decks across 10 domains; compares end-to-end image generation vs **program generation**; finds programmatic methods produce higher-quality, user-interactable slides. Trains an 8B Llama model on instruction→code pairs; self-refinement improves quality. | CVPR 2025 poster; arXiv v2 Jun 2025. |
| **DeepPresenter** [7] | Agent plans, renders, and revises intermediate artifacts; **environment-grounded reflection** on perceptual artifact states (rendered slides) rather than internal reasoning traces. State-of-the-art on diverse scenarios; a fine-tuned 9B model stays competitive at lower cost. | ACL 2026; arXiv v3 Apr 2026. |
| **SlideLab** [8] | Training-free multi-agent: narrative planning, then content/visual/layout/grounding agents iteratively refine a shared deck. ConfArena evaluation simulates a conference room and detects injected faults (falsified numbers, degraded figures, dropped slides, shuffled order). | arXiv Sep 2026 (v2 Oct 2026). 77% blind preference over open and commercial systems; ~4× fewer inference tokens than strongest open-source baseline. |
| **SlidesGen-Bench** [9] | Evaluation treating all systems as renderings; computational metrics for **Content, Aesthetics, Editability**; Slides-Align1.5k human-preference dataset (9 systems, 7 scenarios). | EMNLP 2026 Main; arXiv v2 Aug 2026. |
| **Presentation Intelligence training** [10] | Cross-validated data synthesis, rules/prior-grounded teacher enhancement, mixed-teacher SFT, then verifiable aesthetic metrics with GRPO RL. +7.45 / +9.35 points on PresentBench for Qwen-3.6-27B / 35B-A3B. | arXiv Oct 2026, preprint. |
| **SlideLab / X+Slides / SeaSlides** [8][11][12] | Audience-centred and semantic-abstraction approaches: condition on audience expertise, separate semantic intent from layout execution. | 2026 preprints; emerging. |

**Convergent findings across these systems** (triangulated across ≥3 groups):
- A *reference/template plus typed edit actions* beats free-form text-to-slide for structural coherence [5][6][8].
- A *structured outline / narrative plan* is a major contributor; removing it costs coherence [5][8].
- *Rendering the intermediate artifact and reflecting on the image* catches layout defects that JSON-level checks miss [5][7][9].
- *Bounded self-correction with execution feedback* is valuable but must be capped [5][7].
- *Editability is a first-class quality dimension*, not an afterthought [6][9].

### 3.2 Products and commercial agents

- **Microsoft Copilot for PowerPoint** can turn documents into decks with speaker notes and references, with "Allow editing" (direct edits) and "Chat only" modes [13].
- **ChatGPT Slides / ChatGPT for PowerPoint**: ChatGPT can create and collaborate on slides, export to `.pptx`/PDF/Google Slides; the PowerPoint sidebar helps create/edit/polish while "preserving editable slide structure" [14]. OpenAI's own agent announcement notes slideshows are a beta capability and "outputs can sometimes feel rudimentary in its formatting and polish" [15] — a useful honesty check on the state of the art.
- **Anthropic's pptx skill** [3] is the most detailed public production recipe: create new decks with `pptxgenjs`; **edit existing decks by unzip → edit `ppt/slides/slideN.xml` → rezip**; read via text/thumbnail scripts; mandatory validation and visual QA; and a long list of concrete file-corrupting gotchas.

### 3.3 Editing approaches compared

| Approach | Strength | Failure modes |
|---|---|---|
| Raw OOXML unzip/edit/rezip [3] | Maximum fidelity, preserves everything not touched | Namespace rewriting (ElementTree corrupts namespaces — use defusedxml/minidom), element ordering in `<p:presentation>`, orphaned relationships/media, stale `<p:timing>`, corrupt ZIP if zipped from outside the folder |
| python-pptx [16][17] | Mature, "industrial-grade", round-trips unknown parts, adds slides/text/images/tables/charts/notes | Cannot duplicate slides; `text_frame.text = ...` destroys run formatting; cannot read SVG/EMF art used in templates; rich format not fully supported; docs inconsistent on Notes Pages support |
| PptxGenJS [18] | Best programmatic *creation* in JS/TS, native charts/tables/shapes/SVG/GIF/media, slide masters, TS types, Node/browser | No official loader for existing decks (feature request open; only third-party forks claim read/round-trip); many low-level gotchas that silently corrupt files [3] |
| Office.js PowerPoint add-ins [19] | Strongly typed API for slides/shapes/formatting inside real PowerPoint | Requires PowerPoint and an add-in host; not viable for a local-first offline app |
| LibreOffice headless [3][20] | Conversion to PDF/PNG for QA and legacy `.ppt` conversion; cross-platform | Rendering differences from PowerPoint; font substitution; not an authoring API |

---

## 4. Visual craft: images, fonts, themes, formatting, special features

### 4.1 Images

- PowerPoint supports common raster formats (JPEG, PNG, GIF, BMP, TIFF) and SVG in modern versions; SVG insertion creates a PNG fallback for older versions, so **vector art can render as a blurry bitmap** in some viewers, and some SVG features are unsupported [21][22]. EMF is the safer vector format when scalability must survive [21].
- `pptxgenjs` can insert SVGs and animated GIFs as images [18]; `python-pptx` cannot read SVG/EMF from templates [3].
- Educational evidence: **decorative images are not neutral.** The seductive-details line of research (Harp & Mayer 1998; Mayer 2009; Schneider et al. 2016/2018) finds interesting-but-irrelevant text/pictures impair learning and that connectedness to the text moderates the effect [23][24]. Rule: every generated image must carry the explanation, not merely decorate it.
- Machine-checkable: alt text present and meaningful (Office checker requires non-text content to have alt text that is not a filename), captions for media, reading order [25].

### 4.2 Fonts and text

- OOXML themes define major/minor font schemes; naming a theme font (`+mj-lt` / `+mn-lt`) keeps text restyling coherent [1][3].
- **Font substitution undermines visual QA**: fonts not installed locally are substituted with different widths, so a LibreOffice render can show overflow that real PowerPoint will not (and vice versa). Anthropic's skill lists a "safe font" set (Arial, Calibri, Cambria, Times New Roman, Courier New, Bookman Old Style, Century Schoolbook) and flags Aptos as unreliable on older Office [3].
- **Math**: Microsoft 365 converts between LaTeX and OMML (Office Math Markup Language) [26]; PowerPoint reads only *presentation* MathML in MathML import scenarios [27]. For a generated deck, native OMML or a rendered SVG/PNG fallback is safer than dumping LaTeX text [26][27].
- **Size**: institutional accessibility guidance (ARL, Lancaster, PSU, Scope) commonly requires ≥24pt minimum for projected slides, with 18pt for supporting text in some guidance [28]. This is *institutional guidance, not an RCT*. It also conflicts with the dense-deck "14–16pt body" used in some design playbooks [3]; resolve by use case: a projected/lecture deck needs large type; a take-home reference deck can be denser.
- Text overflow is the single most common user-visible defect in generated decks; check it after rendering, not before [3].

### 4.3 Themes, masters, layouts, placeholders

- Theme = color scheme + font scheme + format scheme; master = inherited formatting; layout = default appearance/position for a slide type; placeholders inherit from layout [1][2].
- Production pattern [3]: define one layout per slide *frame* (title, section divider, title-only, chart+commentary, table), put footer/logo/slide number on the layout, fill placeholders by name, and apply theme colors via scheme colors. Misnamed placeholders fail silently.
- Importantly, `pptxgenjs` cannot write theme colors directly; a post-processing step is needed to inject the theme [3]. If you instead start from a real template `.pptx`, the theme is already present — a strong argument for template-based editing.

### 4.4 Charts, tables, notes, animations, transitions, media

- Native charts are strongly preferable to rendered images for editability; PptxGenJS has known chart XML that PowerPoint refuses to open (validated by a schema checker), and stacked-label/combo-axis options that corrupt files if configured wrong [3][18].
- PowerPoint tables cannot hold images or nested tables [29].
- Speaker notes belong in notes parts (`slide.addNotes()`), not a visible text box [3][1]. Notes are pedagogically valuable: they let a generated deck carry explanation/working without overloading the slide, which is consistent with segmenting and modality principles [30].
- Animations/transitions are PresentationML features [1][2] but mostly beyond python-pptx's API; shape-level animation insertion is an open feature request, and stale `<p:timing>` after deleting a shape triggers repair prompts [3]. **For a study artifact, prefer no animation unless it encodes a causal sequence**, since decorative motion is a classic extraneous-load source [23][30].
- Hyperlinks/comments/media exist as separate parts and relationships [1]; editing must keep relationships intact.

### 4.5 Accessibility (deterministic gates)

Office Accessibility Checker rules relevant to decks [25]: all non-text content has alt text (not filenames), table headers specified, meaningful section names, **all slides have titles**, simple table structure, **sufficient text/background contrast**, **captions for audio/video**, and **logical reading order**. Tips: unique slide titles and unique section names. The checker itself admits it cannot detect all issues (e.g., color-only information) [25]. WCAG 2.2 sets 4.5:1 for normal text, 3:1 for large text and important non-text graphics [31]. These map directly onto validator rules for generated decks.

---

## 5. Educational grounding: what makes a *study* slide useful

### 5.1 Cognitive theory of multimedia learning (Mayer)

Mayer's CTML rests on dual-channel, limited-capacity, and active-processing assumptions [30][32]. Effect sizes reported in the primary chapters (median, transfer tests):

| Principle | Finding | Reported median effect size / support |
|---|---|---|
| Multimedia | Words + pictures > words alone | 1.90, 3/3 tests [30] |
| Spatial/temporal contiguity | Place corresponding words near pictures; present together | 1.30 (8/8) [30]; 1.11 (8/8) [32]; 0.60 signaling [33] |
| Coherence | Exclude extraneous words/sounds/pictures | 0.82 (4/4) [30]; 1.32 (10/11) [33] |
| Modality | Narration > on-screen text for spoken explanation | 1.17 (4/4) [30] |
| Redundancy | Graphics + narration > graphics + narration + on-screen text | 1.24 (2/2) [30]; 0.69 (10/10) [33] |
| Signaling | Cue key steps/organization | 0.74 (1/1) [30] |

Caveats: many of these are from one laboratory, with small numbers of closely related experiments, and "transfer" tests are often short problem-solving assessments. Treat them as strong design heuristics, not universal laws. The 2005 chapter reframes coherence/signaling/redundancy/spatial/temporal contiguity as ways to reduce **extraneous overload** [33].

### 5.2 Cognitive load and expertise reversal

Cognitive load theory distinguishes extraneous, intrinsic, and germane load; the expertise-reversal effect means scaffolding that helps novices becomes redundant (and harmful) for advanced learners [34]. For a Tutor this means: adapt slide detail to the student's mastery (BKT/FSRS state already exists in StudyAI), and allow "reveal detail" layers (speaker notes, appendix slides) rather than forcing all detail onto one slide.

### 5.3 Does PowerPoint actually help learning?

- **Baker et al. 2018** [35]: 48 studies over 22 years; **no average difference** in cognitive learning between PowerPoint and traditional instruction (Hedges' g = 0.067, 95% CI −0.103 to 0.236). K-12 subgroup positive (k = 3), college subgroup not. Authors explicitly call for research on *how* features are integrated, not presence/absence. This is the key caution: a deck is a delivery format, not a learning intervention by itself.
- **Bartsch & Cobern 2003** (reported in secondary reviews [36][37]): students scored about 10% lower on quizzes after elaborate slides with pictures/sound/text variations vs transparencies or text-only slides — a concrete seductive-details warning. (Primary article not directly fetched; flagged as secondary.)
- **Impact of slide access** [38]: 71 undergraduates, 3 (access) × 2 (immediate/delayed) within-subjects; no-copy condition significantly worse than full or partial copies; partial copies showed a long-term encoding advantage; note-taking markers (not word count) predicted performance. Implication: give students the deck (or partial scaffolds) and prompt them to generate notes/answers, rather than shipping a fully self-contained script.
- **Student perception ≠ learning**: multiple reviews find students *prefer* PowerPoint and report learning more even when measured learning is unchanged [35][36]. Do not use satisfaction as the primary success metric.

### 5.4 Practice testing, spacing, and generation effects

Dunlosky et al. 2013 [39] rated **practice testing** and **distributed practice** as the two techniques with the highest utility; interleaving has moderate utility; rereading and highlighting are low. Applied to decks: convert key points into question/reveal slides, revisit concepts across slides and lessons, and use the existing FSRS/BKT engine to schedule review. This aligns with the Artifact Intelligence System's `question`/`flashcard` components and the repo's rejection of "artifacts that never enter the learning engine" [40].

### 5.5 AI-generated slides specifically

- **Leinonen, Zhang & Hellas 2026** [41] (WCCCE 2026): compared NotebookLM, Claude, M365 Copilot, Cursor, Claude Code for generating slides from instructor notes. Coding assistants produced the most accurate, complete, pedagogically sound slides; students rated GenAI slides similarly to instructor slides and could not reliably identify them. Important: educators chose and modified the best slides before real course use — human curation was part of the workflow.
- **SLATE 2026** [42]: first benchmark tying AI-generated teaching slides to knowledge acquisition (90 units, 1,133 items, low-resource-language puzzles to avoid pretrained knowledge leakage, near/far transfer tests). Content validity correlated *weakly* with learning gain; **pedagogical design correlated strongly**; near/far transfer gap widespread; some frontier systems produced negative learning gains. Uses VLM learner proxies with a small human pilot — promising but preliminary.
- **Hou et al. 2026** [43]: controlled experiment (slide-based vs unprompted AI vs prompted AI). Prompted AI improved open-ended reasoning (~2–3 points on an 18-point scale, p < 0.01) but not multiple choice; unprompted AI ≈ slides. Implication: structure the Tutor's slide-generation interaction and include active/reasoning prompts; raw "generate a deck" is not enough.
- **General GenAI-in-education reviews** [44][45] emphasize benefits (automation, tailored explanations) alongside hallucination, cognitive offloading, and superficial-learning risk. StudyAI's existing provenance/review rules are the right countermeasure.

### 5.6 What the literature does *not* establish

- No reliable ideal slide count, text-density threshold, or visual-complexity number; "six-by-six" style rules are heuristics, not evidence.
- No strong evidence that *AI-generated* decks improve learning outcomes; the most relevant benchmark [42] is a preprint with proxy learners.
- Little evidence isolate animations/transitions, specific themes, or font choices as learning interventions; these are craft/accessibility constraints, not learning mechanisms.
- Effect sizes in Mayer's tables come from limited experimental sets; generalize cautiously across subjects and ages.

---

## 6. Capability / constraint matrices

### 6.1 Library support (verified from official docs or the production skill [3])

| Feature | python-pptx | PptxGenJS | Direct OOXML | Office.js |
|---|---|---|---|---|
| Create new deck | yes (template-based) [16][17] | yes [18] | yes | yes |
| Load & edit existing deck | yes | no official loader [3] | yes | yes |
| Duplicate slide | no [3] | n/a | via helper [3] | yes |
| Text runs | yes (assign `run.text` to keep formatting) [3] | yes | yes | yes |
| Placeholders / masters | yes [16] | masters (actually layouts) [3][18] | yes | yes |
| Native charts | most non-3D types [16] | broad, but known corrupt-output cases [3][18] | yes | yes |
| Tables | yes (text-only cells) [29] | yes | yes | yes |
| Speaker notes | API exists [16]; docs inconsistent [17] | `addNotes()` [3] | yes | yes |
| SVG / EMF | cannot read SVG/EMF [3] | SVG supported [18] | yes | partial |
| Animations / transitions | limited / open request [3] | limited | full (`timing`, `transition`) [1][2] | full |
| Theme colors | read; no direct write | needs post-processing [3] | full [1] | yes |
| Font embedding | no direct API | no | `embeddedFontLst` [1][4] | no |

### 6.2 Design rules for Tutor-generated study slides (evidence-linked)

1. One message per slide; structure as narrative (setup → mechanism → consequence → check) [5][8].
2. Text supports a visual that carries the explanation; delete decorative graphics and music [23][30][33].
3. Put labels next to what they label; reveal related verbal and visual material together [30][32].
4. Signal the key step with emphasis/position, not extra words [30][33].
5. Move long explanation into speaker notes or a follow-up slide (segmenting) [30]; expose detail progressively according to mastery [34].
6. Include retrieval checkpoints (question/reveal slides) and revisit them across lessons [39]; feed accepted items into FSRS/BKT rather than leaving them in the deck [40].
7. Every claim carries a course `sourceRef` and excerpt; invented/unsupported claims are downgraded or blocked [40][42].
8. Unique slide titles, alt text, logical reading order, ≥4.5:1 contrast, captions [25][31]; body type sized for the use case [28].
9. Prefer template theme/placeholders; never hard-code colors/fonts/geometry that should inherit [1][3].
10. Render and inspect every slide; validate package and relationships; cap repair loops [3][5][7].

---

## 7. Implications for the design under discussion

The proposed three stages (`pptx_to_json.py` → agent edits `deck.json` → `json_to_pptx.py`) get **stage 1 and 3 conceptually right** (template round-trip) but put the agent at the wrong abstraction level. Research-backed redesign:

```
Retrieved course evidence + ArtifactPackage components
        ↓ semantic planner (roles, claims, sourceRefs, image intents, notes)
Semantic deck spec (no shape IDs, no absolute coordinates)
        ↓ deterministic layout + theme binding (template placeholders)
PPTX renderer (unzip/edit slide XML or pptxgenjs + theme injection)
        ↓ validator (schema, rels, bounds, overlap, contrast, titles, alt text, citations)
Rendered slides (LibreOffice → PDF/PNG) → inspect → one bounded repair call
        ↓
output.pptx + one review transaction (accept / correct / decline)
```

Key changes:
- Replace editable shape indices and coordinates with stable logical keys (placeholder name / slide role) and semantic fields; compute geometry from slide size and layout [1][2].
- Add typed edit actions (replace text, replace image, duplicate slide, delete slide, set notes) rather than open-ended JSON mutation; this is the pattern that produced 95% success in PPTAgent [5].
- Add bounded render-grounded reflection [7] and a package validator [3]; cap at one repair call to match the repo's provider-call budget.
- Keep `direct`-excerpt provenance per claim and run the existing citation-containment filter [40]; SLATE shows content validity alone is a weak predictor of learning [42].
- Add a pedagogical quality dimension to evaluation (intent fidelity, grounding, transfer-supporting structure) rather than only Content/Aesthetics; the field's own benchmarks now separate pedagogy from polish [9][42].
- Treat python-pptx/PptxGenJS as renderer candidates behind an interface; decide via an ADR with exact version/licence/limits. Prefer TS (PptxGenJS for creation, direct OOXML for template editing) to avoid adding a Python runtime to a Node-only local-first app. Note the fidelity gaps in §3.3 and §6.1.

---

## 8. Sources

All URLs resolved during research on 2026-11-23. arXiv IDs and DOIs are primary identifiers.

[1] Microsoft, "Structure of a PresentationML document" — https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document (updated 2025-03-26)
[2] Microsoft, "Working with slide layouts" — https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-slide-layouts (updated 2025-03-26)
[3] Anthropic, `skills/pptx/SKILL.md` — https://raw.githubusercontent.com/anthropics/skills/HEAD/skills/pptx/SKILL.md
[4] Microsoft, "Font redistribution FAQ" — https://learn.microsoft.com/en-us/typography/fonts/font-faq (2024-11-19); OOXML `embeddedFontLst` — https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/e3870782-1f40-4ef1-a3a8-01ee13661283
[5] Zheng et al., "PPTAgent: Generating and Evaluating Presentations Beyond Text-to-Slides", arXiv:2501.03936, EMNLP 2025 — https://arxiv.org/abs/2501.03936 ; ACL anthology — https://aclanthology.org/2025.emnlp-main.728.pdf
[6] Ge et al., "AutoPresent: Designing Structured Visuals from Scratch", arXiv:2501.00912 (CVPR 2025) — https://arxiv.org/abs/2501.00912
[7] Zheng et al., "DeepPresenter: Environment-Grounded Reflection for Agentic Presentation Generation", arXiv:2602.22839, ACL 2026 — https://arxiv.org/abs/2602.22839
[8] Vats, Sharma & Wang, "SlideLab: Audience-Centered Scientific Slide Generation and Evaluation", arXiv:2609.30294 — https://arxiv.org/abs/2609.30294
[9] Yang et al., "SlidesGen-Bench", arXiv:2601.09487, EMNLP 2026 — https://arxiv.org/abs/2601.09487
[10] Xie et al., "Building Presentation Intelligence for High-Quality Slide Generation", arXiv:2610.30888 — https://arxiv.org/abs/2610.30888
[11] "X+Slides: Benchmarking Audience-Conditioned Slide Generation", arXiv:2606.19256 — https://arxiv.org/abs/2606.19256
[12] "SeaSlides: Semantic Abstraction Layer for Agentic Slide Generation", arXiv:2608.03298 — https://doi.org/10.48550/arxiv.2608.03298
[13] Microsoft Learn, Copilot in PowerPoint training — https://learn.microsoft.com/en-us/training/modules/present-copilot-microsoft-powerpoint
[14] OpenAI Help Center, "Creating and collaborating on slides in ChatGPT" and "ChatGPT for PowerPoint" — https://help.openai.com/en/articles/20001605-creating-and-collaborating-on-slides-in-chatgpt ; https://help.openai.com/en/articles/20001242-chatgpt-for-powerpoint
[15] OpenAI, "Introducing ChatGPT agent" — https://openai.com/index/introducing-chatgpt-agent
[16] python-pptx 1.0.0 docs, index and "Working with Presentations" — https://python-pptx.readthedocs.io/en/latest/index.html ; https://python-pptx.readthedocs.io/en/latest/user/presentations.html
[17] python-pptx "Working with charts" / tables / notes — https://python-pptx.readthedocs.io/en/latest/user/charts.html ; https://python-pptx.readthedocs.io/en/latest/user/table.html ; https://python-pptx.readthedocs.io/en/latest/user/notes.html
[18] PptxGenJS README — https://github.com/gitbrent/PptxGenJS/blob/master/README.md ; docs — https://gitbrent.github.io/PptxGenJS
[19] Microsoft, "PowerPoint JavaScript object model in Office Add-ins" — https://learn.microsoft.com/en-us/office/dev/add-ins/powerpoint/core-concepts
[20] LibreOffice, "PDF Export Command Line Parameters" — https://help.libreoffice.org/latest/he/text/shared/guide/pdf_params.html
[21] Microsoft Q&A, SVG/PNG fallback and EMF guidance — https://learn.microsoft.com/en-us/answers/questions/5258047/how-do-i-stop-background-images-and-vector-assets
[22] Microsoft Support, "Edit SVG images in Microsoft 365" — https://support.microsoft.com/en-us/office/graphics-visuals/edit-svg-images-in-microsoft-365
[23] Harp & Mayer 1998; Mayer 2009; Schneider et al. 2016/2018 — https://sciencedirect.com/science/article/abs/pii/S0959475212000515 ; https://nschwartz.yourweb.csuchico.edu/Schneider%20et%20al.%20(2016)%20decorative%20pictures.pdf ; https://psycnet.apa.org/record/2017-24521-001
[24] "When graphics improve liking but not learning" — https://sciencedirect.com/science/article/pii/S0747563212000921
[25] Microsoft Support, "Rules for the Accessibility Checker" — https://support.microsoft.com/en-us/accessibility/office-accessibility/rules-for-the-accessibility-checker
[26] Microsoft, "LaTeX Support in Microsoft 365" / "MathML Support" — https://learn.microsoft.com/en-us/office/math/latex ; https://learn.microsoft.com/en-us/office/math/mathml
[27] Microsoft Open Specifications, MathML in PowerPoint — https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oodf3/5141f6cf-0a4b-445b-8e57-3b13a3f96002
[28] ARL / Lancaster / PSU / Scope PowerPoint accessibility guidance — https://arl.org/accessibility-guidelines-for-powerpoint-presentations ; https://portal.lancaster.ac.uk/ask/checklist-powerpoint ; http://accessibility.psu.edu/legibility/fontsize ; https://business.scope.org.uk/how-to-make-your-powerpoint-presentations-more-accessible/
[29] python-pptx, "Working with tables" — https://python-pptx.readthedocs.io/en/latest/user/table.html
[30] Mayer 2002, "Cognitive Theory and the Design of Multimedia Instruction" — https://nschwartz.yourweb.csuchico.edu/Mayer%20Multimedia%20Learning%202002.pdf
[31] W3C, WCAG 2.2 SC 1.4.3 and 1.4.11 — https://www.w3.org/WAI/WCAG22/understanding/contrast-minimum ; https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
[32] Mayer, "Multimedia Learning" (Japanese Psychological Research translation/pdf) — https://www.jstage.jst.go.jp/article/arepj1962/41/0/41_27/_pdf
[33] Mayer, "Principles for Reducing Extraneous Processing...", in *The Cambridge Handbook of Multimedia Learning* (2005) — https://doi.org/10.1017/cbo9780511816819.013
[34] Kalyuga, Ayres, Chandler & Sweller, expertise reversal (discussed in [36]); Sweller, cognitive load theory
[35] Baker, Goodboy, Bowman & Wright 2018, "Does teaching with PowerPoint increase students' learning? A meta-analysis", *Computers & Education* 126:376–387 — https://doi.org/10.1016/j.compedu.2018.08.003
[36] ODU, "Instructional Message Design with PowerPoint" (review summarizing Bartsch & Cobern 2003, Apperson et al. 2006, expertise reversal) — https://digitalcommons.odu.edu/cgi/viewcontent.cgi?article=1004&context=instructional_message_design
[37] Center for Inquiry, "Does PowerPoint Improve Student Learning?" (secondary summary) — https://centerforinquiry.org/blog/does-powerpoint-improve-student-learning/
[38] "Impact of slide-based lectures on undergraduate students' learning", *Computers & Education* 123:13–25 — https://doi.org/10.1016/j.compedu.2018.04.004
[39] Dunlosky, Rawson, Marsh, Mitchell & Willingham 2013, "Improving Students' Learning With Effective Learning Techniques" — https://pubmed.ncbi.nlm.nih.gov/26173288 ; ERIC version — https://files.eric.ed.gov/fulltext/EJ1021069.pdf
[40] StudyAI internal design: `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md` and `docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`
[41] Leinonen, Zhang & Hellas 2026, "AI-Generated Slides: Are They Good? Can Students Tell?", WCCCE 2026, arXiv:2605.13532 — https://arxiv.org/abs/2605.13532
[42] Wu et al. 2026, "SLATE: Are AI-Generated Slides Educationally Effective?", arXiv:2609.06212 — https://arxiv.org/abs/2609.06212
[43] Hou, Xiao, Liu & Mueller 2026, "The Role of Instructional Guidance in Generative AI-Assisted Learning", arXiv:2606.05509 — https://arxiv.org/abs/2606.05509
[44] Guizani et al. 2025, systematic review of LLMs in higher education — https://link.springer.com/article/10.1007/s44217-025-00424-7
[45] "From Superficial Outputs to Superficial Learning: Risks of LLMs in Education", arXiv:2509.21972 — https://arxiv.org/html/2509.21972

---

## 9. Verification notes / open questions

- Verified by direct fetch: [1][2][3][4][5][6][7][8][9][10][14][15][16][17][18][19][21][25][26][27][28][30][31][32][33][35][38][39][41][42][43][44][45].
- Secondary-only (flagged in text): Bartsch & Cobern 2003 figures [36][37]; some font-size guidance [28] is institutional rather than empirical; Baker subgroup result verified from publisher abstract but full moderator table not inspected.
- No cloud-provider spend or paid search tools were used; no files were modified outside this research document.
- Open question for implementation: whether a template-based OOXML editor in TypeScript (preserving theme/master fidelity) or PptxGenJS + theme injection better fits the local-first constraint. This needs a spike with a real course template before an ADR is written.
