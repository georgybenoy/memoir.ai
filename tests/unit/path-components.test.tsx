/**
 * Study Path UI Components Unit & Accessibility Tests
 * Tests PathListView, PathGraphView, ConceptDetailPanel, PathDiagnostics, and ConceptStatusBadge.
 * Source of truth: DESIGN_DOC §5.3.C, §6.4, §6.7, PRD FR-04, FR-05
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConceptStatusBadge } from '@/components/study-path/ConceptStatusBadge';
import { PathListView } from '@/components/study-path/PathListView';
import { PathGraphView } from '@/components/study-path/PathGraphView';
import { ConceptDetailPanel } from '@/components/study-path/ConceptDetailPanel';
import { PathDiagnostics } from '@/components/study-path/PathDiagnostics';
import { PathHeader } from '@/components/study-path/PathHeader';
import { type ConceptRecord, type DocumentChunkRecord } from '@/types/domain';
import { type NormalizedGraphEdge } from '@/features/dependency-graph';

function makeConcept(
  id: string,
  tier: number,
  status: ConceptRecord['status'],
  title?: string,
): ConceptRecord {
  return {
    id,
    title: title ?? `Concept ${id}`,
    summary: `Summary of ${id}`,
    canonicalExplanation: `Canonical explanation of ${id}`,
    keyTerms: ['term1', 'term2'],
    sourceChunkIds: [`chunk-${id}`],
    tier,
    status,
    confidence: 0.9,
    extractionOrder: 1,
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };
}

describe('ConceptStatusBadge', () => {
  it('pairs accessible text with an icon for all status values (never color alone)', () => {
    const statuses: Array<ConceptRecord['status']> = [
      'locked',
      'available',
      'in_progress',
      'review_due',
      'mastered',
    ];

    for (const status of statuses) {
      const { unmount } = render(<ConceptStatusBadge status={status} />);
      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBeTruthy();
      expect(badge.getAttribute('aria-label')).toContain('Status:');
      unmount();
    }
  });
});

describe('PathListView', () => {
  it('groups concepts by tier with accessible headings and lists', () => {
    const c0 = makeConcept('c0', 0, 'available', 'Variables');
    const c1 = makeConcept('c1', 1, 'locked', 'Loops');
    const prereqsMap = new Map([
      ['c0', []],
      ['c1', [c0]],
    ]);

    render(
      <PathListView
        concepts={[c0, c1]}
        prerequisitesMap={prereqsMap}
        selectedConceptId={null}
        onSelectConcept={vi.fn()}
        onLearnConcept={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: /Tier 0/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tier 1/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Variables' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Loops' })).toBeInTheDocument();
  });

  it('disables "Locked" action button with plain-language reason when locked', () => {
    const c0 = makeConcept('c0', 0, 'in_progress', 'Primitives');
    const c1 = makeConcept('c1', 1, 'locked', 'Recursion');
    const prereqsMap = new Map([['c1', [c0]]]);

    render(
      <PathListView
        concepts={[c0, c1]}
        prerequisitesMap={prereqsMap}
        selectedConceptId={null}
        onSelectConcept={vi.fn()}
        onLearnConcept={vi.fn()}
      />,
    );

    const lockedBtn = screen.getByRole('button', { name: /Locked/i });
    expect(lockedBtn).toBeDisabled();

    // Plain-language locked reason described via sr-only container
    const lockedReason = screen.getByText(/Locked: Must master "Primitives" first/i);
    expect(lockedReason).toBeInTheDocument();
  });

  it('triggers onLearnConcept when available concept button is clicked', () => {
    const c0 = makeConcept('c0', 0, 'available', 'Functions');
    const onLearn = vi.fn();

    render(
      <PathListView
        concepts={[c0]}
        prerequisitesMap={new Map()}
        selectedConceptId={null}
        onSelectConcept={vi.fn()}
        onLearnConcept={onLearn}
      />,
    );

    const learnBtn = screen.getByRole('button', { name: /Learn this concept/i });
    expect(learnBtn).not.toBeDisabled();
    fireEvent.click(learnBtn);
    expect(onLearn).toHaveBeenCalledWith('c0');
  });

  it('supports keyboard navigation via Enter key on concept card', () => {
    const c0 = makeConcept('c0', 0, 'available', 'Arrays');
    const onSelect = vi.fn();

    render(
      <PathListView
        concepts={[c0]}
        prerequisitesMap={new Map()}
        selectedConceptId={null}
        onSelectConcept={onSelect}
        onLearnConcept={vi.fn()}
      />,
    );

    const article = screen.getByRole('article');
    fireEvent.keyDown(article, { key: 'Enter', code: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('c0');
  });
});

describe('PathGraphView', () => {
  it('renders SVG layered canvas with directed edges and nodes', () => {
    const c0 = makeConcept('c0', 0, 'available', 'NodeA');
    const c1 = makeConcept('c1', 1, 'locked', 'NodeB');
    const edges: NormalizedGraphEdge[] = [
      {
        id: 'e1',
        prerequisiteId: 'c0',
        dependentConceptId: 'c1',
        confidence: 0.8,
        removed: false,
      },
    ];

    render(
      <PathGraphView
        concepts={[c0, c1]}
        activeEdges={edges}
        selectedConceptId="c0"
        onSelectConcept={vi.fn()}
        onSwitchToList={vi.fn()}
      />,
    );

    // Canvas region exists
    expect(screen.getByRole('region', { name: /Interactive concept dependency graph/i })).toBeInTheDocument();

    // Node buttons rendered
    const nodeA = screen.getByRole('button', { name: /NodeA/i });
    expect(nodeA).toBeInTheDocument();

    // Zoom controls rendered
    expect(screen.getByRole('button', { name: /Zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zoom out/i })).toBeInTheDocument();

    // Visual legend rendered
    expect(screen.getByRole('contentinfo', { name: /Graph visual legend/i })).toBeInTheDocument();
  });

  it('selects node on Enter key press in SVG', () => {
    const c0 = makeConcept('c0', 0, 'available', 'InteractiveNode');
    const onSelect = vi.fn();

    render(
      <PathGraphView
        concepts={[c0]}
        activeEdges={[]}
        selectedConceptId={null}
        onSelectConcept={onSelect}
        onSwitchToList={vi.fn()}
      />,
    );

    const node = screen.getByRole('button', { name: /InteractiveNode/i });
    fireEvent.keyDown(node, { key: 'Enter', code: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('c0');
  });
});

describe('ConceptDetailPanel', () => {
  const dummyChunk: DocumentChunkRecord = {
    id: 'chunk-1',
    documentId: 'doc-1',
    chunkIndex: 0,
    text: 'Extracted lecture text demonstrating the concept.',
    startOffset: 0,
    endOffset: 50,
    pageStart: 2,
    pageEnd: 2,
    headingPath: ['Introduction', 'Core Ideas'],
    contentHash: 'hash-1',
    createdAt: '2026-10-22T00:00:00Z',
  };

  it('renders summary, key terms, provenance excerpt, and prerequisites', () => {
    const concept = makeConcept('c1', 1, 'available', 'Object Oriented Programming');
    const prereq = makeConcept('c0', 0, 'mastered', 'Structured Programming');

    render(
      <ConceptDetailPanel
        concept={concept}
        prerequisites={[prereq]}
        dependents={[]}
        sourceChunks={[dummyChunk]}
        downstreamInfluence={0.5}
        onSelectConcept={vi.fn()}
        onLearnConcept={vi.fn()}
        onSkipPrerequisites={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Object Oriented Programming')).toBeInTheDocument();
    expect(screen.getByText('Summary of c1')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByText('Introduction › Core Ideas')).toBeInTheDocument();
    expect(screen.getByText(/Extracted lecture text demonstrating the concept/i)).toBeInTheDocument();
    expect(screen.getByText('Structured Programming')).toBeInTheDocument();
  });

  it('handles explicit prerequisite skip override flow with confirmation', () => {
    const lockedConcept = makeConcept('locked1', 1, 'locked', 'Advanced Closures');
    const onSkip = vi.fn();

    render(
      <ConceptDetailPanel
        concept={lockedConcept}
        prerequisites={[]}
        dependents={[]}
        sourceChunks={[]}
        onSelectConcept={vi.fn()}
        onLearnConcept={vi.fn()}
        onSkipPrerequisites={onSkip}
        onClose={vi.fn()}
      />,
    );

    // Initial override button
    const overrideBtn = screen.getByRole('button', { name: /Override & skip prerequisites/i });
    expect(overrideBtn).toBeInTheDocument();

    // Click override to open confirmation dialog
    fireEvent.click(overrideBtn);

    // Confirmation button appears
    const confirmBtn = screen.getByRole('button', { name: /Confirm Skip/i });
    expect(confirmBtn).toBeInTheDocument();

    fireEvent.click(confirmBtn);
    expect(onSkip).toHaveBeenCalledWith('locked1');
  });
});

describe('PathDiagnostics', () => {
  it('displays graph mode and removed edges table in collapsible view', () => {
    const removedEdges: NormalizedGraphEdge[] = [
      {
        id: 'r1',
        prerequisiteId: 'c1',
        dependentConceptId: 'c2',
        confidence: 0.3,
        removed: true,
        removedReason: 'cycle_resolution',
      },
    ];

    render(
      <PathDiagnostics
        graphMode="dag"
        activeEdgesCount={5}
        removedEdges={removedEdges}
        cyclesDetectedCount={1}
      />,
    );

    expect(screen.getByText(/Graph & Pipeline Diagnostics/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified DAG/i)).toBeInTheDocument();
    expect(screen.getByText('c1 → c2')).toBeInTheDocument();
    expect(screen.getByText('cycle resolution')).toBeInTheDocument();
  });

  it('renders approximate linear notice in fallback_linear mode', () => {
    render(
      <PathDiagnostics
        graphMode="fallback_linear"
        fallbackReason="Test linear fallback reason."
        activeEdgesCount={0}
        removedEdges={[]}
      />,
    );

    expect(screen.getByText(/Approximate Linear Order/i)).toBeInTheDocument();
    expect(screen.getByText('Test linear fallback reason.')).toBeInTheDocument();
  });
});

describe('PathHeader', () => {
  it('displays honest status counts without comparisons or leaderboards', () => {
    const counts = {
      locked: 2,
      available: 3,
      in_progress: 1,
      review_due: 0,
      mastered: 4,
      total: 10,
    };

    render(
      <PathHeader
        documentTitle="Algorithms 101"
        viewMode="list"
        onViewModeChange={vi.fn()}
        statusCounts={counts}
      />,
    );

    expect(screen.getByText('Algorithms 101')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Mastered')).toBeInTheDocument();
  });
});
