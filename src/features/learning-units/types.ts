import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
  type LearningUnitRecord,
} from '@/types/domain';
import { type ExtractedHeading } from '@/features/ingestion/types';

export interface LearningUnitConfig {
  minConceptsPerUnit: number; // default: 3
  maxConceptsPerUnit: number; // default: 8
}

export const DEFAULT_UNIT_CONFIG: LearningUnitConfig = {
  minConceptsPerUnit: 3,
  maxConceptsPerUnit: 8,
};

export interface UnitBuildInput {
  materialId: string;
  contentVersion: string;
  concepts: ConceptRecord[];
  dependencies: ConceptDependencyRecord[];
  chunks: DocumentChunkRecord[];
  headings?: ExtractedHeading[];
  docTitle?: string;
  config?: Partial<LearningUnitConfig>;
}

export interface BuildUnitsResult {
  units: LearningUnitRecord[];
  conceptUnitMap: Map<string, string>; // conceptId -> unitId
}
