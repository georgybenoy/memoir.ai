# EduMentor — Design Document

**Version:** 2.0  
**Status:** Visual direction and implementation specification  
**Reference:** User-provided Student-ia landing-page screenshot  
**Product:** EduMentor — AI-powered, privacy-conscious study companion

---

## 1. Design Intent

EduMentor should feel like a polished, modern AI learning product: focused, atmospheric, and approachable rather than like a generic school portal. Use the supplied Student-ia landing-page screenshot as a **visual reference**, not as content to copy. Adapt its dark navy canvas, violet glow, restrained gradients, thin borders, spacious section rhythm, compact cards, and prominent product preview to EduMentor's learning workflow.

The interface should communicate three things immediately:

1. **Learn from your own material** — import notes and turn them into a structured study experience.
2. **Understand, don't just memorize** — an AI tutor teaches through questions, explanations, and grounded recall.
3. **Build lasting mastery** — review scheduling and progress tracking help learners revisit difficult concepts.

The aesthetic must never compromise readability, accessibility, or calm study sessions. Avoid excessive neon, dense dashboards, decorative motion, and marketing-style claims unsupported by actual product behaviour.

## 2. Reference Image Analysis

The supplied reference uses the following visual patterns:

- A nearly black navy/purple background with subtle grid texture and atmospheric violet lighting.
- A centered, high-contrast hero headline with a gradient-highlighted phrase.
- A large product preview framed in a rounded container.
- Repeated content sections with clear vertical spacing and centered headings.
- Small bordered cards arranged in grids, each with a concise title and description.
- Violet primary actions, subdued secondary actions, and thin low-contrast borders.
- Dashboard-style data panels, progress figures, testimonial cards, FAQ rows, and a structured footer.
- Decorative glow and gradients concentrated around key content rather than applied everywhere.

### Adaptation for EduMentor

Keep the dark cinematic atmosphere, but replace creator-tool marketing sections with learning-specific content. The main product preview should show a believable study workspace: imported document, concept map, tutor conversation, confidence check, and upcoming review queue. Do not use fake testimonials, invented statistics, or pricing cards unless these become real product requirements.

## 3. Brand Foundation

### 3.1 Brand personality

- **Intelligent:** clear hierarchy, structured information, precise feedback.
- **Supportive:** non-judgmental tutor language and encouraging progress states.
- **Focused:** limited decoration and a stable workspace.
- **Private by design:** clear indicators that learning data stays in the user's browser unless a request is sent to the AI service.
- **Capable:** advanced features are discoverable without overwhelming new learners.

### 3.2 Brand voice

Use short, direct, encouraging copy. Prefer:

- “Let's work through this concept.”
- “Try explaining it in your own words.”
- “You're getting closer. Review this prerequisite first.”
- “Due for review today.”

Avoid:

- Shaming language such as “Wrong again.”
- Unsubstantiated promises such as “Master any subject instantly.”
- Overconfident claims that AI feedback is always correct.

### 3.3 Suggested headline and supporting copy

**Headline:** Learn deeply. Remember longer.

**Supporting copy:** Turn your notes into a guided learning path, practise with an AI tutor, and revisit concepts when they matter most.

**Primary CTA:** Start learning  
**Secondary CTA:** Explore how it works

If the application opens directly into the workspace rather than a marketing landing page, use **“What are you learning today?”** as the workspace greeting.

## 4. Visual System

### 4.1 Colour tokens

Use semantic design tokens rather than scattering raw hex values throughout components. The following palette is a starting point based on the reference image and should be checked against WCAG contrast requirements during implementation.

| Token            | Suggested value | Usage                                               |
| ---------------- | --------------- | --------------------------------------------------- |
| `background`     | `#07091B`       | Main page background                                |
| `surface`        | `#0D1028`       | Main panels and sidebar                             |
| `surface-raised` | `#131735`       | Cards, menus, dialogs                               |
| `surface-hover`  | `#1A2044`       | Hover and selected surfaces                         |
| `border`         | `#2A3157`       | Card outlines and dividers                          |
| `text-primary`   | `#F4F5FF`       | Main headings and body text                         |
| `text-secondary` | `#B5BAD6`       | Supporting text                                     |
| `text-muted`     | `#858CAB`       | Metadata; never use for essential low-contrast text |
| `primary`        | `#8B5CF6`       | Primary buttons and active states                   |
| `primary-hover`  | `#A78BFA`       | Hover/focus emphasis                                |
| `accent-blue`    | `#60A5FA`       | Learning insights and selected graph nodes          |
| `accent-cyan`    | `#67E8F9`       | Secondary data visualisation accent                 |
| `success`        | `#34D399`       | Completed or mastered states                        |
| `warning`        | `#FBBF24`       | Due soon, caution, low confidence                   |
| `danger`         | `#FB7185`       | Destructive actions and critical errors             |

**Gradient:** use a restrained blue-to-violet gradient for hero emphasis, selected concept nodes, and occasional progress accents. Do not apply gradient text to long paragraphs or all headings.

**Background effects:** use subtle radial gradients and, optionally, a very low-opacity grid in the landing page. Keep the study workspace quieter and flatter to reduce distraction.

### 4.2 Typography

Use a clean sans-serif such as **Inter** or **Geist**. Use one font family across the product unless a later brand decision requires otherwise.

- Display / landing hero: 48–64 px desktop; 34–42 px mobile.
- Page title: 28–36 px desktop; 24–30 px mobile.
- Section heading: 20–24 px.
- Card heading: 15–18 px.
- Body: 14–16 px, with 1.5–1.7 line height.
- Metadata: 12–13 px, only for secondary information.
- Code/math: a readable monospace font where appropriate.

Do not reduce body text to tiny dashboard-style labels just to match the screenshot. Reading and tutoring are primary use cases.

### 4.3 Spacing and layout

Use a consistent 4 px base spacing scale.

- Landing content maximum width: 1120–1200 px.
- Main application content maximum width: 1440 px.
- Desktop workspace: fixed or collapsible left navigation, flexible central workspace, optional right context panel.
- Mobile: single-column flow; navigation becomes a drawer or bottom navigation where appropriate.
- Standard card padding: 16–24 px.
- Section spacing on landing page: 72–112 px desktop; 48–72 px mobile.
- Use generous whitespace around learning content; avoid squeezing text into overly narrow cards.

### 4.4 Shape, borders, and elevation

- Main cards: 12–16 px radius.
- Buttons and inputs: 8–12 px radius.
- Pills and small status labels: fully rounded only where they communicate a state.
- Use thin borders and subtle surface differences as the primary separation method.
- Shadows should be soft and limited. Violet glow is reserved for the hero preview, primary CTA focus, and a small number of active states.
- Do not give every panel a bright glow or glass effect.

## 5. Core Experience and Information Architecture

### 5.1 Landing page

The landing page should follow the reference's long-form product-story structure, reinterpreted for EduMentor:

1. **Navigation** — EduMentor wordmark, How it works, Features, Privacy, FAQ, and a clear Start learning action.
2. **Hero** — concise headline, supporting copy, primary and secondary CTAs.
3. **Product preview** — an authentic screenshot or built UI preview showing the learning workspace.
4. **How it works** — three steps: Import notes → Understand concepts → Practise and review.
5. **Learning capabilities** — concept map, Socratic tutor, grounded recall, answer feedback, spaced repetition, and progress history.
6. **Study loop** — visual explanation of how a weak answer returns to a prerequisite or teaching step.
7. **Progress preview** — example metrics such as concepts reviewed or review queue, clearly labelled as sample data if not live.
8. **Privacy section** — explain local browser storage and AI requests in plain language.
9. **FAQ** — data storage, supported file types, AI limitations, backups, and browser/device transfer.
10. **Final CTA and footer** — Start learning, privacy notes, help, and product links.

Do not add pricing, customer logos, testimonials, or numerical performance claims unless the product genuinely has them and they can be substantiated.

### 5.2 Application workspace

The workspace is the main product, not the landing page. It should feel like a focused learning studio.

**Desktop layout:**

- Left sidebar: Home, My materials, Learning paths, Tutor, Review queue, Progress, Settings.
- Main area: current task or selected learning view.
- Optional right rail: current concept, prerequisites, mastery status, or next review.
- A compact top bar: current course/material, search or quick actions, and local-save status.

**Mobile layout:**

- Single main column.
- Sidebar items move into a drawer or compact navigation.
- Right-rail information becomes collapsible panels.
- Concept graph supports pan/zoom and has an accessible list alternative.
- Tutor composer remains easy to reach without obscuring the conversation.

### 5.3 Primary screens

#### A. Home / Study dashboard

- Greeting and “Continue learning” card.
- Recent materials and learning paths.
- Due review count and next recommended action.
- Progress summary with plain labels.
- Empty state that invites the user to import their first document.

#### B. Import material

- Drag-and-drop zone and file picker.
- Supported format list based on actual implementation.
- Upload/processing progress and clear failure states.
- Extracted text preview before analysis.
- Explain that analysis may send relevant text to Gemini through the server route.
- Never imply that files are uploaded to a permanent cloud library when storage is browser-local.

#### C. Concept map and learning path

- Interactive directed graph showing concepts and prerequisite relationships.
- Nodes use clear state distinctions: not started, learning, needs review, mastered.
- Use shape, icon, or text labels in addition to colour.
- Clicking a node opens concept details, prerequisites, and a “Learn this concept” action.
- Provide a list/tree view for keyboard and screen-reader access.

#### D. AI tutor

- Conversation area with readable message width.
- Tutor messages and learner responses use distinct but subdued surfaces.
- Keep source-grounding and current concept visible.
- Show one question or teaching step at a time when the learning flow calls for it.
- Composer supports keyboard submission, multiline input, and clear loading/error states.
- Do not visually imitate a generic customer support chat; this is a guided learning session.

#### E. Recall and answer evaluation

- One focused question per screen or card.
- Answer input with a clear submit action.
- Optional confidence rating, phrased in simple language.
- Feedback explains what was correct, what is missing, and what to revisit.
- Avoid displaying a numeric grade without an explanation.
- Clearly distinguish AI-generated feedback from definitive factual verification.

#### F. Review queue

- Due concepts grouped by due status.
- A simple “Start review” primary action.
- After a response, show feedback and the next scheduled review in human-readable terms.
- If a weak answer is detected, offer a short refresher and prerequisite link instead of simply marking the answer wrong.

#### G. Progress and history

- Show mastery by concept, review history, streak or consistency only if genuinely implemented, and recent learning sessions.
- Use charts sparingly and label axes clearly.
- Include a way to inspect or delete local history.
- Do not use fabricated statistics to fill empty dashboards.

#### H. Settings and data management

- Local data status and last-save indication.
- Export backup and import/restore controls.
- Clear explanation of what stays in IndexedDB and what is sent to Gemini.
- Clear all local data action with confirmation.
- Model/settings controls only for options actually supported by the app.

## 6. Component Design

### 6.1 Navigation

- Wordmark on the landing page and a compact version in the app sidebar.
- Active item uses a violet-tinted surface and a clear indicator.
- Icons are paired with labels; do not rely on icons alone.
- Sidebar can collapse on desktop, but the collapsed state must remain understandable.

### 6.2 Buttons

- **Primary:** violet fill, high contrast, concise verb-led label.
- **Secondary:** transparent or raised surface with border.
- **Tertiary:** text action for low-priority actions.
- **Destructive:** reserved for delete/clear operations and paired with confirmation.
- All buttons require hover, focus-visible, disabled, loading, and pressed states.

Examples: `Start learning`, `Import notes`, `Continue lesson`, `Check answer`, `Start review`, `Export backup`.

### 6.3 Cards

Use cards to group related decisions, not to wrap every paragraph.

- Learning path card: title, progress, next action.
- Material card: filename, processing status, concept count when available.
- Concept card: concept name, mastery state, prerequisite indicator.
- Review card: concept, due label, estimated effort only if calculated.
- Progress card: one meaningful metric with a clear definition.

### 6.4 Status badges

Use subdued badges for:

- Not started
- In progress
- Needs review
- Mastered
- Due today
- Saved locally
- Processing / Failed

Pair colour with a label or icon. Never communicate mastery, errors, or due status through colour alone.

### 6.5 Forms and inputs

- Labels remain visible above or beside fields.
- Use concise helper text and specific validation messages.
- Provide keyboard-accessible file selection.
- Keep answer input spacious and comfortable for longer explanations.
- Do not clear user input after a failed network request.

### 6.6 Dialogs and toasts

Use dialogs for destructive actions and important restore confirmations. Use toasts for lightweight confirmations such as “Backup exported.” Error messages should stay visible when the user needs to act on them; do not communicate important errors only through a disappearing toast.

### 6.7 Graph and data visualisation

- Use the violet/blue accent palette with neutral inactive nodes.
- Make selected and focused nodes visually distinct.
- Use labels, legends, and an accessible alternative to graph-only navigation.
- Avoid over-animating graph edges or progress charts.
- If no data exists, show a useful empty state rather than a blank chart.

## 7. Interaction and Motion

Motion should clarify cause and effect, not decorate the experience.

- Short transitions: approximately 140–220 ms for hover, focus, and panel changes.
- Use subtle fade/translate for opening panels and dialogs.
- Respect `prefers-reduced-motion`.
- Avoid continuous background animation in the study workspace.
- Do not delay navigation or submission behind decorative animations.
- Provide clear loading states during document analysis, Gemini responses, and import/export.

### Key interaction rules

1. A primary action should have one obvious outcome.
2. Preserve work if a request fails.
3. Make local-save behaviour visible without repeatedly interrupting the learner.
4. Confirm destructive operations.
5. Keep the current concept and learning step visible during tutoring.
6. Provide a recovery path for interrupted sessions and invalid backups.

## 8. States and Feedback

Every important view must have designed states for:

- Initial / empty
- Loading / processing
- Success
- Partial success
- Recoverable error
- Unrecoverable error
- Offline or Gemini unavailable
- No due reviews
- No search results
- Unsupported or corrupted file
- Invalid backup
- Local storage unavailable or quota exceeded

### Example microcopy

- **Empty materials:** “Your learning space starts here. Import a set of notes to build your first learning path.”
- **Processing:** “Reading your material and identifying concepts…”
- **Saved:** “Saved on this device.”
- **AI unavailable:** “The tutor couldn’t connect right now. Your saved learning data is still available.”
- **Storage warning:** “This browser is running low on space. Export a backup before continuing.”
- **No reviews due:** “You’re up to date. You can continue learning or revisit any concept.”
- **Weak answer:** “Let’s strengthen one idea first. Review this prerequisite, then try again.”

These are suggested strings; implementation may refine them while preserving their meaning.

## 9. Responsive Behaviour

### Breakpoints

Use the project's standard Tailwind breakpoints unless the implementation demonstrates a need to adjust them.

- **Small mobile:** below 640 px — single column, compact header, full-width primary actions.
- **Tablet:** 640–1023 px — flexible panels, collapsible navigation, simplified graph controls.
- **Desktop:** 1024 px and above — full workspace layout with sidebar and optional context rail.
- **Wide desktop:** 1280 px and above — cap content width; do not stretch reading text across the entire screen.

### Mobile requirements

- No horizontal page scrolling.
- Tap targets ideally at least 44 × 44 px.
- Buttons stack when side-by-side actions become cramped.
- Long concept names and filenames wrap safely.
- Graphs provide zoom and a list alternative.
- Tutor input remains visible and usable with the virtual keyboard.
- Tables and charts have compact or stacked alternatives.

## 10. Accessibility

Target WCAG 2.2 AA where practical.

- Check text and interactive-element contrast, particularly muted text on navy surfaces.
- Full keyboard access with visible focus rings.
- Semantic heading order and landmarks.
- Correct labels and accessible names for icon buttons.
- Screen-reader announcements for processing, success, and errors.
- Reduced-motion support.
- Do not use colour as the only signal for mastery, confidence, or errors.
- Maintain zoom and text resizing without clipped content.
- Provide accessible alternatives for concept graphs and charts.
- Ensure focus returns to the triggering control after closing a dialog.

## 11. Privacy and Trust UI

EduMentor is designed around browser-local persistence without accounts or an external application database. The design must explain this honestly.

- Show a small “Saved on this device” indicator when local persistence succeeds.
- Provide export/import backup controls in a visible data-management location.
- Explain that clearing browser site data can erase learning history.
- Explain that local data does not automatically sync between devices.
- Explain that relevant text or prompts may be sent to Gemini through the server when AI features are used.
- Never expose the Gemini API key in the client UI or browser bundle.
- Do not display a “private” badge that implies no data ever leaves the device; explain the boundary accurately.
- Confirm before deleting all local data, and offer a backup first.

## 12. Landing Page Copy and Section Details

### Navigation

**EduMentor**  
Links: How it works · Learning tools · Privacy · FAQ  
CTA: Start learning

### Hero

**Learn deeply. Remember longer.**  
Turn your notes into a guided learning path with an AI tutor, grounded practice questions, and smart review sessions.

Actions: **Start learning** / **See how it works**

Hero preview: a real or accurately mocked application view. If mocked, use clearly identified sample material and avoid fake user metrics.

### How it works

1. **Bring your notes** — import supported study material.
2. **Build understanding** — explore concepts and prerequisites with guided teaching.
3. **Practise and revisit** — answer recall questions and review concepts when due.

### Learning tools

- **Concept mapping** — see how ideas connect.
- **Socratic tutoring** — learn through guided questions and explanations.
- **Grounded recall** — practise from your uploaded material.
- **Answer feedback** — understand gaps, not just a score.
- **Spaced repetition** — revisit concepts on a schedule.
- **Progress history** — see what is improving and what needs attention.

### Privacy section

**Your study space, on your device.**  
Your learning history is stored in this browser. AI features send relevant requests to the configured Gemini service. Export a backup when you want to move or protect your data.

### FAQ topics

- Which file types can I import?
- Where is my learning history stored?
- Will my progress sync to another device?
- What happens if the AI service is unavailable?
- Can I export or delete my data?
- How does spaced repetition work?
- Can AI feedback make mistakes?

## 13. Design-to-Implementation Mapping

| Design requirement            | Implementation guidance                                    |
| ----------------------------- | ---------------------------------------------------------- |
| Dark navy/violet theme        | Centralised CSS variables / Tailwind theme tokens          |
| Reusable cards and buttons    | Shared UI components with consistent variants              |
| Responsive workspace          | CSS grid/flex layouts and mobile navigation                |
| Accessible graph              | Graph view plus semantic list/tree alternative             |
| Loading and error states      | Explicit request-state components                          |
| Local-save status             | Read persistence status from IndexedDB repository layer    |
| Backup and restore            | Dedicated settings/data-management flow                    |
| Reduced motion                | CSS media query and motion preference support              |
| Real product preview          | Reuse actual workspace components where possible           |
| Landing/workspace consistency | Shared tokens and typography; different density by context |

The implementation should use the chosen stack in `TECH_STACK.md` and obey `PRD.md`. This document defines presentation and interaction guidance; it does not override product requirements or claim that features already exist.

## 14. Design Acceptance Checklist

### Visual consistency

- [ ] The dark navy base, restrained violet accents, and thin borders are consistent.
- [ ] The landing page has a strong hero and an authentic product preview.
- [ ] Cards have consistent radius, spacing, typography, and interaction states.
- [ ] The workspace is calmer and more readable than the marketing landing page.
- [ ] No unsupported testimonials, customer logos, pricing, or metrics appear.

### Learning usability

- [ ] The current learning concept and next action are clear.
- [ ] Tutor messages, questions, answers, and feedback are easy to distinguish.
- [ ] Recall evaluation explains the result rather than showing only a score.
- [ ] Due reviews are discoverable and actionable.
- [ ] Weak answers offer a constructive next step.

### Responsive and accessible

- [ ] Layout works at mobile, tablet, and desktop widths.
- [ ] Keyboard focus is visible and keyboard navigation is complete.
- [ ] Essential status is not conveyed by colour alone.
- [ ] Text remains readable at browser zoom.
- [ ] Reduced-motion preferences are respected.
- [ ] Concept maps have an accessible alternative.

### Privacy and reliability

- [ ] Local persistence status is communicated accurately.
- [ ] Backup export/import is discoverable.
- [ ] Destructive data actions require confirmation.
- [ ] AI request and local storage boundaries are explained.
- [ ] Loading, network failure, invalid-file, and storage-error states are designed.

## 15. Final Direction

Use the supplied image as inspiration for **atmosphere, section hierarchy, card treatment, and restrained violet emphasis**. Do not reproduce its creator-tool wording, metrics, pricing, or layout literally. EduMentor's visual identity should be recognisably related in mood while remaining purpose-built for reading, guided learning, recall practice, and long-term mastery.
