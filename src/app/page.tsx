'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  Network,
  Sparkles,
  CheckCircle2,
  Clock,
  BarChart3,
  HardDrive,
  Cpu,
  ChevronDown,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TeacherAvatar } from '@/components/avatar';
import { ThemeToggle } from '@/components/theme';

const FAQ_ITEMS = [
  {
    id: 'faq-1',
    question: 'Which file types can I import?',
    answer:
      'EduMentor supports text-based PDF documents, plain text (.txt), and Markdown (.md) files up to 25 MiB. Uploaded files are parsed locally in your browser. Note that scanned, image-only PDFs without an embedded text layer require OCR before importing.',
  },
  {
    id: 'faq-2',
    question: 'Where is my learning history stored?',
    answer:
      'All notes, concept graphs, recall attempts, and review schedules are stored directly in your browser using IndexedDB. No external account or server-side database is used to store your learning records.',
  },
  {
    id: 'faq-3',
    question: 'Will my progress sync to another device?',
    answer:
      'Progress does not sync automatically across devices. Because EduMentor does not have user accounts or a cloud database, your data remains on the device and browser where you studied. You can transfer your data anytime using the JSON backup export and import features in Data & Settings.',
  },
  {
    id: 'faq-4',
    question: 'What happens if the AI service is unavailable?',
    answer:
      'If the Gemini API service is unreachable or rate-limited, EduMentor preserves your saved documents, concept maps, and review schedules. You can still inspect your notes, view prerequisite relationships, and practice recall questions using deterministic templates.',
  },
  {
    id: 'faq-5',
    question: 'Can I export or delete my data?',
    answer:
      'Yes. You have complete control over your data. In Data & Settings, you can download a full JSON backup of your workspace at any time, or permanently delete all local records with a single confirmed action.',
  },
  {
    id: 'faq-6',
    question: 'How does spaced repetition work?',
    answer:
      'EduMentor uses the SuperMemo SM-2 algorithm to compute optimal review intervals. When you answer recall questions, the system calculates a quality grade and schedules your next review date (from 1 day up to weeks later). Reviews that are due are surfaced automatically on your study dashboard.',
  },
  {
    id: 'faq-7',
    question: 'Can AI feedback make mistakes?',
    answer:
      'Yes. While AI tutoring responses and evaluation rubrics are grounded in your uploaded source notes, AI models can occasionally misinterpret nuances or make factual errors. Scores and feedback should be used as study guidance rather than authoritative academic grading.',
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = React.useState<string | null>(null);

  const toggleFaq = (id: string) => {
    setOpenFaq((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col relative selection:bg-[var(--primary)] selection:text-white">
      {/* Background Atmosphere: Radial gradients + subtle low-opacity grid texture */}
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-30"
        aria-hidden="true"
      >
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_center,_var(--primary)_0%,_transparent_70%)] blur-[120px] opacity-25" />
        <div className="absolute top-[40%] right-[-10%] w-[600px] h-[600px] bg-[radial-gradient(circle,_var(--accent-blue)_0%,_transparent_70%)] blur-[140px] opacity-20" />
        <div className="absolute top-[70%] left-[-10%] w-[600px] h-[600px] bg-[radial-gradient(circle,_var(--primary)_0%,_transparent_70%)] blur-[140px] opacity-15" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--text-primary) 1px, transparent 1px), linear-gradient(to bottom, var(--text-primary) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Skip link for keyboard accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Navigation */}
      <header className="border-b border-[var(--border-color)] bg-[var(--surface)]/85 backdrop-blur-md sticky top-0 z-50">
        <Container size="landing" className="h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-bold text-lg tracking-tight text-[var(--text-primary)] hover:opacity-90 transition-opacity"
          >
            <Image
              src="/logo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
              aria-hidden="true"
              priority
            />
            <span className="text-lg tracking-tight font-extrabold text-[var(--text-primary)]">
              EduMentor
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm">
            <a
              href="#how-it-works"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              How it works
            </a>
            <a
              href="#learning-tools"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Learning tools
            </a>
            <Link
              href="/privacy"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Privacy
            </Link>
            <a
              href="#faq"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/learn">
              <Button variant="primary" size="sm" className="h-9 px-4 font-semibold text-xs">
                <span>Start learning</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </Container>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 z-10 relative">
        {/* Hero Section */}
        <section aria-labelledby="hero-heading" className="py-16 sm:py-24 lg:py-32">
          <Container size="landing" className="text-center space-y-8 max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--border-color)] text-xs text-[var(--accent-blue)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Browser-local Socratic learning studio</span>
            </div>

            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.15] text-[var(--text-primary)]"
            >
              Learn deeply.{' '}
              <span className="bg-gradient-to-r from-[var(--primary)] via-[var(--primary-hover)] to-[var(--accent-blue)] bg-clip-text text-transparent">
                Remember longer.
              </span>
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
              Turn your notes into a guided learning path with an AI tutor, grounded practice
              questions, and smart review sessions.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-2">
              <Link href="/learn" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto h-12 px-6 font-semibold text-sm shadow-md shadow-[var(--primary)]/20"
                >
                  <span>Start learning</span>
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
                </Button>
              </Link>
              <a href="#how-it-works" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto h-12 px-6 font-medium text-sm"
                >
                  See how it works
                </Button>
              </a>
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              No login required. Works entirely in your browser with private IndexedDB storage.
            </p>
          </Container>
        </section>

        {/* Product Preview Section (Authentic components with labelled sample data) */}
        <section aria-labelledby="preview-heading" className="pb-20 sm:pb-28">
          <Container size="landing">
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface)]/90 backdrop-blur-md p-4 sm:p-6 lg:p-8 shadow-2xl relative overflow-hidden">
              {/* Sample Data Badge */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[var(--success)]" />
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Interactive Workspace Preview
                  </span>
                </div>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--accent-cyan)]">
                  Sample data • Real workspace components
                </span>
              </div>

              {/* Mock Workspace Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
                {/* Left column: Concept Path */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        Learning Path
                      </span>
                      <span className="text-[11px] text-[var(--accent-blue)]">Tier 1 mechanism</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] text-xs border border-[var(--border-color)]">
                        <span className="text-[var(--text-secondary)]">1. Glycolysis</span>
                        <span className="text-[10px] text-[var(--success)] font-semibold flex items-center gap-1">
                          <Check className="h-3 w-3" /> Mastered
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] text-xs border border-[var(--border-color)]">
                        <span className="text-[var(--text-secondary)]">2. Krebs Cycle</span>
                        <span className="text-[10px] text-[var(--success)] font-semibold flex items-center gap-1">
                          <Check className="h-3 w-3" /> Mastered
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-hover)] text-xs border border-[var(--primary)] font-medium">
                        <span className="text-[var(--text-primary)]">3. ATP Synthase</span>
                        <span className="text-[10px] text-[var(--accent-cyan)] font-semibold">
                          Active study
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface)] text-xs border border-[var(--border-color)]">
                        <span className="text-[var(--text-secondary)]">4. Oxidative Phosphorylation</span>
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Locked</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]/40 p-3.5 text-xs text-[var(--text-muted)] space-y-1.5">
                    <div className="font-semibold text-[var(--text-primary)]">Study Source</div>
                    <div className="truncate text-[var(--text-secondary)]">
                      📄 Biochemistry_Ch9_Respiration.pdf (42 chunks)
                    </div>
                  </div>
                </div>

                {/* Center / Right column: Socratic Tutor & Recall Question */}
                <div className="lg:col-span-8 space-y-4">
                  {/* Tutor Dialog Bubble with TeacherAvatar */}
                  <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <TeacherAvatar expression="Explaining" size="sm" showBadge={false} />
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          Socratic Mentor
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Teaching concept: ATP Synthase Mechanism
                        </div>
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed pl-10 border-l-2 border-[var(--primary)]/40">
                      &ldquo;Think about the proton electrochemical gradient built across the inner
                      mitochondrial membrane. When H⁺ ions flow through the F₀ rotor, how does that
                      mechanical movement cause conformational changes in the F₁ head to synthesize
                      ATP from ADP and Pi?&rdquo;
                    </p>
                  </div>

                  {/* Recall Question & Evaluation Card */}
                  <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]/70 p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--accent-blue)]">
                        Active Recall Question
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-muted)]">
                        Difficulty Level 3
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-[var(--text-primary)]">
                      Explain how the proton-motive force powers the rotation of the c-ring in ATP
                      synthase.
                    </p>
                    <div className="rounded-lg bg-[var(--surface)] p-3 border border-[var(--border-color)] text-xs space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-[var(--success)]">
                          Feedback: Quality Grade 4 (Good Recall)
                        </span>
                        <span className="text-[var(--text-muted)]">Next review: in 6 days</span>
                      </div>
                      <p className="text-[var(--text-secondary)] leading-relaxed">
                        Strong answer. You accurately captured how protonation of aspartate residues
                        drives rotation through the stator channel. Next, review prerequisite
                        chemiosmosis to cement electron transport linkage.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* How It Works Section */}
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="py-16 sm:py-24 border-t border-[var(--border-color)] bg-[var(--surface)]/30"
        >
          <Container size="landing" className="space-y-12">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
                The Study Method
              </span>
              <h2
                id="how-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]"
              >
                How it works
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                Three disciplined steps designed to turn passive reading into lasting recall.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
              {/* Step 1 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] p-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="h-12 w-12 rounded-xl bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center font-black text-lg">
                    1
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    Bring your notes
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Import supported study material. Drop in PDF lecture slides, textbook chapters,
                    or Markdown files. Text is parsed and chunked locally on your machine.
                  </p>
                </div>
              </Card>

              {/* Step 2 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] p-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="h-12 w-12 rounded-xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] flex items-center justify-center font-black text-lg">
                    2
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    Build understanding
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Explore concepts and prerequisites with guided teaching. A directed graph
                    organizes foundational ideas before advanced mechanisms so you never get lost.
                  </p>
                </div>
              </Card>

              {/* Step 3 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] p-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="h-12 w-12 rounded-xl bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] flex items-center justify-center font-black text-lg">
                    3
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    Practise and revisit
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Answer recall questions and review concepts when due. Get rubric-calibrated
                    feedback, and revisit items scheduled by SM-2 spaced repetition.
                  </p>
                </div>
              </Card>
            </div>
          </Container>
        </section>

        {/* Learning Tools Section (Six Cards) */}
        <section
          id="learning-tools"
          aria-labelledby="tools-heading"
          className="py-16 sm:py-24 border-t border-[var(--border-color)]"
        >
          <Container size="landing" className="space-y-12">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
                Core Capabilities
              </span>
              <h2
                id="tools-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]"
              >
                Learning tools
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                Built specifically for deep conceptual mastery and cognitive retention.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Tool 1 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--primary)]/60 transition-colors">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center mb-2">
                    <Network className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-base">Concept mapping</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    See how ideas connect. Topological ordering detects prerequisite dependencies so
                    you master foundations before tackling complex topics.
                  </p>
                </CardContent>
              </Card>

              {/* Tool 2 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--accent-blue)]/60 transition-colors">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] flex items-center justify-center mb-2">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-base">Socratic tutoring</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    Learn through guided questions and explanations. An adaptive AI mentor prompts
                    your thinking rather than spoon-feeding raw answers.
                  </p>
                </CardContent>
              </Card>

              {/* Tool 3 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--accent-cyan)]/60 transition-colors">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] flex items-center justify-center mb-2">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-base">Grounded recall</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    Practise from your uploaded material. Questions are strictly cited against source
                    chunks to eliminate AI hallucinations and ensure curriculum alignment.
                  </p>
                </CardContent>
              </Card>

              {/* Tool 4 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--success)]/60 transition-colors">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-[var(--success)]/15 text-[var(--success)] flex items-center justify-center mb-2">
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-base">Answer feedback</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    Understand gaps, not just a score. Hybrid semantic and rubric evaluation pinpoints
                    misconceptions and missing key concepts.
                  </p>
                </CardContent>
              </Card>

              {/* Tool 5 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--warning)]/60 transition-colors">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-[var(--warning)]/15 text-[var(--warning)] flex items-center justify-center mb-2">
                    <Clock className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-base">Spaced repetition</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    Revisit concepts on a schedule. Calibrated SuperMemo SM-2 spacing surfaces due
                    reviews at the ideal moment before memory decay.
                  </p>
                </CardContent>
              </Card>

              {/* Tool 6 */}
              <Card className="border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--primary-hover)]/60 transition-colors">
                <CardHeader>
                  <div className="h-10 w-10 rounded-lg bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center mb-2">
                    <BarChart3 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-base">Progress history</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    See what is improving and what needs attention. Inspect attempt history,
                    comprehension trends, and review queues with complete transparency.
                  </p>
                </CardContent>
              </Card>
            </div>
          </Container>
        </section>

        {/* Study-Loop Explanation Section */}
        <section
          aria-labelledby="loop-heading"
          className="py-16 sm:py-24 border-t border-[var(--border-color)] bg-[var(--surface)]/40"
        >
          <Container size="landing" className="space-y-10">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
                Constructive Mastery Loop
              </span>
              <h2
                id="loop-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]"
              >
                How EduMentor handles weak answers
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                Most quiz apps shame mistakes with a red cross. EduMentor diagnoses the prerequisite
                gap and routes you back to understanding.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {/* Path A: Weak Answer (q < 3) */}
              <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/5 p-5 space-y-3">
                <div className="flex items-center gap-2 text-[var(--warning)] font-bold text-sm">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>When an answer is incomplete (q &lt; 3)</span>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  Instead of penalizing you, the tutor flags the concept for immediate revision. It
                  identifies missing prerequisite terms and offers an intuitive analogy or a
                  stepped-down hint before letting you retry.
                </p>
                <div className="rounded-lg bg-[var(--surface)] p-3 border border-[var(--border-color)] text-xs text-[var(--text-muted)]">
                  Result: Repetitions reset to 1-day interval; student revisits prerequisite concepts
                  without penalty.
                </div>
              </Card>

              {/* Path B: Strong Answer (q >= 3) */}
              <Card className="border-[var(--success)]/40 bg-[var(--success)]/5 p-5 space-y-3">
                <div className="flex items-center gap-2 text-[var(--success)] font-bold text-sm">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>When recall is solid (q ≥ 3)</span>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  The concept is promoted to eligible/mastered. The SM-2 spacing engine computes an
                  extended interval (1 day → 6 days → exponential), unlocking the next dependent
                  concept on your learning path.
                </p>
                <div className="rounded-lg bg-[var(--surface)] p-3 border border-[var(--border-color)] text-xs text-[var(--text-muted)]">
                  Result: Concept unlocked on the graph; scheduled for spaced review automatically.
                </div>
              </Card>
            </div>
          </Container>
        </section>

        {/* Progress Preview Section (Clearly labelled "Sample data") */}
        <section aria-labelledby="progress-preview-heading" className="py-16 sm:py-24 border-t border-[var(--border-color)]">
          <Container size="landing" className="space-y-8">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-blue)]">
                Measurement & Analytics
              </span>
              <h2
                id="progress-preview-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]"
              >
                Track genuine retention
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                Transparent learning metrics computed directly from your recall attempts. No fake
                gamification streaks or manufactured rankings.
              </p>
            </div>

            {/* Labelled Progress Preview Card */}
            <div className="max-w-3xl mx-auto rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    Progress Dashboard
                  </span>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--warning)]">
                  Sample data • Simulated progress preview
                </span>
              </div>

              {/* Sample Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)]">
                  <span className="text-lg sm:text-xl font-black text-[var(--text-primary)]">18</span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                    Total Concepts
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)]">
                  <span className="text-lg sm:text-xl font-black text-[var(--success)]">11</span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                    Mastered / Proficient
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)]">
                  <span className="text-lg sm:text-xl font-black text-[var(--warning)]">3</span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                    Reviews Due Today
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)]">
                  <span className="text-lg sm:text-xl font-black text-[var(--accent-blue)]">82%</span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                    Average Retention
                  </span>
                </div>
              </div>

              {/* Sample Mastery Distribution Bars */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                  <span>Mastery Distribution</span>
                  <span>14 of 18 Active</span>
                </div>
                <div className="flex h-3 w-full rounded-full overflow-hidden bg-[var(--surface-hover)]">
                  <div className="bg-[var(--success)] h-full" style={{ width: '40%' }} title="Mastered (40%)" />
                  <div className="bg-[var(--accent-blue)] h-full" style={{ width: '25%' }} title="Proficient (25%)" />
                  <div className="bg-[var(--warning)] h-full" style={{ width: '20%' }} title="Learning (20%)" />
                  <div className="bg-[var(--surface-raised)] h-full" style={{ width: '15%' }} title="New (15%)" />
                </div>
                <div className="flex flex-wrap gap-4 text-[11px] text-[var(--text-muted)] pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[var(--success)]" /> Mastered (40%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[var(--accent-blue)]" /> Proficient (25%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[var(--warning)]" /> Learning (20%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[var(--surface-raised)] border border-[var(--border-color)]" /> New (15%)
                  </span>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Privacy Section (EXACT copy per DESIGN §12) */}
        <section
          id="privacy"
          aria-labelledby="privacy-heading"
          className="py-16 sm:py-24 border-t border-[var(--border-color)] bg-[var(--surface)]/30"
        >
          <Container size="landing" className="space-y-8 max-w-4xl">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--success)]">
                Local-First Integrity
              </span>
              <h2
                id="privacy-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]"
              >
                Your study space, on your device.
              </h2>
              <p className="text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
                Your learning history is stored in this browser. AI features send relevant requests
                to the configured Gemini service. Export a backup when you want to move or protect
                your data.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-4 text-xs space-y-1.5">
                <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <HardDrive className="h-4 w-4 text-[var(--primary)]" />
                  <span>Browser-Local IndexedDB</span>
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Documents, concept graphs, answers, and intervals persist in your browser profile.
                  No cloud database exists.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-4 text-xs space-y-1.5">
                <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Cpu className="h-4 w-4 text-[var(--accent-blue)]" />
                  <span>Stateless AI Queries</span>
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Only the excerpt chunks needed for user-triggered study requests are sent to
                  Gemini. Never your entire archive.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-4 text-xs space-y-1.5">
                <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <RotateCcw className="h-4 w-4 text-[var(--accent-cyan)]" />
                  <span>Portable JSON Backups</span>
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Export complete JSON backups anytime to migrate your learning profile to another
                  computer or browser.
                </p>
              </div>
            </div>

            <div className="text-center pt-2">
              <Link
                href="/privacy"
                className="text-xs text-[var(--accent-blue)] hover:underline inline-flex items-center gap-1 font-semibold"
              >
                Read full privacy disclosure and technical details →
              </Link>
            </div>
          </Container>
        </section>

        {/* FAQ Section (Seven topics in accessible accordion) */}
        <section
          id="faq"
          aria-labelledby="faq-heading"
          className="py-16 sm:py-24 border-t border-[var(--border-color)]"
        >
          <Container size="landing" className="max-w-3xl space-y-10">
            <div className="text-center space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
                Questions & Answers
              </span>
              <h2
                id="faq-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]"
              >
                Frequently asked questions
              </h2>
            </div>

            <div className="space-y-3" role="region" aria-label="Frequently asked questions list">
              {FAQ_ITEMS.map((item) => {
                const isOpen = openFaq === item.id;
                const buttonId = `faq-btn-${item.id}`;
                const panelId = `faq-panel-${item.id}`;

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] overflow-hidden transition-colors hover:border-[var(--border-color)]/80"
                  >
                    <button
                      type="button"
                      id={buttonId}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => toggleFaq(item.id)}
                      className="w-full p-4 sm:p-5 flex items-center justify-between text-left gap-4 font-semibold text-sm sm:text-base text-[var(--text-primary)] focus-visible:outline-[var(--focus-ring)] min-h-[44px]"
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-[var(--accent-blue)]' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={buttonId}
                        className="px-4 sm:px-5 pb-5 pt-1 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border-color)]/40 bg-[var(--surface-raised)]/30"
                      >
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Container>
        </section>

        {/* Final CTA Section */}
        <section
          aria-labelledby="final-cta-heading"
          className="py-16 sm:py-24 border-t border-[var(--border-color)] bg-[var(--surface-raised)]/40"
        >
          <Container size="landing" className="text-center space-y-6 max-w-2xl mx-auto">
            <h2
              id="final-cta-heading"
              className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--text-primary)]"
            >
              Ready to learn with clarity?
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Import your first set of study notes, generate an interactive concept map, and build
              lasting memory with guided Socratic recall.
            </p>
            <div className="pt-2">
              <Link href="/learn">
                <Button
                  variant="primary"
                  size="lg"
                  className="h-12 px-8 font-semibold text-sm shadow-lg shadow-[var(--primary)]/25"
                >
                  <span>Start learning</span>
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
                </Button>
              </Link>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              No account, email, or credit card required. Runs locally in your browser.
            </p>
          </Container>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-color)] bg-[var(--surface)] py-10 sm:py-12 z-10 text-xs text-[var(--text-muted)]">
        <Container size="landing" className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
                aria-hidden="true"
              />
              <span className="font-bold text-sm text-[var(--text-primary)]">EduMentor</span>
            </div>
            <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-6">
              <a href="#how-it-works" className="hover:text-[var(--text-primary)] transition-colors">
                How it works
              </a>
              <a href="#learning-tools" className="hover:text-[var(--text-primary)] transition-colors">
                Learning tools
              </a>
              <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">
                Privacy
              </Link>
              <a href="#faq" className="hover:text-[var(--text-primary)] transition-colors">
                FAQ
              </a>
              <Link href="/learn" className="text-[var(--accent-blue)] hover:underline font-semibold">
                Study Workspace
              </Link>
            </nav>
          </div>
          <div className="border-t border-[var(--border-color)]/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
            <p>© {new Date().getFullYear()} EduMentor. Browser-local AI learning assistant.</p>
            <p>Designed for deep study, concept mastery, and long-term retention.</p>
          </div>
        </Container>
      </footer>
    </div>
  );
}
