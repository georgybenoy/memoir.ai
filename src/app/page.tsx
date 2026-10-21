'use client';

import * as React from 'react';
import { FileUp, Network, Clock, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';
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
import { useWorkspaceStore } from '@/lib/state/workspace-store';
import { SettingsView } from '@/components/settings/settings-view';

export default function Home() {
  const { activeView, setActiveView, addToast } = useWorkspaceStore();

  const handleActionNotice = (actionName: string) => {
    addToast({
      type: 'info',
      title: `${actionName} selected`,
      description: 'Domain feature will be unlocked in upcoming phases.',
    });
  };

  return (
    <WorkspaceLayout>
      <Container size="workspace" className="py-2 sm:py-4">
        {activeView === 'settings' ? (
          <SettingsView />
        ) : (
          <>
            {/* Workspace Greeting & Hero Banner */}
        <section aria-labelledby="workspace-heading" className="mb-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--accent-blue)]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Browser-Local AI Tutor</span>
            </div>
            <h1
              id="workspace-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[var(--text-primary)]"
            >
              What are you learning today?
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              Transform your lecture notes, textbook chapters, and slides into an interactive study
              path with guided Socratic recall and spaced repetition.
            </p>
          </div>
        </section>

        {/* Action Cards Grid */}
        <section
          aria-label="Quick study actions"
          className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8"
        >
          {/* Card 1: Import Notes */}
          <Card className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] mb-2">
                <FileUp className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle>Import Study Material</CardTitle>
              <CardDescription>
                Upload PDF, Markdown, or text documents to extract concepts and prerequisites.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--text-muted)]">
                Local parsing keeps documents private on your machine.
              </p>
            </CardContent>
            <CardFooter>
              <Button
                variant="primary"
                onClick={() => {
                  setActiveView('materials');
                  handleActionNotice('Study Materials');
                }}
                className="w-full justify-between"
              >
                <span>Import notes</span>
                <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
              </Button>
            </CardFooter>
          </Card>

          {/* Card 2: Concept Map */}
          <Card className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] mb-2">
                <Network className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle>Explore Concept Graph</CardTitle>
              <CardDescription>
                View prerequisite dependencies and follow recommended study tiers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--text-muted)]">
                Visualize connections between foundational and advanced topics.
              </p>
            </CardContent>
            <CardFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveView('concepts');
                  handleActionNotice('Concept Graph');
                }}
                className="w-full justify-between"
              >
                <span>View concepts</span>
                <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
              </Button>
            </CardFooter>
          </Card>

          {/* Card 3: Spaced Review */}
          <Card className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] mb-2">
                <Clock className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle>Due Reviews</CardTitle>
              <CardDescription>
                Test your understanding with active recall calibrated by SM-2 spacing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--text-muted)]">
                Strengthen memory retention before decay sets in.
              </p>
            </CardContent>
            <CardFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveView('review');
                  handleActionNotice('Spaced Review');
                }}
                className="w-full justify-between"
              >
                <span>Check reviews</span>
                <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
              </Button>
            </CardFooter>
          </Card>
        </section>

        {/* Privacy & Architecture Guarantee Banner */}
        <section aria-labelledby="privacy-heading">
          <Card className="border-[var(--border-color)] bg-[var(--surface-raised)]/40 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--success)]/15 text-[var(--success)]">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex-1 space-y-1">
                <h2
                  id="privacy-heading"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Local-first privacy architecture
                </h2>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Your notes, mastery scores, and study history persist exclusively inside your
                  browser profile via IndexedDB. Only explicit AI tutoring queries are sent to
                  Google Gemini through secure server routes.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveView('settings');
                  handleActionNotice('Data & Settings');
                }}
                className="text-xs text-[var(--accent-blue)] shrink-0"
              >
                Data settings
              </Button>
            </div>
          </Card>
        </section>
      </>
    )}
  </Container>
</WorkspaceLayout>
  );
}
