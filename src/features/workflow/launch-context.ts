import { type StorageRepositories } from '@/lib/db/repositories/types';
import {
  type LearningLaunchContext,
  type LearningMode,
  type WorkflowSelection,
  type WorkflowStep,
} from './types';
import { nowISO } from '@/lib/utils/clock';

export interface LaunchValidationResult {
  valid: boolean;
  context?: LearningLaunchContext;
  reason?: string;
  redirectStep?: WorkflowStep;
  redirectRoute?: string;
}

/**
 * Validate a candidate launch context at the boundary against real persisted records.
 * Ensures:
 * 1. Material exists in database.
 * 2. Mode is one of 'study' | 'recall' | 'revision'.
 * 3. If selection specifies unitIds, every unit exists and belongs to this material.
 * 4. Invalid context redirects to the nearest valid step.
 */
export async function validateLaunchContext(
  candidate: unknown,
  repos: StorageRepositories,
): Promise<LaunchValidationResult> {
  if (!candidate || typeof candidate !== 'object') {
    return {
      valid: false,
      reason: 'Launch context must be a non-null object.',
      redirectStep: 1,
      redirectRoute: '/learn/new',
    };
  }

  const raw = candidate as Partial<LearningLaunchContext>;

  // 1. Validate materialId
  if (!raw.materialId || typeof raw.materialId !== 'string' || raw.materialId.trim().length === 0) {
    return {
      valid: false,
      reason: 'A valid material identifier is required.',
      redirectStep: 1,
      redirectRoute: '/learn/new',
    };
  }

  const material = await repos.documents.get(raw.materialId);
  if (!material) {
    return {
      valid: false,
      reason: `Study material "${raw.materialId}" was not found in your library.`,
      redirectStep: 1,
      redirectRoute: '/learn/new',
    };
  }

  // 2. Validate Mode
  const allowedModes: readonly LearningMode[] = ['study', 'recall', 'revision'];
  if (!raw.mode || !allowedModes.includes(raw.mode as LearningMode)) {
    return {
      valid: false,
      reason: `Invalid learning mode "${String(raw.mode)}". Must be study, recall, or revision.`,
      redirectStep: 3,
      redirectRoute: `/learn/${raw.materialId}/mode`,
    };
  }

  // 3. Validate Selection
  const rawSel = raw.selection;
  if (!rawSel || typeof rawSel !== 'object' || !('kind' in rawSel)) {
    return {
      valid: false,
      reason: 'Selection specification is missing or malformed.',
      redirectStep: 2,
      redirectRoute: `/learn/${raw.materialId}/organise`,
    };
  }

  let selection: WorkflowSelection;
  if (rawSel.kind === 'WHOLE_MATERIAL') {
    selection = { kind: 'WHOLE_MATERIAL' };
  } else if (rawSel.kind === 'UNITS') {
    if (!Array.isArray(rawSel.unitIds) || rawSel.unitIds.length === 0) {
      return {
        valid: false,
        reason: 'At least one learning unit must be selected.',
        redirectStep: 2,
        redirectRoute: `/learn/${raw.materialId}/organise`,
      };
    }

    const materialUnits = await repos.learningUnits.listByMaterial(raw.materialId);
    const validUnitIds = new Set(materialUnits.map((u) => u.id));

    const invalidUnitIds = rawSel.unitIds.filter((id) => !validUnitIds.has(id));
    if (invalidUnitIds.length > 0) {
      return {
        valid: false,
        reason: `Selected units [${invalidUnitIds.join(', ')}] do not belong to material "${material.filename}".`,
        redirectStep: 2,
        redirectRoute: `/learn/${raw.materialId}/organise`,
      };
    }

    selection = { kind: 'UNITS', unitIds: [...rawSel.unitIds] };
  } else {
    return {
      valid: false,
      reason: `Unknown selection kind "${String((rawSel as { kind?: unknown }).kind)}".`,
      redirectStep: 2,
      redirectRoute: `/learn/${raw.materialId}/organise`,
    };
  }

  // 4. Validate sessionId if provided
  let sessionId: string | undefined = undefined;
  if (raw.sessionId && typeof raw.sessionId === 'string' && raw.sessionId.trim().length > 0) {
    const session = await repos.sessions.get(raw.sessionId);
    if (session && session.materialId === raw.materialId) {
      sessionId = raw.sessionId;
    }
  }

  const context: LearningLaunchContext = {
    materialId: raw.materialId,
    selection,
    mode: raw.mode as LearningMode,
    ...(sessionId ? { sessionId } : {}),
  };

  return {
    valid: true,
    context,
  };
}

/**
 * Persists the user's active workflow preference to IndexedDB.
 */
export async function persistWorkflowPreference(
  materialId: string,
  selection: WorkflowSelection,
  mode?: LearningMode,
  sessionId?: string,
  repos?: StorageRepositories,
): Promise<void> {
  if (!repos) return;

  const existing = await repos.workflowState.getByMaterial(materialId);
  await repos.workflowState.put({
    id: materialId,
    materialId,
    selection,
    lastChosenMode: mode ?? existing?.lastChosenMode,
    lastSessionId: sessionId ?? existing?.lastSessionId,
    updatedAt: nowISO(),
  });
}
