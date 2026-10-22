import { type ConceptRecord, type ConceptDependencyRecord } from '@/types/domain';

export type ConceptPipelineStage =
  | 'batching'
  | 'extracting'
  | 'deduplicating'
  | 'linking'
  | 'persisting'
  | 'completed'
  | 'error';

export interface ConceptPipelineProgress {
  stage: ConceptPipelineStage;
  percent: number; // 0 - 100
  message: string;
  currentBatch?: number;
  totalBatches?: number;
  conceptsExtracted?: number;
}

export interface UnresolvedPrerequisite {
  conceptTitle: string;
  prerequisiteTitle: string;
}

export interface ConceptPipelineResult {
  success: boolean;
  documentId: string;
  concepts: ConceptRecord[];
  dependencies: ConceptDependencyRecord[];
  unresolvedPrerequisites: UnresolvedPrerequisite[];
  hallucinatedCitationsRemoved: number;
  error?: string;
  code?: string;
}
