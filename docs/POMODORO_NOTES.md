# Pomodoro Timer Implementation Notes

## Inspection & Architecture Findings (Part 0)

1. **Session Header Layout**:
   - Component: `src/components/session/SessionHeader.tsx` inside `Step4SessionHost`.
   - Desktop: Flex row with breadcrumbs & title on left; session controls (`Finish`, `Pause`, `Exit`) on right.
   - Global theme toggle & app navigation sit in the top application navbar; the session header handles in-session controls.
2. **Mounting Position**:
   - The `PomodoroCapsule` mounts in the top-right cluster of `SessionHeader.tsx`, immediately to the left of the `Finish` / `Pause` / `Exit` actions.
3. **Mobile Reflow Strategy**:
   - On screens < 640px, the header wraps to a vertical stack.
   - The capsule collapses to show only the phase dot/icon and `MM:SS` digits (phase text label preserved for assistive technology via `sr-only`).
   - Material name and breadcrumbs truncate (`truncate max-w-[120px] sm:max-w-[200px]`) ensuring zero horizontal overflow and no overlap with session controls or composer.
   - Touch targets are preserved at >= 44×44px.
4. **Design Tokens & Themes**:
   - Primary violet: `var(--primary)` (#7c3aed dark, #6d28d9 light), `--primary-hover`.
   - Surfaces & Borders: `var(--surface)` / `var(--surface-raised)` with `var(--border-color)`.
   - Contrast: Contrast ratios for text on surfaces exceed 4.5:1 in both dark and light modes.
5. **Primitives & Dependencies**:
   - Popover: Accessible anchored popover with keyboard navigation (Esc to close and return focus to capsule, focus trap, outside click detection).
   - Clock: Time queries strictly use injectable `nowEpochMs()` from `src/lib/utils/clock.ts`.
   - Toast & Live Region: Non-blocking in-app toasts via `useWorkspaceStore.addToast` and polite `aria-live` announcements. Zero modal interruptions.
6. **Independence & Persistence Policy**:
   - Pure UI utility stored in `localStorage` under `edumentor.pomodoro.v1` with Zod validation.
   - Zero interaction with IndexedDB, state machines, tutor conversation, SM-2, or mastery.
   - Honest user-facing wording: *"Time is tracked by your device clock. You'll only get an alert while EduMentor is open."*
