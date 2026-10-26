import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudySessionView } from '@/components/session/StudySessionView';
import { RecallSessionView } from '@/components/session/RecallSessionView';
import { RevisionSessionView } from '@/components/session/RevisionSessionView';
import { SessionHeader } from '@/components/session/SessionHeader';
import { SessionSidebar } from '@/components/session/SessionSidebar';
import {
  type ConceptRecord,
  type LearningUnitRecord,
  type ConversationMessageRecord,
  type RecallQuestionRecord,
  type DocumentRecord,
  type DocumentChunkRecord,
  type MasteryStateRecord,
} from '@/types/domain';

const mockConcept: ConceptRecord = {
  id: 'concept-1',
  title: 'Ergonomic Posture Analysis',
  summary: 'Evaluating workplace posture to prevent musculoskeletal strain.',
  canonicalExplanation: 'Rapid Upper Limb Assessment (RULA) quantifies biomechanical risk using angle scoring.',
  keyTerms: ['RULA', 'Biomechanical Risk', 'Posture Score'],
  sourceChunkIds: ['ch-1'],
  tier: 1,
  status: 'available',
  confidence: 0.95,
  extractionOrder: 0,
  createdAt: '2026-10-26T00:00:00Z',
  updatedAt: '2026-10-26T00:00:00Z',
};

const mockUnit: LearningUnitRecord = {
  id: 'unit-1',
  materialId: 'mat-1',
  order: 0,
  title: 'Workplace Ergonomics Fundamentals',
  summary: 'Foundational biomechanical principles.',
  conceptIds: ['concept-1'],
  sourceChunkIds: ['ch-1'],
  contentVersion: 'hash-1',
  createdAt: '2026-10-26T00:00:00Z',
  updatedAt: '2026-10-26T00:00:00Z',
};

const mockDoc: DocumentRecord = {
  id: 'doc-1',
  filename: 'Ergonomics_Report.pdf',
  fileType: 'pdf',
  fileSize: 10240,
  extractedText: 'Rapid Upper Limb Assessment (RULA) quantifies biomechanical risk using angle scoring.',
  analysisStatus: 'completed',
  contentHash: 'hash-1',
  createdAt: '2026-10-26T00:00:00Z',
  updatedAt: '2026-10-26T00:00:00Z',
};

const mockChunk: DocumentChunkRecord = {
  id: 'ch-1',
  documentId: 'doc-1',
  chunkIndex: 0,
  text: 'Rapid Upper Limb Assessment (RULA) quantifies biomechanical risk using angle scoring across upper body joints.',
  startOffset: 0,
  endOffset: 110,
  pageStart: 4,
  pageEnd: 5,
  contentHash: 'hash-1',
  createdAt: '2026-10-26T00:00:00Z',
};

describe('Step 4 Component Views — Unit & Component Tests', () => {
  // =========================================================================
  // 1. SessionHeader Tests
  // =========================================================================
  describe('SessionHeader Component', () => {
    it('renders breadcrumbs, concept title, mode badge, and real progress label', () => {
      render(
        <SessionHeader
          materialName="Ergonomics_Report.pdf"
          unitTitle="Workplace Ergonomics Fundamentals"
          conceptTitle="Ergonomic Posture Analysis"
          mode="study"
          progressLabel="Concept 1 of 5"
          onFinish={vi.fn()}
          onPause={vi.fn()}
          onExit={vi.fn()}
        />,
      );

      expect(screen.getByText('Ergonomics_Report.pdf')).toBeInTheDocument();
      expect(screen.getByText('Workplace Ergonomics Fundamentals')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Ergonomic Posture Analysis' })).toBeInTheDocument();
      expect(screen.getByText(/Study Mode/i)).toBeInTheDocument();
      expect(screen.getByText('Concept 1 of 5')).toBeInTheDocument();
    });

    it('triggers onFinish, onPause, and onExit handlers when buttons are clicked', async () => {
      const user = userEvent.setup();
      const onFinish = vi.fn();
      const onPause = vi.fn();
      const onExit = vi.fn();

      render(
        <SessionHeader
          mode="study"
          conceptTitle="Test Concept"
          onFinish={onFinish}
          onPause={onPause}
          onExit={onExit}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Finish study session/i }));
      expect(onFinish).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /Pause session/i }));
      expect(onPause).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /Exit session/i }));
      expect(onExit).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 2. SessionSidebar Tests
  // =========================================================================
  describe('SessionSidebar Component', () => {
    it('renders concept tier badge, key vocabulary, and source document provenance', () => {
      render(
        <SessionSidebar
          concept={mockConcept}
          document={mockDoc}
          sourceChunks={[mockChunk]}
          sourceMode="document"
        />,
      );

      expect(screen.getByText(/Tier 1: Core Mechanism/i)).toBeInTheDocument();
      expect(screen.getByText('RULA')).toBeInTheDocument();
      expect(screen.getByText('Biomechanical Risk')).toBeInTheDocument();
      expect(screen.getByText('Ergonomics_Report.pdf')).toBeInTheDocument();
      expect(screen.getByText(/Page 4–5/i)).toBeInTheDocument();
    });

    it('toggles source text excerpt inspection', async () => {
      const user = userEvent.setup();
      render(
        <SessionSidebar
          concept={mockConcept}
          document={mockDoc}
          sourceChunks={[mockChunk]}
          sourceMode="document"
        />,
      );

      const inspectBtn = screen.getByRole('button', { name: /Inspect Source Text Excerpt/i });
      expect(screen.queryByText(/quantifies biomechanical risk using angle scoring/i)).not.toBeInTheDocument();

      await user.click(inspectBtn);
      expect(screen.getByText(/quantifies biomechanical risk using angle scoring/i)).toBeInTheDocument();
    });

    it('renders verified mastery information only when known (attemptCount > 0)', () => {
      const mastery: MasteryStateRecord = {
        id: 'm-1',
        conceptId: 'concept-1',
        level: 3,
        percentage: 85,
        bestScore: 92,
        attemptCount: 2,
        updatedAt: '2026-10-26T00:00:00Z',
      };

      const { rerender } = render(
        <SessionSidebar
          concept={mockConcept}
          document={mockDoc}
          sourceChunks={[mockChunk]}
          mastery={null}
        />,
      );
      expect(screen.queryByText(/Verified Mastery/i)).not.toBeInTheDocument();

      rerender(
        <SessionSidebar
          concept={mockConcept}
          document={mockDoc}
          sourceChunks={[mockChunk]}
          mastery={mastery}
        />,
      );
      expect(screen.getByText(/Verified Mastery/i)).toBeInTheDocument();
      expect(screen.getByText('Level 3 / 4')).toBeInTheDocument();
      expect(screen.getByText('92 / 100')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. StudySessionView Tests
  // =========================================================================
  describe('StudySessionView Component', () => {
    it('renders grounded canonical explanation and Socratic conversation messages', () => {
      const messages: ConversationMessageRecord[] = [
        {
          id: 'msg-1',
          sessionId: 'sess-1',
          role: 'assistant',
          content: 'Welcome! Today we examine how biomechanical angles dictate musculoskeletal load.',
          expressionState: 'Explaining',
          createdAt: '2026-10-26T00:00:01Z',
        },
        {
          id: 'msg-2',
          sessionId: 'sess-1',
          role: 'user',
          content: 'Does a higher RULA score mean higher risk?',
          createdAt: '2026-10-26T00:00:02Z',
        },
      ];

      render(
        <StudySessionView
          concept={mockConcept}
          unit={mockUnit}
          messages={messages}
          isLoading={false}
          error={null}
          onSendMessage={vi.fn()}
          onExplainDifferently={vi.fn()}
          onReadyForRecall={vi.fn()}
          onContinue={vi.fn()}
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );

      expect(screen.getByRole('heading', { name: 'Ergonomic Posture Analysis' })).toBeInTheDocument();
      expect(screen.getByText(/Rapid Upper Limb Assessment \(RULA\) quantifies biomechanical risk/i)).toBeInTheDocument();
      expect(screen.getByText(/biomechanical angles dictate musculoskeletal load/i)).toBeInTheDocument();
      expect(screen.getByText('Does a higher RULA score mean higher risk?')).toBeInTheDocument();
    });

    it('submits learner Socratic response on button click or Enter key', async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();

      render(
        <StudySessionView
          concept={mockConcept}
          unit={mockUnit}
          messages={[]}
          isLoading={false}
          error={null}
          onSendMessage={onSendMessage}
          onExplainDifferently={vi.fn()}
          onReadyForRecall={vi.fn()}
          onContinue={vi.fn()}
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );

      const composer = screen.getByPlaceholderText(/Respond to the tutor's question/i);
      await user.type(composer, 'RULA scores range from 1 to 7 with higher numbers requiring immediate redesign.');

      const sendBtn = screen.getByRole('button', { name: /Send response to AI tutor/i });
      expect(sendBtn).toBeEnabled();
      await user.click(sendBtn);

      expect(onSendMessage).toHaveBeenCalledWith(
        'RULA scores range from 1 to 7 with higher numbers requiring immediate redesign.',
      );
    });

    it('renders real loading skeleton with cancel option when isLoading is true', () => {
      const onCancelRequest = vi.fn();

      render(
        <StudySessionView
          concept={mockConcept}
          unit={mockUnit}
          messages={[]}
          isLoading={true}
          error={null}
          onSendMessage={vi.fn()}
          onExplainDifferently={vi.fn()}
          onReadyForRecall={vi.fn()}
          onContinue={vi.fn()}
          onRetry={vi.fn()}
          onCancelRequest={onCancelRequest}
          onExit={vi.fn()}
        />,
      );

      expect(screen.getByText(/The tutor is preparing a tailored Socratic explanation…/i)).toBeInTheDocument();
      const cancelBtn = screen.getByRole('button', { name: /Cancel in-flight tutor request/i });
      expect(cancelBtn).toBeInTheDocument();
    });

    it('renders plain-language error with Retry and Save & Exit buttons on failure', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      const onExit = vi.fn();

      render(
        <StudySessionView
          concept={mockConcept}
          unit={mockUnit}
          messages={[]}
          isLoading={false}
          error="Network timeout: AI tutor gateway unreachable."
          onSendMessage={vi.fn()}
          onExplainDifferently={vi.fn()}
          onReadyForRecall={vi.fn()}
          onContinue={vi.fn()}
          onRetry={onRetry}
          onExit={onExit}
        />,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Tutor explanation unavailable/i)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);

      const exitBtn = screen.getByRole('button', { name: /Save & Exit/i });
      await user.click(exitBtn);
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('renders nothing-in-scope empty state when concept is null', () => {
      render(
        <StudySessionView
          concept={null}
          unit={null}
          messages={[]}
          isLoading={false}
          error={null}
          onSendMessage={vi.fn()}
          onExplainDifferently={vi.fn()}
          onReadyForRecall={vi.fn()}
          onContinue={vi.fn()}
          onRetry={vi.fn()}
          onExit={vi.fn()}
          onReturnToStep2={vi.fn()}
        />,
      );

      expect(screen.getByText(/No Concepts in Active Scope/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Organise Units & Scope/i })).toBeInTheDocument();
    });

    it('triggers Explain Differently options popover and fires alternate mode', async () => {
      const user = userEvent.setup();
      const onExplainDifferently = vi.fn();

      render(
        <StudySessionView
          concept={mockConcept}
          unit={mockUnit}
          messages={[]}
          isLoading={false}
          error={null}
          onSendMessage={vi.fn()}
          onExplainDifferently={onExplainDifferently}
          onReadyForRecall={vi.fn()}
          onContinue={vi.fn()}
          onRetry={vi.fn()}
          onExit={vi.fn()}
        />,
      );

      const explainDiffBtn = screen.getByRole('button', { name: /Explain differently/i });
      await user.click(explainDiffBtn);

      expect(screen.getByText('Everyday Analogy')).toBeInTheDocument();
      expect(screen.getByText('Concrete Walkthrough')).toBeInTheDocument();
      expect(screen.getByText('Simpler Terms')).toBeInTheDocument();

      await user.click(screen.getByText('Everyday Analogy'));
      expect(onExplainDifferently).toHaveBeenCalledWith('analogy');
    });
  });

  // =========================================================================
  // 4. RecallSessionView Tests
  // =========================================================================
  describe('RecallSessionView Component', () => {
    it('renders WAITING_FOR_RECALL teaser card with Generate Practice Question button', async () => {
      const user = userEvent.setup();
      const onRequestQuestion = vi.fn();

      render(
        <RecallSessionView
          concept={mockConcept}
          unit={mockUnit}
          machineState="WAITING_FOR_RECALL"
          currentQuestion={null}
          draftAnswer=""
          selectedConfidence={null}
          lastEvaluation={null}
          isFallbackQuestion={false}
          revisionPlan={null}
          isLoading={false}
          onRequestQuestion={onRequestQuestion}
          onAnswerChange={vi.fn()}
          onConfidenceChange={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onContinue={vi.fn()}
          onTryAgain={vi.fn()}
          onRevise={vi.fn()}
          onSelectConcept={vi.fn()}
        />,
      );

      expect(screen.getByRole('heading', { name: /Active Retrieval Practice: Ergonomic Posture Analysis/i })).toBeInTheDocument();
      const genBtn = screen.getByRole('button', { name: /Generate Practice Question/i });
      await user.click(genBtn);
      expect(onRequestQuestion).toHaveBeenCalledTimes(1);
    });

    it('renders GENERATING_QUESTION skeleton loader', () => {
      render(
        <RecallSessionView
          concept={mockConcept}
          unit={mockUnit}
          machineState="GENERATING_QUESTION"
          currentQuestion={null}
          draftAnswer=""
          selectedConfidence={null}
          lastEvaluation={null}
          isFallbackQuestion={false}
          revisionPlan={null}
          isLoading={true}
          onRequestQuestion={vi.fn()}
          onAnswerChange={vi.fn()}
          onConfidenceChange={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onContinue={vi.fn()}
          onTryAgain={vi.fn()}
          onRevise={vi.fn()}
          onSelectConcept={vi.fn()}
        />,
      );

      expect(screen.getByText(/Generating Practice Question…/i)).toBeInTheDocument();
    });

    it('renders QuestionCard when question is active in WAITING_FOR_ANSWER state', () => {
      const question: RecallQuestionRecord = {
        id: 'q-1',
        conceptId: 'concept-1',
        materialId: 'mat-1',
        prompt: 'Explain how RULA computes wrist flexion and shoulder abduction scores.',
        questionStyle: 'explanation',
        referencePoints: ['angles', 'biomechanics'],
        sourceChunkIds: ['ch-1'],
        difficulty: 3,
        expectedKeyPoints: ['angles', 'loads'],
        createdAt: '2026-10-26T00:00:00Z',
      };

      render(
        <RecallSessionView
          concept={mockConcept}
          unit={mockUnit}
          machineState="WAITING_FOR_ANSWER"
          currentQuestion={question}
          draftAnswer=""
          selectedConfidence={null}
          lastEvaluation={null}
          isFallbackQuestion={false}
          revisionPlan={null}
          isLoading={false}
          onRequestQuestion={vi.fn()}
          onAnswerChange={vi.fn()}
          onConfidenceChange={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onContinue={vi.fn()}
          onTryAgain={vi.fn()}
          onRevise={vi.fn()}
          onSelectConcept={vi.fn()}
        />,
      );

      expect(screen.getByText(/Explain how RULA computes wrist flexion and shoulder abduction scores/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Explain this concept in your own words/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 5. RevisionSessionView Tests
  // =========================================================================
  describe('RevisionSessionView Component', () => {
    it('renders honest 0-due empty state when dueCount === 0 with alternative pathway buttons', async () => {
      const user = userEvent.setup();
      const onSwitchToStudy = vi.fn();
      const onSwitchToRecall = vi.fn();

      render(
        <RevisionSessionView
          concept={null}
          unit={null}
          machineState="IDLE"
          currentQuestion={null}
          draftAnswer=""
          selectedConfidence={null}
          lastEvaluation={null}
          isFallbackQuestion={false}
          revisionPlan={null}
          isLoading={false}
          dueCount={0}
          nextDueText="Tomorrow at 09:00"
          onRequestQuestion={vi.fn()}
          onAnswerChange={vi.fn()}
          onConfidenceChange={vi.fn()}
          onSubmitAnswer={vi.fn()}
          onContinue={vi.fn()}
          onTryAgain={vi.fn()}
          onRevise={vi.fn()}
          onSelectConcept={vi.fn()}
          onSwitchToStudy={onSwitchToStudy}
          onSwitchToRecall={onSwitchToRecall}
          onExit={vi.fn()}
        />,
      );

      expect(screen.getByText(/All Retention Reviews are Up to Date/i)).toBeInTheDocument();
      expect(screen.getByText('Tomorrow at 09:00')).toBeInTheDocument();

      const studyBtn = screen.getByRole('button', { name: /Start Socratic Study instead/i });
      await user.click(studyBtn);
      expect(onSwitchToStudy).toHaveBeenCalledTimes(1);

      const recallBtn = screen.getByRole('button', { name: /Start Active Recall instead/i });
      await user.click(recallBtn);
      expect(onSwitchToRecall).toHaveBeenCalledTimes(1);
    });
  });
});
