/**
 * Due-Review Queue & Spaced Repetition Scheduling Service
 * Source of truth: PRD FR-11, FR-16, DESIGN §5.3.F
 *
 * Groups review items into:
 * - weak: concepts flagged with weak = true from recent failing recall
 * - overdue: nextDueAt < todayStart
 * - dueToday: nextDueAt >= todayStart && nextDueAt <= todayEnd
 * - upcoming: nextDueAt > todayEnd within the next 7 days
 *
 * Deterministic ordering: weak first, then most overdue (nextDueAt ascending).
 */

import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { now } from '@/lib/utils/clock';
import {
  type ConceptRecord,
  type SpacedRepetitionStateRecord,
  type MasteryStateRecord,
} from '@/types/domain';

export interface ReviewQueueItem {
  concept: ConceptRecord;
  spacedRepetition: SpacedRepetitionStateRecord;
  mastery?: MasteryStateRecord;
  category: 'weak' | 'overdue' | 'dueToday' | 'upcoming';
  diffDays: number;
  humanDueText: string;
}

export interface ReviewQueueGroups {
  weak: ReviewQueueItem[];
  overdue: ReviewQueueItem[];
  dueToday: ReviewQueueItem[];
  upcoming: ReviewQueueItem[];
  totalDueCount: number; // weak + overdue + dueToday (actionable now)
  allItemsOrdered: ReviewQueueItem[]; // weak first, then most overdue
}

export interface BuildReviewQueueOptions {
  concepts: ConceptRecord[];
  srList: SpacedRepetitionStateRecord[];
  masteryList?: MasteryStateRecord[];
  nowUtc?: Date | string;
  timeZone?: string;
}

/**
 * Computes human-readable relative due text ("Due today", "Overdue by 2 days", "In 6 days").
 */
export function formatHumanDueText(diffDays: number, isWeak = false): string {
  if (isWeak && diffDays > 0) {
    return 'Revision recommended';
  }
  if (diffDays < -1) {
    return `Overdue by ${Math.abs(diffDays)} days`;
  }
  if (diffDays === -1) {
    return 'Overdue by 1 day';
  }
  if (diffDays === 0) {
    return 'Due today';
  }
  if (diffDays === 1) {
    return 'Due tomorrow';
  }
  return `In ${diffDays} days`;
}

/**
 * Pure function building grouped, deterministically sorted review queues.
 */
export function buildReviewQueue(options: BuildReviewQueueOptions): ReviewQueueGroups {
  const { concepts, srList, masteryList = [], timeZone = 'UTC' } = options;

  const currentInstant =
    options.nowUtc instanceof Date
      ? options.nowUtc
      : typeof options.nowUtc === 'string'
        ? new Date(options.nowUtc)
        : now();

  const conceptMap = new Map<string, ConceptRecord>();
  for (const c of concepts) {
    conceptMap.set(c.id, c);
  }

  const masteryMap = new Map<string, MasteryStateRecord>();
  for (const m of masteryList) {
    masteryMap.set(m.conceptId, m);
  }

  // Determine local date bounds for currentInstant
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const getCalendarYmd = (d: Date): { y: number; m: number; d: number } => {
    const parts = formatter.formatToParts(d);
    const m: Record<string, string> = {};
    for (const p of parts) m[p.type] = p.value;
    return {
      y: parseInt(m.year, 10),
      m: parseInt(m.month, 10),
      d: parseInt(m.day, 10),
    };
  };

  const todayYmd = getCalendarYmd(currentInstant);
  const todayUtcAnchor = Date.UTC(todayYmd.y, todayYmd.m - 1, todayYmd.d);

  const weak: ReviewQueueItem[] = [];
  const overdue: ReviewQueueItem[] = [];
  const dueToday: ReviewQueueItem[] = [];
  const upcoming: ReviewQueueItem[] = [];

  for (const sr of srList) {
    const concept = conceptMap.get(sr.conceptId);
    if (!concept) continue;

    const dueDate = new Date(sr.nextDueAt);
    const dueYmd = getCalendarYmd(dueDate);
    const dueUtcAnchor = Date.UTC(dueYmd.y, dueYmd.m - 1, dueYmd.d);

    const diffDays = Math.round((dueUtcAnchor - todayUtcAnchor) / (1000 * 60 * 60 * 24));
    const humanDueText = formatHumanDueText(diffDays, sr.weak);

    const item: ReviewQueueItem = {
      concept,
      spacedRepetition: sr,
      mastery: masteryMap.get(sr.conceptId),
      category: sr.weak
        ? 'weak'
        : diffDays < 0
          ? 'overdue'
          : diffDays === 0
            ? 'dueToday'
            : 'upcoming',
      diffDays,
      humanDueText,
    };

    if (sr.weak) {
      weak.push(item);
    } else if (diffDays < 0) {
      overdue.push(item);
    } else if (diffDays === 0) {
      dueToday.push(item);
    } else if (diffDays <= 7) {
      upcoming.push(item);
    }
  }

  // Deterministic sorting:
  // 1. Weak concepts sorted by lowest mastery score first, then title
  weak.sort((a, b) => {
    const scoreA = a.mastery?.percentage ?? 0;
    const scoreB = b.mastery?.percentage ?? 0;
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.concept.title.localeCompare(b.concept.title);
  });

  // 2. Overdue sorted by most overdue first (diffDays ascending), then title
  overdue.sort((a, b) => {
    if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays;
    return a.concept.title.localeCompare(b.concept.title);
  });

  // 3. Due today sorted alphabetically
  dueToday.sort((a, b) => a.concept.title.localeCompare(b.concept.title));

  // 4. Upcoming sorted by nearest due date (diffDays ascending)
  upcoming.sort((a, b) => {
    if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays;
    return a.concept.title.localeCompare(b.concept.title);
  });

  const totalDueCount = weak.length + overdue.length + dueToday.length;

  // Ordering: weak first, then overdue, then due today
  const allItemsOrdered = [...weak, ...overdue, ...dueToday];

  return {
    weak,
    overdue,
    dueToday,
    upcoming,
    totalDueCount,
    allItemsOrdered,
  };
}

/**
 * Reads database and returns current review queue groups.
 */
export async function getDueReviewQueue(options: {
  dbName?: string;
  timeZone?: string;
  nowUtc?: Date | string;
} = {}): Promise<ReviewQueueGroups> {
  const { dbName = DB_NAME, timeZone, nowUtc } = options;

  const db = await openDatabase(dbName);
  const concepts = await db.getAll('concepts');
  const srList = await db.getAll('spacedRepetitionStates');
  const masteryList = await db.getAll('masteryStates');

  const resolvedTz =
    timeZone ||
    (typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC') ||
    'UTC';

  return buildReviewQueue({
    concepts,
    srList,
    masteryList,
    nowUtc,
    timeZone: resolvedTz,
  });
}
