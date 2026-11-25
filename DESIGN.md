# StudyAI DESIGN.md

The single source of truth for how StudyAI looks, moves and speaks. Every surface follows it. If a surface needs something this file doesn't cover, extend this file in the same commit rather than inventing a one-off.

**How to apply this file**

- The app already has shared tokens (`--surface`, `--border`, and others). Map every value below onto the existing token names. Don't fork a second token set. Where a value differs, change the existing token's value once and let it propagate.
- Colors below were sampled from real screenshots of the current app. Treat them as the starting point and confirm against the repo.
- This is a cohesion pass, not a redesign. Keep the warm, paper-like identity that already exists. Remove inconsistency; don't add decoration.

---

## 1. Intent

StudyAI is a calm place to think. It should feel like a well-made notebook that happens to be intelligent: quiet, warm, precise, and fast.

- **Quick:** the next action is always obvious and one click away.
- **Simple:** one primary action per screen; everything else is quieter.
- **Elegant:** warm neutrals, generous space, one accent, restrained motion.
- **Fluid:** transitions explain where you went; nothing jumps, flashes or double-renders.

The Scientific Canvas is the hero. Chrome around it stays low-contrast so student work is the brightest thing on screen.

Modern and restrained, never trend-chasing. No gradients, glassmorphism, neon, emoji decoration or mascots.

---

## 2. Tokens

### 2.1 Color (light)

| Token role | Value | Use |
| --- | --- | --- |
| `bg` | `#F4F1EA` | App background, rails, sidebars |
| `bg-sunken` | `#F1EEE7` | Sidebar fill, inset regions |
| `surface` | `#FFFDF8` | Cards, modals, panels, inputs |
| `surface-page` | `#FBFAF7` | Full-page study surfaces |
| `ink` | `#2B2824` | Primary text, selected-state fill |
| `ink-muted` | `#6B645B` | Secondary text, captions |
| `ink-faint` | `#9A9288` | Placeholders, disabled |
| `border` | `#E4DED3` | Hairlines, card outlines |
| `border-strong` | `#CFC7B9` | Inputs, hovered outlines |
| `accent` | `#8E5A41` | The "do this" color: primary buttons, eyebrow labels, links, focus ring |
| `accent-hover` | `#7C4D37` | Accent pressed/hover |
| `accent-soft` | `#F3E7DF` | Selected choice tint, accent chips |
| `success` | `#4F7A57` | Correct, saved |
| `success-soft` | `#EEF4EC` | Correct card tint |
| `danger` | `#9A3F3F` | Errors, wrong answers |
| `danger-soft` | `#FBEFEC` | Error banner fill (border `#F0D8D2`) |
| `notice-soft` | `#F6EFE2` | Informational banner fill |

Contrast: all text/background pairs meet WCAG AA (4.5:1, large text 3:1). `ink-faint` is for placeholders and disabled states only, never for information a student needs.

### 2.2 Color (dark)

Dark mode inverts luminance, not hue. Keep the warmth.

| Token role | Value |
| --- | --- |
| `bg` | `#1C1A17` |
| `bg-sunken` | `#171512` |
| `surface` | `#252220` |
| `ink` | `#F2EEE6` |
| `ink-muted` | `#B7AFA3` |
| `border` | `#3A352F` |
| `accent` | `#D79A7A` (lifted for contrast) |
| `accent-soft` | `#3A2B24` |
| `success` / `danger` | lifted to meet AA on `surface` |

Every component must be checked in both modes. No hard-coded hex in components; tokens only.

### 2.3 Typography

- **UI sans:** system UI stack (`Inter`, `system-ui`, `Segoe UI`, `sans-serif`) for all controls, labels, tables and body.
- **Reading serif:** one serif (`Source Serif 4`, `Georgia`, `serif`) for page titles inside study content, the Tutor's empty-state prompt, artifact titles, and pulled definitions. It marks "this is the lesson", not the chrome.
- **Mono:** only for code and raw identifiers a student explicitly asked to see.

| Style | Size / line | Weight | Notes |
| --- | --- | --- | --- |
| Display (serif) | 28/34 | 600 | Artifact and page titles |
| Title | 20/26 | 600 | Surface headings |
| Section | 15/22 | 600 | Card headings |
| Body | 14/22 | 400 | Default |
| Small | 13/18 | 400 | Captions, metadata |
| Eyebrow | 11/14 | 600, `+0.08em`, uppercase | `accent` color. One per surface, above the title |

Minimum text size is 12px. Never put raw IDs, `snake_case`, JSON or file-system paths in student-facing text.

### 2.4 Spacing, radius, elevation

- **Space scale:** 4, 8, 12, 16, 24, 32, 48. Nothing off-scale.
- **Radius:** 8 (controls, chips), 12 (cards, banners), 16 (modals, panels), full (pills, chat input).
- **Elevation:** three levels only. `flat` (hairline border), `raised` (cards on hover: 0 1px 2px + 0 4px 12px at 6% ink), `overlay` (modals/popovers: 0 12px 40px at 14% ink). No colored shadows.
- **Hit targets:** at least 36×36 on desktop, 44×44 on touch.

### 2.5 Motion

- Duration 180-220 ms, `cubic-bezier(0.2, 0, 0, 1)` (ease-out). Anything longer needs a reason.
- Animate only `opacity` and `transform`. Never animate layout properties.
- Every transition is interruptible. A second click mid-transition retargets; it never queues.
- One surface at a time: a view change crossfades (outgoing fades out as the incoming fades in over the same frame). Two full surfaces must never render overlapped or ghosted.
- `prefers-reduced-motion`: replace movement with an opacity change under 100 ms and keep every state indicator (target chip, selection ring).
- No decorative or looping animation. The only continuous animation allowed is a progress indicator for real work.

---

## 3. Layout and navigation

### 3.1 One shell

The app has one shell: a **top bar**, the **workspace**, and an optional **right Tutor panel**. Study surfaces open as full pages inside the shell; they don't stack modals over the canvas.

### 3.2 Top bar: fewer, clearer destinations

Destinations are a flat set with one selected at a time:

**Canvas · Study · Studio · Concepts**

- **Studio** is the single home for everything generated: create on one side, everything made on the other (see 5.3). Artifacts and Library are not separate destinations.
- **Cards** (flashcards) lives inside Study as a mode, next to Adaptive quiz and Activities.
- Utility icons (Tutor toggle, theme, help, settings) sit at the far right, icon-only with accessible names, separated from destinations.
- The selected destination uses the `ink` fill. At most one filled-`ink` item per control group.

### 3.3 View switcher on the Canvas

The view control is a **segmented control with exactly three views: Canvas / Lecture / Split**. Exactly one segment is selected; a view changes what occupies the workspace.

**Activities and Chemistry are actions**, not views: they open their own panels and never render as selected segments. **Notes is a panel toggle**, not a view, so it uses the outlined toggle style with a pressed state and sits outside the segmented control. Two filled-dark items in one row is never allowed; it reads as two selections. Board utilities — board selection, ink OCR, analysis, labels, undo/redo and file import/export — belong to the canvas tool bar, not to the view control.

### 3.4 Surfaces

- **Study and Studio** are full pages with a left rail (sections) and a content column no wider than 720px for reading and 1040px for galleries.
- **Modals** are only for short, interruptive decisions (confirm, rename, upload). Anything a student stays in is a page.
- Page header: eyebrow, serif or sans title, one line of context, then at most **one primary and one secondary** action, right-aligned, same height as every other header action (36px).

---

## 4. Components

### 4.1 Buttons: one meaning per color

| Kind | Look | Meaning |
| --- | --- | --- |
| **Primary** | `accent` fill, white text | "Do this": Generate, Check answers, Make quiz, Save. **One per surface.** |
| **Secondary** | `surface` fill, `border-strong` outline, `ink` text | Alternatives: Back, Download, Try again |
| **Tertiary** | text only, `accent` | Inline: Show source, Advanced |
| **Selected** | `ink` fill, white text | "You are here": nav and segmented controls only, never a call to action |
| **Destructive** | `danger` outline; fill only in the confirm step | Delete |

Dark-filled never means "click me", and brown-filled never means "you are here". All buttons in one row share height and radius. Loading state: keep the label, add a spinner, disable, set `aria-busy`.

### 4.2 Inputs and selects

- All form controls are styled from tokens: `surface` fill, `border-strong` outline, 8px radius, 36px height, `accent` focus ring (2px, 2px offset).
- No native-looking `<select>`. Use a styled select or a chip group. For short, fixed filters (artifact type), prefer **filter chips** over a dropdown.
- Every input has a visible label or an accessible name. Placeholder text is a hint, never the label.

### 4.3 Cards

`surface` fill, hairline `border`, 12px radius, 16px padding. Interactive cards lift to `raised` on hover and have a visible focus ring. A card has one primary click target. Artifact cards show type icon, title, source count and date; the whole card opens it.

### 4.4 Citation chips

Small pill, `accent-soft` fill, quote icon, human label such as `c120 module · p. 2`. Click opens the exact passage in the source viewer with the passage highlighted and scrolled into view. A chip never shows an internal ID. If a source can't be opened, the chip is disabled with a tooltip that says why.

### 4.5 Answer choices (practice, quiz)

Choice rows are `surface` with `border`. Selected: `accent-soft` fill and `accent` border. After checking: correct gets `success-soft` and a check icon, a wrong pick gets `danger-soft` and an icon, and color is never the only signal. The explanation sits directly under the choice with its citation chip.

### 4.6 Tutor panel

Right panel, `surface`, 16px radius. The empty state is a serif prompt plus 2-3 suggested actions drawn from the lesson material. The composer is a full-radius pill with the send button inside. No placeholder rows or status chrome ("Coach is quiet" style) when there is nothing to say. Citations render as chips. Uncertainty is a labelled inline note (see 6.3), never hidden.

### 4.7 Banners

Banners appear only when there is a message, and never empty. Kinds: `notice` (sand), `success`, `danger`. A banner has an icon, one sentence, and at most one action. Errors always offer a working **Retry** and say what is unaffected ("Your course material is unchanged.").

---

## 5. Surface rules

### 5.1 Canvas
Chrome is low-contrast and collapsible. Tool palette groups use eyebrow headings; tools are icon + label. Student objects are always shown by human name, never by ID. Selection uses a ring in `accent`; a Tutor focus/highlight reuses the same ring, with a target chip naming the object.

### 5.2 Study
Full page. Left rail lists modes. Questions are cards in a single 720px column with the progress ("2 of 10 answered") pinned above. A session shows one primary action (Check answers); after grading it becomes Try again, with a summary line first ("1 of 2 correct · misses scheduled for review").

### 5.3 Studio (create + library in one)
Left rail: **Create** (Quiz, Practice test, Flashcards, Study guide, Mind map, Slide deck, Infographic), each one click, no form. Right: **Everything made from this lesson**, as a card grid with filter chips (All, Quizzes, Guides, Maps, Decks...). Generating shows a skeleton card with progress in place, then resolves into the real card. Advanced is a collapsed disclosure and never holds anything a student needs.

### 5.4 Today / Continue
The first screen after opening a course. One large **Continue** card (what, why, and a one-line preview of what's inside), then the daily plan as a short checklist. Secondary suggestions are quiet text links. Continue opens its prepared target state, never an empty page.

### 5.5 Decks
Decks look like presentation slides: real layouts, images, speaker notes, clickable citations. They are never rendered as a text list. The editor follows the same tokens; the slide canvas keeps its own theme.

---

## 6. States and language

### 6.1 The four states
Every data view implements all four, and only one at a time:

1. **Loading:** skeleton shapes matching the final layout. Never a bare "Loading..." line.
2. **Empty:** a sentence that says what's missing and a single button that fixes it.
3. **Error:** a `danger` banner with Retry. Never an error and an empty state together.
4. **Content.**

### 6.2 Provider failure
Generation can fail when the model is down or rate-limited. Studying cannot. Grading, review, search and navigation never depend on the provider. Show a plain message ("The study assistant isn't responding right now. Your course material is unchanged."), a Retry, and stay usable.

### 6.3 Uncertainty and grounding
Content from the student's material carries a citation chip. Anything not from their material is labelled "General knowledge, not from your course". When the course material doesn't support an answer, say so plainly; don't guess. Never show confidence numbers StudyAI can't justify.

### 6.4 Voice
Plain, warm, specific, short. Sentence case. Say what happened and what to do next. No exclamation marks, no jargon, no "Oops". Use text that is correct UTF-8; garbled characters (e.g. `â€¦`) are a release-blocking bug. Use "..." only via the real ellipsis character.

---

## 7. Accessibility and responsiveness

- Full keyboard path for every action, visible focus ring, logical tab order, `Esc` closes overlays and returns focus.
- Interactive elements have accessible names; icons alone never carry meaning.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Works at 375px wide: the top bar collapses to a bottom bar of the four destinations, the Tutor becomes a sheet, and the Canvas keeps pan/zoom. No horizontal page scroll anywhere except inside the Canvas and wide tables.
- Text resizes to 200% without loss of content.

---

## 8. Never

- A second accent color, gradients, glass blur, colored shadows, or emoji as UI.
- Two filled-`ink` items in one control group.
- Native-looking form controls mixed with styled ones.
- An empty banner, a raw ID, raw JSON, a stack trace, or a bare "Loading..." line.
- A modal on top of a page the student is working in.
- Two surfaces visible at once during a transition.
- Hard-coded hex values or one-off spacing in components.
- Motion that runs longer than 220 ms or that can't be interrupted.

---

## 9. Verification (make these tests)

A change touching UI is not done until these pass in light and dark:

1. **Token lint:** no hex literals or off-scale spacing in `src/**/*.{tsx,css}` outside the token files.
2. **Button hierarchy:** each page has exactly one Primary button; no page has two `ink`-filled controls in one group.
3. **State coverage:** for Library/Studio, Study, Today and Tutor, Playwright asserts loading, empty and error each render alone, and that error shows a working Retry.
4. **Provider-down:** with the provider stopped, Check answers still grades from the stored key and Studio shows the plain failure message.
5. **Encoding:** a sweep of rendered text asserts no `â`, `Ã` or `ï¿½` sequences.
6. **Contrast:** automated AA contrast check on every surface in both modes.
7. **Motion:** navigation durations are between 150 and 250 ms, and under reduced motion no transform runs.
8. **Responsive:** screenshots at 375, 768 and 1280 with no horizontal overflow.
9. **One-surface rule:** during a view change, only one full surface is visible at every sampled frame.
