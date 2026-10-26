/**
 * Spaced Revision (SM-2) Mode Module (Phase R4)
 * Source of truth: docs/REFACTOR_RULES.md, docs/REFACTOR_DECISIONS.md, PRD §4.3, FR-11
 *
 * Reads real saved SM-2 records filtered by material/units.
 * Deterministic ordering: weak concepts first, then most overdue.
 * If zero items are due, reports next due date or unscheduled notice and provides
 * explicit alternative pathways (never silently auto-switches).
 *
 * Interval updates occur ONLY after a review response is recorded, inside an atomic
 * transaction alongside the attempt and mastery update.
 */

import {
  type ConceptRecord,
  type StudySessionRecord,
  type SpacedRepetitionStateRecord,
  type MasteryStateRecord,
} from '@/types/domain';
import { generateId } from '@/lib/utils/id';
import { now, nowIso } from '@/lib/utils/clock';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import {
  type ModeModule,
  type ModeContext,
  type ModeAvailability,
  type ModeProgress,
  type SessionSummary,
} from './types';
import { buildSessionSummaryFromDatabase } from './summary-service';
import { buildReviewQueue, type ReviewQueueItem } from '@/features/spaced-repetition/queue';

export class RevisionModeModule implements ModeModule {
  public readonly id = 'revision' as const;
  public readonly name = 'Spaced Revision';
  public readonly description =
    'Strengthen long-term retention with optimal SuperMemo SM-2 spaced repetition review intervals.';

  /**
   * Filter in-scope concepts for the current material selection.
   */
  public getInScopeConcepts(ctx: ModeContext): ConceptRecord[] {
    const { concepts, units, selection } = ctx;

    if (selection.kind === 'UNITS' && selection.unitIds.length > 0) {
      const selectedUnitSet = new Set(selection.unitIds);
      const selectedUnits = units.filter((u) => selectedUnitSet.has(u.id));
      const targetConceptIdSet = new Set(selectedUnits.flatMap((u) => u.conceptIds));
      return concepts.filter((c) => targetConceptIdSet.has(c.id));
    }
    return [...concepts];
  }

  /**
   * Builds the real due-review queue from IndexedDB records.
   * Respects injectable clock nowUtc and optional isolated dbName for unit tests.
   */
  public async getReviewQueue(
    ctx: ModeContext,
    nowUtc?: Date | string,
    dbName = DB_NAME,
  ): Promise<{
    dueItems: ReviewQueueItem[];
    allQueueItems: ReviewQueueItem[];
    nextUpcomingDueAt?: string;
  }> {
    const inScope = this.getInScopeConcepts(ctx);
    if (inScope.length === 0) {
      return { dueItems: [], allQueueItems: [] };
    }

    const inScopeConceptIds = new Set(inScope.map((c) => c.id));

    const db = await openDatabase(dbName);
    const allSr = (await db.getAll('spacedRepetitionStates')) as SpacedRepetitionStateRecord[];
    const materialSr = allSr.filter((s) => inScopeConceptIds.has(s.conceptId));

    const allMastery = (await db.getAll('masteryStates')) as MasteryStateRecord[];
    const materialMastery = allMastery.filter((m) => inScopeConceptIds.has(m.conceptId));

    const queue = buildReviewQueue({
      concepts: inScope,
      srList: materialSr,
      masteryList: materialMastery,
      nowUtc: nowUtc ?? now(),
    });

    const dueItems = queue.allItemsOrdered.filter(
      (item) => item.category === 'weak' || item.category === 'overdue' || item.category === 'dueToday',
    );

    const nextUpcoming = queue.upcoming[0]?.spacedRepetition.nextDueAt;

    return {
      dueItems,
      allQueueItems: queue.allItemsOrdered,
      nextUpcomingDueAt: nextUpcoming,
    };
  }

  public getOrderedConcepts(ctx: ModeContext): ConceptRecord[] {
    // For synchronous contract access: return in-scope concepts
    // The asynchronous getDueConcepts method returns the exact queue-ordered concepts
    return this.getInScopeConcepts(ctx);
  }

  public async getDueConcepts(
    ctx: ModeContext,
    nowUtc?: Date | string,
    dbName = DB_NAME,
  ): Promise<ConceptRecord[]> {
    const { dueItems } = await this.getReviewQueue(ctx, nowUtc, dbName);
    return dueItems.map((item) => item.concept);
  }

  public async getAvailability(
    ctx: ModeContext,
    nowUtc?: Date | string,
    dbName = DB_NAME,
  ): Promise<ModeAvailability> {
    const { dueItems, nextUpcomingDueAt } = await this.getReviewQueue(ctx, nowUtc, dbName);

    if (dueItems.length === 0) {
      if (nextUpcomingDueAt) {
        return {
          available: false,
          dueCount: 0,
          reason: `No concepts are due today. Next review scheduled for ${new Date(nextUpcomingDueAt).toLocaleDateString()}.`,
          nextDueAt: nextUpcomingDueAt,
        };
      }
      return {
        available: false,
        dueCount: 0,
        reason: 'No reviews scheduled yet. Complete a Study or Recall session to start your review schedule.',
      };
    }

    return {
      available: true,
      dueCount: dueItems.length,
      totalConcepts: dueItems.length,
      nextDueAt: dueItems[0].spacedRepetition.nextDueAt,
    };
  }

  public async start(ctx: ModeContext): Promise<StudySessionRecord> {
    const dueConcepts = await this.getDueConcepts(ctx);
    const initialConcept = dueConcepts[0] ?? this.getInScopeConcepts(ctx)[0];
    const initialUnit = ctx.units.find((u) => u.conceptIds.includes(initialConcept?.id));

    const selectedUnitIds =
      ctx.selection.kind === 'UNITS' ? ctx.selection.unitIds : ctx.units.map((u) => u.id);

    const session: StudySessionRecord = {
      id: ctx.sessionId || generateId(),
      materialId: ctx.materialId,
      learningUnitId: initialUnit?.id,
      currentUnitId: initialUnit?.id,
      unitIds: selectedUnitIds,
      mode: 'revision',
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
      mode: 'revision',
      status: 'active',
      updatedAt: nowIso(),
    };
    await db.put('studySessions', updated);
    return updated;
  }

  public getProgress(session: StudySessionRecord, ctx: ModeContext): ModeProgress {
    const inScope = this.getInScopeConcepts(ctx);
    const total = Math.max(1, inScope.length);
    const currentConcept = inScope.find((c) => c.id === session.currentConceptId) ?? inScope[0];
    const currentUnit = ctx.units.find((u) => u.conceptIds.includes(currentConcept?.id));

    return {
      total,
      completed: 0,
      percent: 0,
      currentUnitTitle: currentUnit?.title,
      currentConceptTitle: currentConcept?.title,
      stageLabel: `Revision Concept: ${currentConcept?.title ?? 'Review Item'}`,
    };
  }

  public async buildSummary(sessionId: string, materialId: string): Promise<SessionSummary> {
    return buildSessionSummaryFromDatabase(sessionId, materialId);
  }
}

export const revisionMode = new RevisionModeModule();
