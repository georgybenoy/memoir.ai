/**
 * Shared Learning Session Controller Domain & Hook Re-exports
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, PRD §4
 */

import { type LearningMode } from '@/features/workflow/types';
import { type ModeModule } from './types';
import { studyMode } from './study-mode';
import { recallMode } from './recall-mode';
import { revisionMode } from './revision-mode';

export function getModeModule(mode: LearningMode): ModeModule {
  switch (mode) {
    case 'study':
      return studyMode;
    case 'recall':
      return recallMode;
    case 'revision':
      return revisionMode;
    default:
      return studyMode;
  }
}

// Re-export session controller hook and types from @/hooks
export * from '@/hooks/use-session-controller';
