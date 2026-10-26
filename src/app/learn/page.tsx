'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  BookOpen,
  Plus,
  Play,
  Clock,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Trash2,
} from 'lucide-react';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getStorage } from '@/lib/db/bootstrap';
import { formatBytes } from '@/lib/config/ingestion';
import { deriveStepForMaterial } from '@/features/workflow/step-guard';
import {
  type DocumentRecord,
  type StudySessionRecord,
  type MaterialProcessingRecord,
} from '@/types/domain';
import { executeDeleteMaterialCascade } from '@/features/learning-units/reprocess-replace';

export default function LearnHomePage() {
  const router = useRouter();

  const [materials, setMaterials] = React.useState<DocumentRecord[]>([]);
  const [activeSessions, setActiveSessions] = React.useState<StudySessionRecord[]>([]);
  const [processingMap, setProcessingMap] = React.useState<Record<string, MaterialProcessingRecord>>({});
  const [unitCountMap, setUnitCountMap] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);

  // Load materials, sessions, and units from IndexedDB
  const loadData = React.useCallback(async () => {
    try {
      const repos = getStorage();
      const [allDocs, allSessions, allUnits] = await Promise.all([
        repos.documents.list(),
        repos.sessions.list(),
        repos.learningUnits.list(),
      ]);

      // Filter active (un-ended) sessions
      const openSessions = allSessions.filter((s) => !s.endedAt);
      openSessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      setActiveSessions(openSessions);

      // Sort docs by newest first
      allDocs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMaterials(allDocs);

      // Units count per material
      const uMap: Record<string, number> = {};
      for (const u of allUnits) {
        uMap[u.materialId] = (uMap[u.materialId] ?? 0) + 1;
      }
      setUnitCountMap(uMap);

      // Processing status per material
      const pMap: Record<string, MaterialProcessingRecord> = {};
      for (const doc of allDocs) {
        const p = await repos.processing.getByMaterial(doc.id);
        if (p) pMap[doc.id] = p;
      }
      setProcessingMap(pMap);
    } catch (err) {
      console.error('Failed to load learn home data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      if (mounted) {
        await loadData();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadData]);

  // Primary action: Start Learning (opens Step 1 or Step 3 for the most recent ready material)
  const handleStartLearning = async () => {
    if (materials.length === 0) {
      router.push('/learn/new');
      return;
    }
    const repos = getStorage();
    const dest = await deriveStepForMaterial(materials[0].id, repos);
    router.push(dest.route);
  };

  // Open material at its derived step
  const handleOpenMaterial = async (materialId: string) => {
    const repos = getStorage();
    const dest = await deriveStepForMaterial(materialId, repos);
    router.push(dest.route);
  };

  // Delete material cascade
  const handleDeleteMaterial = async (materialId: string, filename: string) => {
    if (!window.confirm(`Delete "${filename}" and its associated learning units and attempts?`)) {
      return;
    }
    try {
      const repos = getStorage();
      await executeDeleteMaterialCascade(materialId, repos);
      await loadData();
    } catch (err) {
      console.error('Failed to delete material:', err);
    }
  };

  return (
    <WorkspaceLayout>
      <main id="learn-home-content" className="flex-1 focus:outline-none" tabIndex={-1}>
        <Container size="workspace" className="py-6 sm:py-8 space-y-8 max-w-5xl">
          {/* Header & Primary CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-color)]">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                My Learning Journey
              </h1>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                Your material-centred study dashboard. Upload notes, organise units, and practice with AI.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                onClick={handleStartLearning}
                className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center gap-2 shadow-sm font-semibold"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Start Learning</span>
              </Button>
              <Link href="/learn/new">
                <Button
                  variant="secondary"
                  size="lg"
                  className="border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--primary)] flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Add Material</span>
                </Button>
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" aria-label="Loading study materials" />
              <span className="text-sm text-[var(--text-secondary)]">Loading your library...</span>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Resume Active Sessions Section */}
              {activeSessions.length > 0 && (
                <section aria-labelledby="active-sessions-heading" className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[var(--accent-blue)]" aria-hidden="true" />
                    <h2 id="active-sessions-heading" className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                      Resume Study Sessions
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeSessions.map((session) => {
                      const doc = materials.find((m) => m.id === session.materialId);
                      return (
                        <div
                          key={session.id}
                          className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4 flex items-center justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <h3 className="font-semibold text-sm text-[var(--text-primary)] truncate">
                              {doc?.filename ?? 'Study Session'}
                            </h3>
                            <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                              <span>Started {new Date(session.startedAt).toLocaleDateString()}</span>
                              {session.draftAnswer && (
                                <span className="text-[var(--accent-cyan)] font-medium">&bull; Draft saved</span>
                              )}
                            </div>
                          </div>

                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => router.push(`/learn/${session.materialId}/session/${session.id}`)}
                            className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] shrink-0 text-xs"
                          >
                            <Play className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                            <span>Resume</span>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Study Materials Library */}
              <section aria-labelledby="study-materials-heading" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
                    <h2 id="study-materials-heading" className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                      Saved Study Materials
                    </h2>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {materials.length} {materials.length === 1 ? 'material' : 'materials'} stored locally
                  </span>
                </div>

                {materials.length === 0 ? (
                  <Card className="border-[var(--border-color)] bg-[var(--surface)] text-center p-8 space-y-4">
                    <div className="p-3 w-fit rounded-full bg-[var(--primary)]/10 text-[var(--primary)] mx-auto">
                      <BookOpen className="h-8 w-8" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">No study materials yet</h3>
                      <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
                        Add your first lecture notes, PDF, or Markdown file to build your guided learning path.
                      </p>
                    </div>
                    <div>
                      <Link href="/learn/new">
                        <Button variant="primary" className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]">
                          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                          <span>Add Study Material</span>
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {materials.map((m) => {
                      const proc = processingMap[m.id];
                      const unitCount = unitCountMap[m.id] ?? 0;
                      const isComplete = proc?.stage === 'COMPLETE' || m.analysisStatus === 'completed';
                      const isFailed = proc?.stage === 'FAILED';

                      return (
                        <div
                          key={m.id}
                          className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] p-5 transition-all flex flex-col justify-between gap-4"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 text-[var(--primary)] shrink-0" aria-hidden="true" />
                                <h3 className="font-semibold text-base text-[var(--text-primary)] truncate" title={m.filename}>
                                  {m.filename}
                                </h3>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteMaterial(m.id, m.filename)}
                                className="h-7 w-7 p-0 text-[var(--text-muted)] hover:text-[var(--danger)]"
                                aria-label={`Delete ${m.filename}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                              <span>{formatBytes(m.fileSize)}</span>
                              <span>&bull;</span>
                              <span>{unitCount} {unitCount === 1 ? 'unit' : 'units'}</span>
                              <span>&bull;</span>
                              <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                            </div>

                            <div className="pt-1">
                              {isComplete ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-green)]/15 text-[var(--accent-green)] border border-[var(--accent-green)]/30">
                                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                  Ready to Study
                                </span>
                              ) : isFailed ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--danger)]/15 text-[var(--danger)] border border-[var(--danger)]/30">
                                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                                  Analysis Incomplete
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30">
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                  Processing: {proc?.stage ?? 'INITIALIZING'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-color)]">
                            <Link
                              href={`/learn/${m.id}/organise`}
                              className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                            >
                              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>View Units</span>
                            </Link>

                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenMaterial(m.id)}
                              className="text-xs bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center gap-1"
                            >
                              <span>{isComplete ? 'Choose Mode' : 'Resume'}</span>
                              <ArrowRight className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </Container>
      </main>
    </WorkspaceLayout>
  );
}
