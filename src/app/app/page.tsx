'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WorkspaceLayout } from '@/components/workspace/layout';
import { Container } from '@/components/ui/container';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TeacherAvatar } from '@/components/avatar';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';
import { useReviewStore } from '@/lib/state/review-store';
import {
  type DocumentRecord,
  type ConceptRecord,
  type StudySessionRecord,
  type MasteryStateRecord,
} from '@/types/domain';
import {
  BookOpen,
  Network,
  Clock,
  Sparkles,
  ArrowRight,
  Brain,
  Upload,
  ChevronRight,
} from 'lucide-react';

export default function StudyDashboardPage() {
  const router = useRouter();
  const { totalDueCount, weakCount } = useReviewStore();

  const [loading, setLoading] = React.useState(true);
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [concepts, setConcepts] = React.useState<ConceptRecord[]>([]);
  const [masteryStates, setMasteryStates] = React.useState<MasteryStateRecord[]>([]);
  const [activeSession, setActiveSession] = React.useState<StudySessionRecord | null>(null);
  const [continueConcept, setContinueConcept] = React.useState<ConceptRecord | null>(null);

  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const db = await openDatabase(DB_NAME);
        const docs = await db.getAll('documents');
        const concs = await db.getAll('concepts');
        const masteries = await db.getAll('masteryStates');
        const sessions = await db.getAll('studySessions');

        if (!mounted) return;

        setDocuments(docs);
        setConcepts(concs);
        setMasteryStates(masteries);

        let chosen: ConceptRecord | null = null;
        if (sessions.length > 0) {
          const sorted = [...sessions].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          setActiveSession(sorted[0]);

          if (sorted[0].currentConceptId) {
            chosen = concs.find((item) => item.id === sorted[0].currentConceptId) ?? null;
          }
        }

        if (!chosen && concs.length > 0) {
          const inProgress = concs.find((c) => c.status === 'in_progress');
          const available = concs.find((c) => c.status === 'available');
          chosen = inProgress ?? available ?? concs[0];
        }

        setContinueConcept(chosen);
      } catch (err) {
        console.warn('Failed to load study dashboard data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const masteredCount = masteryStates.filter((m) => m.level >= 4).length;
  const inProgressCount = concepts.filter(
    (c) => c.status === 'in_progress' || c.status === 'review_due',
  ).length;

  const hasContent = documents.length > 0 || concepts.length > 0;

  return (
    <WorkspaceLayout>
      <Container size="workspace" className="py-4 sm:py-6 space-y-6 max-w-5xl">
        {/* Workspace Greeting Header */}
        <header
          aria-labelledby="dashboard-greeting"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[var(--border-color)] bg-[var(--surface)]/80 backdrop-blur-xs"
        >
          <div className="flex items-center gap-4">
            <TeacherAvatar expression={totalDueCount > 0 ? 'Reminder' : 'Greeting'} size="lg" />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-blue)]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>EduMentor Study Space</span>
              </div>
              <h1
                id="dashboard-greeting"
                className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]"
              >
                What are you learning today?
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                {totalDueCount > 0
                  ? `You have ${totalDueCount} concept review${totalDueCount > 1 ? 's' : ''} scheduled for today.`
                  : 'Your learning records are stored locally and ready for practice.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push('/app/materials')}
              className="text-xs h-9 px-3.5"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              <span>Import Notes</span>
            </Button>
          </div>
        </header>

        {/* Empty State when no notes imported yet */}
        {!loading && !hasContent && (
          <EmptyState
            icon={BookOpen}
            title="Your learning space starts here"
            description="Import a set of lecture notes, slides, or chapters to generate a structured concept map and active recall practice."
            action={
              <Button
                variant="primary"
                onClick={() => router.push('/app/materials')}
                className="text-sm px-4"
              >
                <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                <span>Import Study Material</span>
              </Button>
            }
          />
        )}

        {hasContent && (
          <>
            {/* Primary Study Actions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Continue Learning Card */}
              <Card className="flex flex-col justify-between border-[var(--primary)]/30 bg-[var(--surface-raised)]/90 shadow-sm md:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between text-xs text-[var(--primary)] font-semibold mb-1">
                    <span className="flex items-center gap-1.5">
                      <Brain className="h-4 w-4" aria-hidden="true" />
                      <span>Recommended Next Step</span>
                    </span>
                    {continueConcept && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--primary)]/15 border border-[var(--primary)]/30">
                        Tier {continueConcept.tier}
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-lg text-[var(--text-primary)]">
                    {continueConcept ? continueConcept.title : 'Active Recall Practice'}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {continueConcept
                      ? continueConcept.summary
                      : 'Pick up where you left off with guided Socratic recall.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] flex items-center justify-between">
                    <span>
                      {continueConcept?.status === 'review_due'
                        ? 'Due for revision review'
                        : continueConcept?.status === 'in_progress'
                          ? 'In progress — recall tested'
                          : 'Available for study'}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {activeSession ? 'Session Active' : 'Ready'}
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button
                    variant="primary"
                    onClick={() => router.push('/app/tutor')}
                    className="w-full justify-between"
                  >
                    <span>Continue learning</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </CardFooter>
              </Card>

              {/* Review Queue Summary Card */}
              <Card className="flex flex-col justify-between border-[var(--border-color)] bg-[var(--surface)]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between text-xs text-[var(--accent-orange)] font-semibold mb-1">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>Spaced Review</span>
                    </span>
                    {totalDueCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--danger)]/15 text-[var(--danger)] font-bold text-[10px]">
                        {totalDueCount} due
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-base text-[var(--text-primary)]">Review Queue</CardTitle>
                  <CardDescription>
                    {totalDueCount > 0
                      ? `${totalDueCount} item${totalDueCount > 1 ? 's' : ''} require retention review today.`
                      : 'You are all caught up! No due reviews right now.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2 text-xs text-[var(--text-secondary)] space-y-2">
                  {weakCount > 0 && (
                    <div className="p-2 rounded bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[var(--warning)]">
                      {weakCount} concept{weakCount > 1 ? 's' : ''} flagged for revision refresher.
                    </div>
                  )}
                  <p className="text-[var(--text-muted)] text-[11px]">
                    SM-2 spacing schedules reviews at optimal intervals to prevent memory decay.
                  </p>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button
                    variant={totalDueCount > 0 ? 'secondary' : 'ghost'}
                    onClick={() => router.push('/app/review')}
                    className="w-full justify-between text-xs"
                  >
                    <span>{totalDueCount > 0 ? 'Review now' : 'Inspect queue'}</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </CardFooter>
              </Card>
            </div>

            {/* Genuine Local Stats Banner (No fake metrics) */}
            <section aria-label="Learning progress summary" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-center">
                <span className="text-xs text-[var(--text-muted)] block">Discovered</span>
                <span className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] block mt-0.5">
                  {concepts.length}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">Concepts</span>
              </div>
              <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-center">
                <span className="text-xs text-[var(--text-muted)] block">In Progress</span>
                <span className="text-xl sm:text-2xl font-bold text-[var(--accent-blue)] block mt-0.5">
                  {inProgressCount}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">Active</span>
              </div>
              <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-center">
                <span className="text-xs text-[var(--text-muted)] block">Mastered</span>
                <span className="text-xl sm:text-2xl font-bold text-[var(--success)] block mt-0.5">
                  {masteredCount}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">Proficient / Mastered</span>
              </div>
              <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] text-center">
                <span className="text-xs text-[var(--text-muted)] block">Due Today</span>
                <span className="text-xl sm:text-2xl font-bold text-[var(--accent-orange)] block mt-0.5">
                  {totalDueCount}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">Spaced reviews</span>
              </div>
            </section>

            {/* Quick Links & Recent Materials Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Recent Materials */}
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
                    <span>Recent Study Materials</span>
                  </h2>
                  <Link
                    href="/app/materials"
                    className="text-xs text-[var(--accent-blue)] hover:underline font-medium"
                  >
                    View all &rarr;
                  </Link>
                </div>

                {documents.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-4 text-center">
                    No documents imported yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {documents.slice(0, 3).map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <strong className="text-[var(--text-primary)] truncate block">
                            {doc.filename}
                          </strong>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {(doc.fileSize / 1024).toFixed(1)} KB • {doc.analysisStatus}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-secondary)]">
                          {doc.fileType.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Study Path Concept Map Quick Access */}
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <Network className="h-4 w-4 text-[var(--accent-cyan)]" aria-hidden="true" />
                      <span>Dependency Concept Graph</span>
                    </h2>
                    <Link
                      href="/app/path"
                      className="text-xs text-[var(--accent-blue)] hover:underline font-medium"
                    >
                      Open graph &rarr;
                    </Link>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Explore prerequisites, view topological dependency tiers, and track mastery progression through your structured syllabus.
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/app/path')}
                    className="w-full text-xs justify-between"
                  >
                    <span>Explore Learning Path</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </Container>
    </WorkspaceLayout>
  );
}
