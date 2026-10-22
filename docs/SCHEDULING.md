# Spaced Repetition Scheduling Specification (SM-2)

This document defines the mathematical and temporal semantics of EduMentor's local spaced repetition engine.

---

## 1. Algorithm Overview

EduMentor implements the SuperMemo-2 (SM-2) algorithm adapted for client-side execution in IndexedDB.

### State Fields
On each concept, the spaced repetition record (`SpacedRepetitionStateRecord`) tracks:
- `repetitions` (integer $\ge 0$): Consecutive successful recall attempts ($q \ge 3$).
- `easinessFactor` (float $\ge 1.30$, initial $2.50$): Concept-specific difficulty multiplier.
- `intervalDays` (integer $\ge 1$): Days until next scheduled review.
- `lastReviewedAt` (ISO UTC string): Timestamp of the most recent evaluation.
- `nextDueAt` (ISO UTC string): Local start-of-day instant when the concept becomes due.
- `lastQuality` (integer $0..5$): Quality grade from the last evaluation.
- `weak` (boolean): Flagged `true` when $q < 3$ to trigger the revision loop.

---

## 2. Transition Rules

### Passing Recall ($q \ge 3$)
When an active recall attempt meets or exceeds the quality threshold ($q \ge 3$):
1. **Repetitions Increment**:
   - $0 \rightarrow 1$: `intervalDays = 1`
   - $1 \rightarrow 2$: `intervalDays = 6`
   - $n \ge 2$: `intervalDays = round(previousInterval * EF)` (minimum 1 day)
2. **Easiness Factor Update**:
   $$EF' = EF + (0.1 - (5 - q) \cdot (0.08 + (5 - q) \cdot 0.02))$$
   - $EF'$ is rounded to 2 decimal places and bounded below by a hard floor of $1.30$.
   - A score of $q = 5$ increases $EF$ by $+0.10$.
   - A score of $q = 4$ leaves $EF$ unchanged ($\Delta = 0.00$).
   - A score of $q = 3$ decreases $EF$ by $-0.14$.
3. **Weak Flag**: Set to `false`.

### Failing Recall ($q < 3$)
When an active recall attempt receives $q < 3$ (grades 0, 1, or 2):
1. **Repetitions Reset**: `repetitions = 0`.
2. **Interval Reset**: `intervalDays = 1` (scheduled for immediate next-day review).
3. **Weak Concept Flag**: `weak = true`.
4. **Easiness Factor**: Left unchanged by default (`updateEfOnFailure = false`). Per `docs/DECISIONS.md`, an isolated recall failure should not permanently degrade the long-term easiness factor of an established concept unless explicitly configured.

---

## 3. Due-Date Semantics & Timezone Handling

### Start-of-Day Anchor
Reviews should feel natural to a human student rather than triggering at arbitrary seconds or midnight UTC.
- `nextDueAt` is calculated as the **local start-of-day (00:00:00 local time)** of the student's device on `reviewDate + intervalDays`.
- The timestamp is converted and stored as an unambiguous **ISO UTC instant** (e.g., `2026-10-23T04:00:00.000Z` for midnight EDT in `America/New_York`).
- An item is due whenever `currentInstant >= nextDueAt`.

### DST Resilience
Because `nextDueAt` anchors to local `00:00:00` in the IANA timezone:
- **Spring Forward**: 23-hour days converge cleanly to the local start of day without lost hours.
- **Fall Back**: 25-hour days resolve to local midnight without ambiguous UTC offsets.

### Timezone Shifts
Because due dates are persisted as UTC instants:
- If a student travels from Tokyo (UTC+9) to London (UTC+0), the due date remains a stable monotonic timeline instant.

### Clock Skew & Backwards Device Clocks
If the client device clock is manually moved backwards or resets:
- The engine checks whether `now() < lastReviewedAt`.
- If clock skew is detected, the review is anchored to the device's current date, preventing negative intervals, and a diagnostic note is attached.

---

## 4. Early Review Semantics

Students are free to practice and review concepts at any time before `nextDueAt` without penalty:
- When a concept is reviewed early with a passing score ($q \ge 3$), the next review date is calculated forward from today, ensuring that intervals never shrink or pull the schedule backward.
- If an early review fails ($q < 3$), the concept is flagged as `weak = true` and reset to a 1-day interval so it can be revised promptly.

---

## 5. Non-Scientific Validation Disclaimer

Spaced repetition parameters and intervals in EduMentor are algorithmic heuristics derived from the 1987 SuperMemo-2 heuristic model. They are intended as organizational aids for self-directed personal study. EduMentor makes no claim of clinical memory improvement, medical efficacy, or guaranteed retention rates.
