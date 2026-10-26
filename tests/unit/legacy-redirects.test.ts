import { describe, it, expect } from 'vitest';
import { resolveLegacyRoute } from '@/features/workflow/redirects';

describe('Legacy Route Redirection (Phase R3)', () => {
  it('redirects /app/tutor with materialId and sessionId to Step 4', () => {
    const route = resolveLegacyRoute('/app/tutor', new URLSearchParams({
      materialId: 'mat-123',
      sessionId: 'sess-456',
      conceptId: 'con-789',
    }));
    expect(route).toBe('/learn/mat-123/session/sess-456?conceptId=con-789');
  });

  it('redirects /app/tutor with materialId only to Step 3 mode selection', () => {
    const route = resolveLegacyRoute('/app/tutor', new URLSearchParams({
      documentId: 'mat-123',
    }));
    expect(route).toBe('/learn/mat-123/mode?mode=study');
  });

  it('redirects /app/tutor with no params to Step 1 Add Material', () => {
    const route = resolveLegacyRoute('/app/tutor');
    expect(route).toBe('/learn/new');
  });

  it('redirects /app/review with materialId to Step 3 with revision mode preset', () => {
    const route = resolveLegacyRoute('/app/review', new URLSearchParams({
      materialId: 'mat-123',
    }));
    expect(route).toBe('/learn/mat-123/mode?mode=revision');
  });

  it('redirects /app/review with no params to Workflow Home', () => {
    const route = resolveLegacyRoute('/app/review');
    expect(route).toBe('/learn');
  });

  it('redirects /app/materials to /learn/new or Step 2 if materialId is present', () => {
    const resWithoutMat = resolveLegacyRoute('/app/materials');
    expect(resWithoutMat).toBe('/learn/new');

    const resWithMat = resolveLegacyRoute('/app/materials', new URLSearchParams({
      docId: 'mat-123',
    }));
    expect(resWithMat).toBe('/learn/mat-123/organise');
  });

  it('redirects /app/path with materialId to Step 2 with highlightConcept if present', () => {
    const route = resolveLegacyRoute('/app/path', new URLSearchParams({
      materialId: 'mat-123',
      conceptId: 'con-1',
    }));
    expect(route).toBe('/learn/mat-123/organise?highlightConcept=con-1');
  });

  it('redirects /app to /learn', () => {
    const route = resolveLegacyRoute('/app');
    expect(route).toBe('/learn');
  });
});
