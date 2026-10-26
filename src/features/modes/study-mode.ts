/**
 * Socratic Study Mode Module (Phase R4)
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, PRD §4.1
 *
 * Scopes learning to selected units in topological prerequisite order.
 * Concepts advance one at a time. Studying alone does not mark mastery;
 * mastery is earned only through verified recall evaluations.
 */

import { type ConceptRecord, type StudySessionRecord } from '@/types/domain';
import { sortConceptsTopologically } from '@/features/learning-units/builder';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import {
  type ModeModule,
  type ModeContext,
  type ModeAvailability,
  type ModeProgress,
  type SessionSummary,
} from './types';
import { buildSessionSummaryFromDatabase } from './summary-service';

export class StudyModeModule implements ModeModule {
  public readonly id = 'study' as const;
  public readonly name = 'Socratic Study';
  public readonly description =
    'Guided step-by-step concept exploration with an interactive AI tutor in prerequisite order.';

  /**
   * Filter and order concepts in topological prerequisite order according to the selection.
   */
  public getOrderedConcepts(ctx: ModeContext): ConceptRecord[] {
    const { concepts, units, selection, dependencies, chunks } = ctx;

    // Filter concepts to selected units if UNITS selection
    let inScopeConcepts: ConceptRecord[];
    if (selection.kind === 'UNITS' && selection.unitIds.length > 0) {
      const selectedUnitSet = new Set(selection.unitIds);
      const selectedUnits = units.filter((u) => selectedUnitSet.has(u.id));
      const targetConceptIdSet = new Set(selectedUnits.flatMap((u) => u.conceptIds));
      inScopeConcepts = concepts.filter((c) => targetConceptIdSet.has(c.id));
    } else {
      inScopeConcepts = [...concepts];
    }

    if (inScopeConcepts.length <= 1) {
      return inScopeConcepts;
    }

    // Sort topologically using existing Kahn algorithm
    return sortConceptsTopologically(inScopeConcepts, dependencies, chunks);
  }

  public async getAvailability(ctx: ModeContext): Promise<ModeAvailability> {
    const ordered = this.getOrderedConcepts(ctx);
    if (ordered.length === 0) {
      return {
        available: false,
        reason: 'No concepts available in the selected units.',
        totalConcepts: 0,
      };
    }

    return {
      available: true,
      totalConcepts: ordered.length,
    };
  }

  public async start(ctx: ModeContext): Promise<StudySessionRecord> {
    const ordered = this.getOrderedConcepts(ctx);
    const initialConcept = ordered[0];
    const initialUnit = ctx.units.find((u) => u.conceptIds.includes(initialConcept?.id));

    const selectedUnitIds =
      ctx.selection.kind === 'UNITS' ? ctx.selection.unitIds : ctx.units.map((u) => u.id);

    const session: StudySessionRecord = {
      id: ctx.sessionId || generateId(),
      materialId: ctx.materialId,
      learningUnitId: initialUnit?.id,
      currentUnitId: initialUnit?.id,
      unitIds: selectedUnitIds,
      mode: 'study',
      status: 'active',
      machineState: 'IDLE',
      currentConceptId: initialConcept?.id ?? 'default',
      sourceMode: 'document',
      startedAt: nowIso(),
      updatedAt: nowIso(),
    };

    const db = await openDatabase(DB_NAME);
    await db.put('studySessions', session);
    return session;
  }

  public async resume(session: StudySessionRecord, _ctx?: ModeContext): Promise<StudySessionRecord> {
    void _ctx;
    const db = await openDatabase(DB_NAME);
    const updated: StudySessionRecord = {
      ...session,
      mode: 'study',
      status: 'active',
      updatedAt: nowIso(),
    };
    await db.put('studySessions', updated);
    return updated;
  }

  public getProgress(session: StudySessionRecord, ctx: ModeContext): ModeProgress {
    const ordered = this.getOrderedConcepts(ctx);
    const total = Math.max(1, ordered.length);
    const currentIdx = ordered.findIndex((c) => c.id === session.currentConceptId);
    const completed = currentIdx >= 0 ? currentIdx : 0;
    const currentConcept = ordered[currentIdx] ?? ordered[0];

    const currentUnit = ctx.units.find((u) => u.conceptIds.includes(currentConcept?.id));

    return {
      total,
      completed,
      percent: Math.min(100, Math.round((completed / total) * 100)),
      currentUnitTitle: currentUnit?.title,
      currentConceptTitle: currentConcept?.title,
      stageLabel: `Concept ${completed + 1} of ${total}`,
    };
  }

  public async buildSummary(sessionId: string, materialId: string): Promise<SessionSummary> {
    return buildSessionSummaryFromDatabase(sessionId, materialId);
  }
}

export const studyMode = new StudyModeModule();
