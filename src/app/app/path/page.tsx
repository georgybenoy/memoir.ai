'use client';

/**
 * Study Path View (/app/path)
 * Dual representation of prerequisite DAG: accessible List/Tree view and layered SVG Graph view.
 * Source of truth: DESIGN_DOC §5.3.C, §6.7, PRD FR-04, FR-05
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import {
  type ConceptRecord,
  type DocumentChunkRecord,
  type StudySessionRecord,
  type StudyPathItemRecord,
  type DocumentRecord,
} from '@/types/domain';
import {
  initializeStudyPathForDocument,
  recalculateEligibility,
} from '@/features/study-path/service';
import {
  skipPrerequisites,
} from '@/features/mastery/eligibility';
import {
  buildDependencyGraph,
  type DependencyGraphResult,
} from '@/features/dependency-graph';
import { useSessionStore } from '@/lib/state/session-store';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { PathHeader, type PathViewMode, type StatusCounts } from '@/components/study-path/PathHeader';
import { PathListView } from '@/components/study-path/PathListView';
import { PathGraphView } from '@/components/study-path/PathGraphView';
import { ConceptDetailPanel } from '@/components/study-path/ConceptDetailPanel';
import { PathDiagnostics } from '@/components/study-path/PathDiagnostics';
import { BookOpen, AlertCircle, RefreshCw, Upload } from 'lucide-react';

function StudyPathLoadingFallback() {
  return (
    <WorkspaceLayout>
      <div className="flex h-[calc(100vh-120px)] items-center justify-center text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-accent-cyan" aria-hidden="true" />
          <p className="text-sm font-medium">Constructing prerequisite graph & study path...</p>
        </div>
      </div>
    </WorkspaceLayout>
  );
}

export default function StudyPathPage() {
  return (
    <React.Suspense fallback={<StudyPathLoadingFallback />}>
      <StudyPathContent />
    </React.Suspense>
  );
}

function StudyPathContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDocId = searchParams.get('docId');

  const {
    selectedConceptId,
    setSelectedConceptId,
    learnConcept,
    setActiveDocumentId,
    setSessionId,
  } = useSessionStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PathViewMode>('list');
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [session, setSession] = useState<StudySessionRecord | null>(null);
  const [concepts, setConcepts] = useState<ConceptRecord[]>([]);
  const [chunks, setChunks] = useState<DocumentChunkRecord[]>([]);
  const [graphResult, setGraphResult] = useState<DependencyGraphResult | null>(null);

  // Load study path and related entities
  const loadPathData = useCallback(async () => {
    try {
      const db = await openDatabase(DB_NAME);

      // 1. Identify target document
      let targetDoc: DocumentRecord | null = null;
      if (requestedDocId) {
        targetDoc = (await db.get('documents', requestedDocId)) ?? null;
      }

      if (!targetDoc) {
        // Fallback to most recent completed document
        const allDocs = await db.getAll('documents');
        const completedDocs = allDocs
          .filter((d) => d.analysisStatus === 'completed')
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        if (completedDocs.length > 0) {
          targetDoc = completedDocs[0];
        }
      }

      if (!targetDoc) {
        // No documents analyzed yet
        setLoading(false);
        return;
      }

      setDocument(targetDoc);
      setActiveDocumentId(targetDoc.id);

      // 2. Fetch document chunks
      const docChunks = await db.getAllFromIndex('documentChunks', 'by-document', targetDoc.id);
      docChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      setChunks(docChunks);
      const chunkIds = new Set(docChunks.map((c) => c.id));

      // 3. Fetch concepts associated with these chunks
      const allConcepts = await db.getAll('concepts');
      const docConcepts = allConcepts.filter(
        (c) => c.sourceChunkIds && c.sourceChunkIds.some((id: string) => chunkIds.has(id)),
      );

      if (docConcepts.length === 0) {
        setLoading(false);
        return;
      }

      // 4. Fetch dependencies
      const conceptIds = new Set(docConcepts.map((c) => c.id));
      const allDeps = await db.getAll('conceptDependencies');
      const docDeps = allDeps.filter(
        (d) => conceptIds.has(d.prerequisiteId) && conceptIds.has(d.dependentConceptId),
      );

      // 5. Check if study session & path items already exist
      const allSessions = await db.getAll('studySessions');
      let targetSession = allSessions.find(
        (s) => s.metadata?.documentId === targetDoc!.id || (s.id === targetDoc!.metadata?.sessionId),
      );

      let currentPathItems: StudyPathItemRecord[] = [];

      if (targetSession) {
        currentPathItems = await db.getAllFromIndex('studyPathItems', 'by-session', targetSession.id);
      }

      let activeGraph: DependencyGraphResult;

      if (!targetSession || currentPathItems.length === 0) {
        // Initialize new study path atomically
        const initResult = await initializeStudyPathForDocument({
          documentId: targetDoc.id,
        });
        targetSession = initResult.session;
        currentPathItems = initResult.pathItems;
        activeGraph = initResult.graphResult;
      } else {
        // Build graph from existing entities
        activeGraph = buildDependencyGraph({
          concepts: docConcepts,
          dependencies: docDeps,
          chunks: docChunks,
        });
      }

      setGraphResult(activeGraph);
      setSession(targetSession);
      setSessionId(targetSession.id);

      // Map path item statuses onto concepts
      const statusMap = new Map<string, ConceptRecord['status']>();
      for (const item of currentPathItems) {
        statusMap.set(item.conceptId, item.status);
      }

      const mergedConcepts = docConcepts.map((c) => ({
        ...c,
        status: statusMap.get(c.id) ?? c.status,
      }));

      // Sort concepts in topological order based on graph
      const orderedIds = activeGraph.orderedConcepts.map((c) => c.id);
      const orderMap = new Map<string, number>();
      orderedIds.forEach((id, idx) => orderMap.set(id, idx));

      mergedConcepts.sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? a.extractionOrder;
        const orderB = orderMap.get(b.id) ?? b.extractionOrder;
        return orderA - orderB;
      });

      setConcepts(mergedConcepts);

      // Select default concept if none selected
      if (mergedConcepts.length > 0) {
        const firstAvailable =
          mergedConcepts.find((c) => c.status === 'available' || c.status === 'in_progress') ??
          mergedConcepts[0];
        setSelectedConceptId(firstAvailable.id);
      }
    } catch (err) {
      console.error('Error loading study path:', err);
      setError(err instanceof Error ? err.message : 'Failed to load study path.');
    } finally {
      setLoading(false);
    }
  }, [requestedDocId, setActiveDocumentId, setSessionId, setSelectedConceptId]);

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => {
      if (mounted) {
        void loadPathData();
      }
    });
    return () => {
      mounted = false;
    };
  }, [loadPathData]);

  // Prerequisites map: conceptId -> ConceptRecord[]
  const prerequisitesMap = useMemo(() => {
    const map = new Map<string, ConceptRecord[]>();
    const conceptMap = new Map<string, ConceptRecord>();
    for (const c of concepts) {
      conceptMap.set(c.id, c);
      map.set(c.id, []);
    }

    if (graphResult) {
      for (const edge of graphResult.activeEdges) {
        const prereq = conceptMap.get(edge.prerequisiteId);
        if (prereq && map.has(edge.dependentConceptId)) {
          map.get(edge.dependentConceptId)!.push(prereq);
        }
      }
    }

    return map;
  }, [concepts, graphResult]);

  // Dependents map: conceptId -> ConceptRecord[]
  const dependentsMap = useMemo(() => {
    const map = new Map<string, ConceptRecord[]>();
    const conceptMap = new Map<string, ConceptRecord>();
    for (const c of concepts) {
      conceptMap.set(c.id, c);
      map.set(c.id, []);
    }

    if (graphResult) {
      for (const edge of graphResult.activeEdges) {
        const dep = conceptMap.get(edge.dependentConceptId);
        if (dep && map.has(edge.prerequisiteId)) {
          map.get(edge.prerequisiteId)!.push(dep);
        }
      }
    }

    return map;
  }, [concepts, graphResult]);

  // Status counts for header
  const statusCounts: StatusCounts = useMemo(() => {
    const counts: StatusCounts = {
      locked: 0,
      available: 0,
      in_progress: 0,
      review_due: 0,
      mastered: 0,
      total: concepts.length,
    };

    for (const c of concepts) {
      if (counts[c.status] !== undefined) {
        counts[c.status]++;
      }
    }

    return counts;
  }, [concepts]);

  // Selected concept data for detail panel
  const currentSelectedConcept = useMemo(() => {
    return concepts.find((c) => c.id === selectedConceptId) ?? concepts[0] ?? null;
  }, [concepts, selectedConceptId]);

  const selectedPrereqs = useMemo(() => {
    return currentSelectedConcept ? prerequisitesMap.get(currentSelectedConcept.id) ?? [] : [];
  }, [currentSelectedConcept, prerequisitesMap]);

  const selectedDependents = useMemo(() => {
    return currentSelectedConcept ? dependentsMap.get(currentSelectedConcept.id) ?? [] : [];
  }, [currentSelectedConcept, dependentsMap]);

  const selectedChunks = useMemo(() => {
    if (!currentSelectedConcept) return [];
    const sourceIds = new Set(currentSelectedConcept.sourceChunkIds ?? []);
    return chunks.filter((c) => sourceIds.has(c.id));
  }, [currentSelectedConcept, chunks]);

  const selectedInfluence = useMemo(() => {
    if (!currentSelectedConcept || !graphResult) return 0;
    return graphResult.downstreamInfluence.get(currentSelectedConcept.id) ?? 0;
  }, [currentSelectedConcept, graphResult]);

  // Learn concept action
  const handleLearnConcept = async (conceptId: string) => {
    await learnConcept(conceptId, session?.id);
    router.push('/app/tutor');
  };

  // Skip prerequisites override action
  const handleSkipPrerequisites = async (conceptId: string) => {
    if (!session) return;
    setLoading(true);
    await skipPrerequisites({ conceptId, sessionId: session.id });
    await recalculateEligibility(session.id);
    await loadPathData();
  };

  if (loading) {
    return (
      <WorkspaceLayout>
        <div className="flex h-[calc(100vh-120px)] items-center justify-center text-text-muted">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-accent-cyan" aria-hidden="true" />
            <p className="text-sm font-medium">Constructing prerequisite graph & study path...</p>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  if (error) {
    return (
      <WorkspaceLayout>
        <div className="flex h-[calc(100vh-120px)] items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold text-text-primary">Unable to load study path</h2>
            <p className="mt-1 text-xs text-text-muted">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void loadPathData();
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-surface-elevated px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-card"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Try again</span>
            </button>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  if (!document || concepts.length === 0) {
    return (
      <WorkspaceLayout>
        <div className="flex h-[calc(100vh-120px)] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-border-subtle bg-surface-card p-8 text-center shadow-lg">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-cyan/10 text-accent-cyan">
              <BookOpen className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-text-primary">No Study Path Ready</h2>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              Import lecture notes or course materials to extract atomic concepts, build a deterministic prerequisite graph, and start learning.
            </p>
            <button
              type="button"
              onClick={() => router.push('/app/materials')}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-violet px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-accent-violet-hover active:scale-95 transition-all"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>Import Study Notes</span>
            </button>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout>
      <div className="flex h-[calc(100vh-64px)] flex-col bg-canvas">
        {/* Top Header */}
        <PathHeader
          documentTitle={document.filename}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          statusCounts={statusCounts}
        />

        {/* Main Split Body: Center Canvas + Right Rail Detail Panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left / Center View Area */}
          <main
            className="flex-1 overflow-y-auto"
            role="main"
            aria-label="Study path main view"
          >
            {viewMode === 'list' ? (
              <PathListView
                concepts={concepts}
                prerequisitesMap={prerequisitesMap}
                selectedConceptId={selectedConceptId}
                onSelectConcept={setSelectedConceptId}
                onLearnConcept={handleLearnConcept}
              />
            ) : (
              <div className="p-4 sm:p-6">
                <PathGraphView
                  concepts={concepts}
                  activeEdges={graphResult?.activeEdges ?? []}
                  selectedConceptId={selectedConceptId}
                  onSelectConcept={setSelectedConceptId}
                  onSwitchToList={() => setViewMode('list')}
                />
              </div>
            )}

            {/* Bottom Diagnostics Accordion */}
            {graphResult && (
              <PathDiagnostics
                graphMode={graphResult.graphMode}
                fallbackReason={graphResult.diagnostics.fallbackReason}
                activeEdgesCount={graphResult.activeEdges.length}
                removedEdges={graphResult.removedEdges}
                cyclesDetectedCount={graphResult.diagnostics.cyclesDetectedCount}
              />
            )}
          </main>

          {/* Right Rail Concept Detail Panel */}
          <aside className="w-80 sm:w-96 shrink-0 hidden md:block">
            <ConceptDetailPanel
              concept={currentSelectedConcept}
              prerequisites={selectedPrereqs}
              dependents={selectedDependents}
              sourceChunks={selectedChunks}
              downstreamInfluence={selectedInfluence}
              onSelectConcept={setSelectedConceptId}
              onLearnConcept={handleLearnConcept}
              onSkipPrerequisites={handleSkipPrerequisites}
              onClose={() => setSelectedConceptId(null)}
            />
          </aside>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
