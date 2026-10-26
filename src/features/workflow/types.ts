/**
 * Workflow Feature Types (Phase R3)
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, and Phase R3 specification.
 */

export type LearningMode = 'study' | 'recall' | 'revision';

export type WorkflowSelection =
  | { kind: 'WHOLE_MATERIAL' }
  | { kind: 'UNITS'; unitIds: string[] };

/**
 * Launch Contract: Scoped boundary contract between the workflow shell
 * and Step 4 active session host.
 */
export interface LearningLaunchContext {
  materialId: string;
  selection: WorkflowSelection;
  mode: LearningMode;
  sessionId?: string;
}

export type WorkflowStep = 1 | 2 | 3 | 4;

export interface WorkflowStepInfo {
  step: WorkflowStep;
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  routeTemplate: (materialId?: string, sessionId?: string) => string;
}

export const WORKFLOW_STEPS: readonly WorkflowStepInfo[] = [
  {
    step: 1,
    id: 'add',
    title: 'Add Study Material',
    shortTitle: 'Add Material',
    description: 'Import lecture notes, readings, or slides in PDF, Markdown, or text format.',
    routeTemplate: () => '/learn/new',
  },
  {
    step: 2,
    id: 'organise',
    title: 'Organise & Review Units',
    shortTitle: 'Organise Units',
    description: 'Inspect structured learning units, verify concept prerequisites, and choose what to study.',
    routeTemplate: (materialId) => (materialId ? `/learn/${materialId}/organise` : '/learn/new'),
  },
  {
    step: 3,
    id: 'mode',
    title: 'Choose Learning Mode',
    shortTitle: 'Choose Mode',
    description: 'Select Socratic study, active recall practice, or spaced revision based on real readiness.',
    routeTemplate: (materialId) => (materialId ? `/learn/${materialId}/mode` : '/learn/new'),
  },
  {
    step: 4,
    id: 'session',
    title: 'Active Learning Session',
    shortTitle: 'Study Session',
    description: 'Engage with your material through interactive tutoring, retrieval practice, or review.',
    routeTemplate: (materialId, sessionId) =>
      materialId && sessionId
        ? `/learn/${materialId}/session/${sessionId}`
        : materialId
          ? `/learn/${materialId}/mode`
          : '/learn/new',
  },
] as const;
