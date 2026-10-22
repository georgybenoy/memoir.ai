# DIFFICULTY.md — Adaptive Recall Difficulty Model

Source of Truth: `PRD.md` FR-07; `TECH_STACK.md` §9.3.

---

## 1. Mathematical Formulation

To ensure active-recall questions challenge learners without presenting unanswerable cognitive hurdles, difficulty $D \in [0, 1]$ is computed from four normalized pedagogical signals:

$$D_{\text{raw}} = W_{\text{DAG}} \cdot T_{\text{DAG}} + W_{\text{mastery}} \cdot T_{\text{mastery}} + W_{\text{quality}} \cdot T_{\text{quality}} + W_{\text{attempts}} \cdot T_{\text{attempts}} + \Delta_{\text{pref}}$$

$$D = \operatorname{clamp}(D_{\text{raw}}, 0, 1)$$

### Weights

Configured in `src/lib/config/difficulty.ts`:
- $W_{\text{DAG}} = 0.35$ (Concept DAG downstream reach / graph centrality)
- $W_{\text{mastery}} = 0.25$ (Current session mastery proportion)
- $W_{\text{quality}} = 0.25$ (Inverted previous SM-2 quality grade)
- $W_{\text{attempts}} = 0.15$ (Repetition depth)

$$\sum W = 0.35 + 0.25 + 0.25 + 0.15 = 1.00$$

---

## 2. Term Normalization to $[0, 1]$

Each term is strictly normalized to $[0, 1]$ prior to linear combination:

1. **$T_{\text{DAG}}$ (Downstream Influence)**:
   - Computed in Phase 5 from transitive descendant reach:
     $$T_{\text{DAG}} = \frac{|\operatorname{descendants}(c)|}{N - 1} \in [0, 1]$$
   - Foundational concepts with extensive dependents (e.g. Variables before Conditionals) yield higher graph centrality.

2. **$T_{\text{mastery}}$ (Session Mastery Rate)**:
   - Proportion of evaluated concepts in the current session meeting mastery criteria ($q \ge 3$):
     $$T_{\text{mastery}} = \frac{N_{\text{mastered}}}{N_{\text{attempted}}}$$
   - When no concepts have been evaluated in the session, a neutral baseline of **$0.50$** is used.

3. **$T_{\text{quality}}$ (Inverted Previous Quality)**:
   - Normalized inverse of the previous attempt's SM-2 grade $q_{\text{prev}} \in [0, 5]$:
     $$T_{\text{quality}} = \frac{5 - q_{\text{prev}}}{5} \in [0, 1]$$
   - If the student has not attempted this concept yet, a neutral baseline of **$0.50$** is used.

4. **$T_{\text{attempts}}$ (Logarithmic Attempt Scale)**:
   - Uses sub-linear diminishing growth:
     $$T_{\text{attempts}} = \min\left(1, \frac{\log_2(n_{\text{attempts}} + 1)}{\log_2(N_{\text{max}} + 1)}\right)$$
   - Default $N_{\text{max}} = 7$, yielding $\log_2(8) = 3$.
   - $n = 0 \implies 0.0$
   - $n = 1 \implies 0.333$
   - $n = 3 \implies 0.667$
   - $n \ge 7 \implies 1.000$

5. **$\Delta_{\text{pref}}$ (User Preference Offset)**:
   - Read from `workspacePreferences.difficulty`:
     - `beginner`: $-0.15$
     - `intermediate`: $0.00$
     - `advanced`: $+0.15$

---

## 3. Difficulty Level Bands

$D \in [0, 1]$ maps deterministically to 5 cognitive depth tiers:

| Level | Name | Score Range | Focus & Question Prompt Characteristics |
|---|---|---|---|
| **1** | Elementary | $0.00 \le D < 0.20$ | Foundational recall of key terms and explicit canonical definitions. |
| **2** | Foundational | $0.20 \le D < 0.40$ | Direct relationships, basic mechanism comprehension. |
| **3** | Intermediate | $0.40 \le D < 0.60$ | Procedural application to practical scenarios, process ordering. |
| **4** | Advanced | $0.60 \le D < 0.80$ | Comparative analysis, cause-and-effect reasoning across concepts. |
| **5** | Mastery | $0.80 \le D \le 1.00$ | Edge cases, system synthesis, subtle misconception diagnosis. |

---

## 4. Single-Step Rise Guard

To prevent rapid, demotivating spikes in question difficulty between attempts:

$$\text{effectiveLevel} = \min(\text{computedLevel}, \text{previousLevel} + 1)$$

If a student was previously evaluated at Level 2, their subsequent question level cannot exceed **Level 3**, even if their downstream influence or session mastery suddenly increases. Difficulty decreases immediately upon lower scores to provide targeted scaffolding.
