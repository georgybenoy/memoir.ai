/**
 * Active Recall Mode Module (Phase R4)
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, PRD §4.2, FR-07
 *
 * Scopes formative recall practice to concepts in the selected units.
 * Reuses grounded question generation, difficulty modulation, hybrid evaluation,
 * and the Question Reuse Policy. Weak answers trigger the remedial loopback.
 *
 * Session Length: Each in-scope concept once, capped at defaultMaxConceptsPerSession (10).
 * Definition of Completed: All in-scope concepts for the session have been answered.
 */

import { type ConceptRecord, type StudySessionRecord } from '@/types/domain';
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
import { sortConceptsTopologically } from '@/features/learning-units/builder';

export const DEFAULT_RECALL_SESSION_CAP = 10;

export class RecallModeModule implements ModeModule {
  public readonly id = 'recall' as const;
  public readonly name = 'Active Recall';
  public readonly description =
    'Test and strengthen your memory with grounded practice questions and instant feedback.';

  public getOrderedConcepts(ctx: ModeContext): ConceptRecord[] {
    const { concepts, units, selection, dependencies, chunks } = ctx;

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

    // Topological order provides clean pedagogical progression
    const sorted = sortConceptsTopologically(inScopeConcepts, dependencies, chunks);
    return sorted.slice(0, DEFAULT_RECALL_SESSION_CAP);
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
      mode: 'recall',
      status: 'active',
      machineState: 'WAITING_FOR_RECALL',
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
      mode: 'recall',
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
      stageLabel: `Question ${completed + 1} of ${total}`,
    };
  }

  public async buildSummary(sessionId: string, materialId: string): Promise<SessionSummary> {
    return buildSessionSummaryFromDatabase(sessionId, materialId);
  }
}

export const recallMode = new RecallModeModule();
