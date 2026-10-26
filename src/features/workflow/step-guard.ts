import { type StorageRepositories } from '@/lib/db/repositories/types';
import { type WorkflowStep } from './types';

export interface StepAccessResult {
  allowed: boolean;
  effectiveStep: WorkflowStep;
  effectiveRoute: string;
  reason?: string;
}

/**
 * Derives the highest valid workflow step for a given material based on real persisted records.
 * Rules:
 * 1. Missing material -> Step 1 (/learn/new)
 * 2. Material processing not COMPLETE -> Step 2 (/learn/[materialId]/organise)
 * 3. Material COMPLETE and active session exists -> Step 4 (/learn/[materialId]/session/[sessionId])
 * 4. Material COMPLETE with no active session -> Step 3 (/learn/[materialId]/mode)
 */
export async function deriveStepForMaterial(
  materialId: string | undefined | null,
  repos: StorageRepositories,
): Promise<{ step: WorkflowStep; route: string; reason?: string; sessionId?: string }> {
  if (!materialId || materialId.trim() === '' || materialId === 'new') {
    return {
      step: 1,
      route: '/learn/new',
      reason: 'No study material selected.',
    };
  }

  const material = await repos.documents.get(materialId);
  if (!material) {
    return {
      step: 1,
      route: '/learn/new',
      reason: `Material "${materialId}" was not found.`,
    };
  }

  const proc = await repos.processing.getByMaterial(materialId);

  // If processing is not complete, step 2 is the furthest allowed step
  if (!proc || proc.stage !== 'COMPLETE') {
    const reason =
      proc?.stage === 'FAILED'
        ? `Analysis failed at ${proc.failedStage || 'ANALYZING'}: ${proc.errorMessage || 'Please retry analysis.'}`
        : 'Material processing is currently in progress.';
    return {
      step: 2,
      route: `/learn/${materialId}/organise`,
      reason,
    };
  }

  // Processing is COMPLETE: check if there is an active session
  const wfState = await repos.workflowState.getByMaterial(materialId);
  if (wfState?.lastSessionId) {
    const session = await repos.sessions.get(wfState.lastSessionId);
    if (session && !session.endedAt) {
      return {
        step: 4,
        route: `/learn/${materialId}/session/${session.id}`,
        sessionId: session.id,
        reason: 'Resuming active study session.',
      };
    }
  }

  return {
    step: 3,
    route: `/learn/${materialId}/mode`,
    reason: 'Material is ready for mode selection.',
  };
}

/**
 * Step Guard: Validates whether a user can access a requested workflow step.
 * Invalid deep links redirect to the nearest valid step with an honest plain explanation.
 */
export async function validateStepAccess(
  materialId: string | undefined | null,
  requestedStep: WorkflowStep,
  repos: StorageRepositories,
  sessionId?: string,
): Promise<StepAccessResult> {
  // Step 1 is always accessible
  if (requestedStep === 1) {
    return {
      allowed: true,
      effectiveStep: 1,
      effectiveRoute: '/learn/new',
    };
  }

  // Steps 2, 3, 4 require material to exist
  if (!materialId || materialId.trim() === '' || materialId === 'new') {
    return {
      allowed: false,
      effectiveStep: 1,
      effectiveRoute: '/learn/new',
      reason: 'Please choose or add a study document first.',
    };
  }

  const material = await repos.documents.get(materialId);
  if (!material) {
    return {
      allowed: false,
      effectiveStep: 1,
      effectiveRoute: '/learn/new',
      reason: `Document "${materialId}" does not exist in local storage.`,
    };
  }

  const proc = await repos.processing.getByMaterial(materialId);

  // Step 2 (Organise) requires saved material
  if (requestedStep === 2) {
    return {
      allowed: true,
      effectiveStep: 2,
      effectiveRoute: `/learn/${materialId}/organise`,
    };
  }

  // Step 3 (Choose Mode) requires COMPLETE processing (or saved chunks)
  if (requestedStep === 3) {
    if (!proc || proc.stage !== 'COMPLETE') {
      return {
        allowed: false,
        effectiveStep: 2,
        effectiveRoute: `/learn/${materialId}/organise`,
        reason:
          proc?.stage === 'FAILED'
            ? 'Analysis failed. Please retry before choosing a learning mode.'
            : 'Analysis must be completed before choosing a learning mode.',
      };
    }

    return {
      allowed: true,
      effectiveStep: 3,
      effectiveRoute: `/learn/${materialId}/mode`,
    };
  }

  // Step 4 (Session Host) requires COMPLETE processing and valid session
  if (requestedStep === 4) {
    if (!proc || proc.stage !== 'COMPLETE') {
      return {
        allowed: false,
        effectiveStep: 2,
        effectiveRoute: `/learn/${materialId}/organise`,
        reason: 'Material must be processed before launching a session.',
      };
    }

    if (!sessionId) {
      return {
        allowed: false,
        effectiveStep: 3,
        effectiveRoute: `/learn/${materialId}/mode`,
        reason: 'No learning mode or session selected. Please choose a mode first.',
      };
    }

    const session = await repos.sessions.get(sessionId);
    if (!session || session.materialId !== materialId) {
      return {
        allowed: false,
        effectiveStep: 3,
        effectiveRoute: `/learn/${materialId}/mode`,
        reason: 'The specified session is invalid or has ended. Please choose a mode to start a new session.',
      };
    }

    return {
      allowed: true,
      effectiveStep: 4,
      effectiveRoute: `/learn/${materialId}/session/${sessionId}`,
    };
  }

  return {
    allowed: false,
    effectiveStep: 1,
    effectiveRoute: '/learn/new',
    reason: 'Unknown step requested.',
  };
}
