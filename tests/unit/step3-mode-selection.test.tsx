import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step3ChooseMode } from '@/components/workflow/step3-choose-mode';
import { createMemoryRepositories } from '@/lib/db/repositories/memory-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import * as bootstrap from '@/lib/db/bootstrap';
import * as reviewQueue from '@/features/spaced-repetition/queue';
import { type DocumentRecord, type LearningUnitRecord, type ConceptRecord } from '@/types/domain';

// Mock Next.js navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
}));

describe('Step 3: Mode Selection Component (Phase R3)', () => {
  let repos: StorageRepositories;

  const mockDoc: DocumentRecord = {
    id: 'mat-comp-arch',
    materialId: 'mat-comp-arch',
    filename: 'Computer_Architecture.pdf',
    fileType: 'pdf',
    fileSize: 4096,
    extractedText: 'Pipelining, hazard detection, and cache hierarchies.',
    analysisStatus: 'completed',
    fileHash: 'fhash-arch',
    contentHash: 'chash-arch',
    createdAt: '2026-10-25T12:00:00.000Z',
    updatedAt: '2026-10-25T12:00:00.000Z',
  };

  const mockUnits: LearningUnitRecord[] = [
    {
      id: 'unit-pipe',
      materialId: 'mat-comp-arch',
      order: 1,
      title: 'Pipelining & Hazards',
      summary: 'Instruction execution stages and dependency hazard mitigation.',
      conceptIds: ['c-hazards', 'c-forwarding'],
      sourceChunkIds: ['ch-1'],
      contentVersion: 'chash-arch',
      createdAt: '2026-10-25T12:00:00.000Z',
      updatedAt: '2026-10-25T12:00:00.000Z',
    },
  ];

  const mockConcepts: ConceptRecord[] = [
    {
      id: 'c-hazards',
      materialId: 'mat-comp-arch',
      title: 'Pipeline Hazards',
      summary: 'Data, structural, and control hazards.',
      canonicalExplanation: 'Structural, data, and control pipeline hazards explanation.',
      keyTerms: ['Hazard', 'Stall', 'RAW'],
      sourceChunkIds: ['ch-1'],
      tier: 0,
      status: 'available',
      confidence: 0.9,
      extractionOrder: 0,
      contentVersion: 'chash-arch',
      promptVersion: '1.0',
      createdAt: '2026-10-25T12:00:00.000Z',
      updatedAt: '2026-10-25T12:00:00.000Z',
    },
    {
      id: 'c-forwarding',
      materialId: 'mat-comp-arch',
      title: 'Data Forwarding',
      summary: 'Bypassing pipeline registers to resolve RAW hazards.',
      canonicalExplanation: 'Forwarding paths from ALU to earlier stages.',
      keyTerms: ['Bypass', 'ALU', 'Forwarding'],
      sourceChunkIds: ['ch-1'],
      tier: 1,
      status: 'available',
      confidence: 0.85,
      extractionOrder: 1,
      contentVersion: 'chash-arch',
      promptVersion: '1.0',
      createdAt: '2026-10-25T12:00:00.000Z',
      updatedAt: '2026-10-25T12:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    repos = createMemoryRepositories();
    vi.spyOn(bootstrap, 'getStorage').mockReturnValue(repos);

    await repos.documents.put(mockDoc);
    await repos.learningUnits.putMany(mockUnits);
    await repos.concepts.putMany(mockConcepts);
    await repos.workflowState.put({
      id: 'mat-comp-arch',
      materialId: 'mat-comp-arch',
      selection: { kind: 'WHOLE_MATERIAL' },
      updatedAt: '2026-10-25T12:00:00.000Z',
    });
  });

  it('renders all three mode cards with descriptions and action buttons', async () => {
    vi.spyOn(reviewQueue, 'getDueReviewQueue').mockResolvedValue({
      weak: [],
      overdue: [],
      dueToday: [],
      upcoming: [],
      totalDueCount: 0,
      allItemsOrdered: [],
    });

    render(<Step3ChooseMode materialId="mat-comp-arch" />);

    await waitFor(() => {
      expect(screen.getByText('Socratic Study')).toBeInTheDocument();
      expect(screen.getByText('Active Recall Practice')).toBeInTheDocument();
      expect(screen.getByText('Spaced Revision')).toBeInTheDocument();
    });

    // Verify concept count is displayed
    expect(screen.getByText(/2 concepts available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Socratic Study/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Active Recall/i })).toBeInTheDocument();
  });

  it('shows honest explanation when Spaced Revision has nothing due, showing next due date and explicit choices without auto-switching', async () => {
    vi.spyOn(reviewQueue, 'getDueReviewQueue').mockResolvedValue({
      weak: [],
      overdue: [],
      dueToday: [],
      upcoming: [
        {
          concept: mockConcepts[0],
          spacedRepetition: {
            id: 'sr-1',
            conceptId: 'c-hazards',
            repetitions: 2,
            easinessFactor: 2.5,
            intervalDays: 3,
            nextDueAt: '2026-10-28T10:00:00.000Z',
            weak: false,
            updatedAt: '2026-10-25T12:00:00.000Z',
          },
          category: 'upcoming',
          diffDays: 3,
          humanDueText: 'In 3 days',
        },
      ],
      totalDueCount: 0,
      allItemsOrdered: [],
    });

    render(<Step3ChooseMode materialId="mat-comp-arch" />);

    await waitFor(() => {
      expect(screen.getByText('Spaced Revision')).toBeInTheDocument();
    });

    // Must show 0 due
    expect(screen.getByText('0 due today')).toBeInTheDocument();

    // Must show next due text honestly
    expect(screen.getByText(/Next review due:/i)).toBeInTheDocument();
    expect(screen.getByText('In 3 days')).toBeInTheDocument();

    // Must offer explicit alternatives, NEVER silently auto-switch
    expect(screen.getByRole('button', { name: /Study Instead/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recall Instead/i })).toBeInTheDocument();

    // Spaced revision start button should not be enabled when 0 due
    expect(screen.queryByRole('button', { name: /Start Spaced Revision/i })).not.toBeInTheDocument();
  });

  it('enables Start Spaced Revision button when items are due', async () => {
    vi.spyOn(reviewQueue, 'getDueReviewQueue').mockResolvedValue({
      weak: [],
      overdue: [
        {
          concept: mockConcepts[0],
          spacedRepetition: {
            id: 'sr-1',
            conceptId: 'c-hazards',
            repetitions: 1,
            easinessFactor: 2.5,
            intervalDays: 1,
            nextDueAt: '2026-10-24T10:00:00.000Z',
            weak: false,
            updatedAt: '2026-10-25T12:00:00.000Z',
          },
          category: 'overdue',
          diffDays: -1,
          humanDueText: 'Overdue by 1 day',
        },
      ],
      dueToday: [],
      upcoming: [],
      totalDueCount: 1,
      allItemsOrdered: [
        {
          concept: mockConcepts[0],
          spacedRepetition: {
            id: 'sr-1',
            conceptId: 'c-hazards',
            repetitions: 1,
            easinessFactor: 2.5,
            intervalDays: 1,
            nextDueAt: '2026-10-24T10:00:00.000Z',
            weak: false,
            updatedAt: '2026-10-25T12:00:00.000Z',
          },
          category: 'overdue',
          diffDays: -1,
          humanDueText: 'Overdue by 1 day',
        },
      ],
    });

    render(<Step3ChooseMode materialId="mat-comp-arch" />);

    await waitFor(() => {
      expect(screen.getByText('1 due today')).toBeInTheDocument();
    });

    const startRevisionBtn = screen.getByRole('button', { name: /Start Spaced Revision/i });
    expect(startRevisionBtn).toBeInTheDocument();
  });

  it('launches chosen mode and validates launch contract into workflowState store before navigation', async () => {
    const user = userEvent.setup();

    vi.spyOn(reviewQueue, 'getDueReviewQueue').mockResolvedValue({
      weak: [],
      overdue: [],
      dueToday: [],
      upcoming: [],
      totalDueCount: 0,
      allItemsOrdered: [],
    });

    render(<Step3ChooseMode materialId="mat-comp-arch" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start Socratic Study/i })).toBeInTheDocument();
    });

    const studyBtn = screen.getByRole('button', { name: /Start Socratic Study/i });
    await user.click(studyBtn);

    // Verify router push to Step 4
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringMatching(/\/learn\/mat-comp-arch\/session\/[a-zA-Z0-9_-]+/)
      );
    });

    // Verify persisted preference in IndexedDB
    const savedState = await repos.workflowState.getByMaterial('mat-comp-arch');
    expect(savedState?.lastChosenMode).toBe('study');
    expect(savedState?.lastSessionId).toBeTruthy();
  });
});
