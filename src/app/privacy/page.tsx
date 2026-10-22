import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, HardDrive, Cpu, Download, Bell, Lock, ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Privacy Notice — EduMentor',
  description:
    'Understand how EduMentor handles your notes, learning data, and AI interactions across local browser storage and the Gemini service.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-[var(--border-color)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-50">
        <Container size="landing" className="h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-lg tracking-tight text-[var(--text-primary)] hover:opacity-90 transition-opacity"
            aria-label="EduMentor home"
          >
            <div className="h-8 w-8 rounded-lg bg-[var(--primary)] flex items-center justify-center text-white font-black text-sm">
              E
            </div>
            <span>EduMentor</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Landing Page
              </Button>
            </Link>
            <Link href="/app">
              <Button variant="primary" size="sm" className="text-xs">
                <span>Open Workspace</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </Container>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 py-10 sm:py-16">
        <Container size="landing" className="max-w-4xl space-y-10">
          {/* Header Title */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--primary)]/15 text-[var(--primary-hover)] text-xs font-medium border border-[var(--primary)]/30">
              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Transparent Architecture & Data Protection</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
              Privacy Notice & Data Boundaries
            </h1>
            <p className="text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
              EduMentor is engineered from the ground up as a browser-local learning application.
              Here is an exact, unvarnished explanation of where your notes live, what is sent to AI
              services, and how your data is retained.
            </p>
          </div>

          {/* Section 1: Browser-Local Storage */}
          <Card className="border-[var(--border-color)] bg-[var(--surface)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-[var(--primary)]">
                <HardDrive className="h-5 w-5" aria-hidden="true" />
                <CardTitle className="text-lg">1. Browser-Local Storage (IndexedDB)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p>
                When you import study materials (PDF, Markdown, or plain text) or practice recall
                questions, your notes, extracted concept DAGs, conversation transcripts, and SM-2
                spaced repetition schedules are stored locally inside your browser profile via{' '}
                <strong className="text-[var(--text-primary)]">IndexedDB</strong>.
              </p>
              <div className="rounded-[10px] bg-[var(--surface-raised)] border border-[var(--border-color)] p-4 text-xs space-y-2">
                <p className="font-semibold text-[var(--warning)]">
                  Important Security &amp; Device Boundary Notice:
                </p>
                <p>
                  IndexedDB is standard browser storage. It is{' '}
                  <strong className="text-[var(--text-primary)]">not an encrypted vault</strong>.
                  Anyone who has access to your physical computer, user account, or browser profile
                  can inspect local storage. If you share a computer with others, ensure your
                  operating system profile is protected.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: AI Processing Boundary */}
          <Card className="border-[var(--border-color)] bg-[var(--surface)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-[var(--accent-blue)]">
                <Cpu className="h-5 w-5" aria-hidden="true" />
                <CardTitle className="text-lg">2. AI Processing &amp; The Google Gemini Boundary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p>
                EduMentor does not run deep generative large language models inside your browser.
                Instead, AI features use the official Google Gemini API via secure server-side route
                handlers.
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[var(--text-secondary)]">
                <li>
                  <strong className="text-[var(--text-primary)]">User-Triggered Only:</strong> Data is
                  only sent to Gemini when you explicitly initiate an action — such as analyzing notes,
                  asking a tutor question, requesting a practice question, or submitting an answer.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Chunked Excerpts:</strong> We send only
                  the relevant text excerpts required to ground the specific question or explanation,
                  rather than dumping your entire document library.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Zero Server Persistence:</strong> Our
                  server-side route handlers are completely stateless. They proxy the request to
                  Gemini and return the structured response to your browser. No server database, user
                  profile, or file cache exists on our backend.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Protected API Keys:</strong> The
                  Gemini API key is kept strictly as a server environment secret (`GEMINI_API_KEY`).
                  It is never exposed in client bundles and never saved in your browser.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Section 3: Data Portability & Deletion */}
          <Card className="border-[var(--border-color)] bg-[var(--surface)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-[var(--accent-cyan)]">
                <Download className="h-5 w-5" aria-hidden="true" />
                <CardTitle className="text-lg">3. Data Portability, Backups &amp; Deletion</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p>
                Because EduMentor does not maintain a server-side account for you, you own and
                control your data completely:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[var(--text-secondary)]">
                <li>
                  <strong className="text-[var(--text-primary)]">No Automatic Sync:</strong> Progress
                  does not automatically synchronize between different computers, mobile phones, or
                  browser profiles.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">JSON Backups:</strong> In Data &amp;
                  Settings, you can export a complete JSON snapshot of all your notes, concept graphs,
                  and SM-2 review progress at any time, and import it into another browser.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Permanent Deletion:</strong> You can
                  permanently wipe all stored documents, extracted concepts, and review history with a
                  single confirmed action in Data &amp; Settings.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Section 4: Notifications & Reminders */}
          <Card className="border-[var(--border-color)] bg-[var(--surface)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-[var(--warning)]">
                <Bell className="h-5 w-5" aria-hidden="true" />
                <CardTitle className="text-lg">4. Review Reminders &amp; Notification Limits</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p>
                EduMentor includes an optional spaced repetition reminder feature using the standard
                browser Notification API.
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Notification permission is never requested on page load — only when you explicitly
                turn on the notification toggle in Settings. Because EduMentor has no background
                cloud server, notification relays, or cron daemon, notifications are{' '}
                <strong className="text-[var(--text-primary)]">best-effort</strong> and can only fire
                while EduMentor is open or active in your browser.
              </p>
            </CardContent>
          </Card>

          {/* Section 5: Tracking & Analytics */}
          <Card className="border-[var(--border-color)] bg-[var(--surface)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-[var(--success)]">
                <Lock className="h-5 w-5" aria-hidden="true" />
                <CardTitle className="text-lg">5. Zero Advertising &amp; No Third-Party Trackers</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p>
                EduMentor does not contain any third-party advertising, commercial tracking scripts,
                or telemetry trackers. We do not sell, rent, or profile your study behavior.
              </p>
            </CardContent>
          </Card>

          {/* Bottom Action Footer */}
          <div className="pt-6 border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-[var(--text-muted)] text-center sm:text-left">
              Questions or need to manage your local storage? Visit the in-app settings.
            </div>
            <div className="flex gap-3">
              <Link href="/app/settings">
                <Button variant="secondary" size="sm">
                  Data &amp; Settings
                </Button>
              </Link>
              <Link href="/app">
                <Button variant="primary" size="sm">
                  Go to Study Workspace
                </Button>
              </Link>
            </div>
          </div>
        </Container>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-color)] bg-[var(--surface)] py-6 text-center text-xs text-[var(--text-muted)]">
        <Container size="landing">
          <p>© {new Date().getFullYear()} EduMentor. Browser-local AI learning assistant.</p>
        </Container>
      </footer>
    </div>
  );
}
