/**
 * Legacy Route Redirection Mapping
 * Maps pre-refactor top-level tab routes to the guided workflow without 404s.
 * Preserves query parameters (materialId, docId, conceptId, mode).
 */

export function resolveLegacyRoute(
  pathname: string,
  searchParams?: URLSearchParams | Record<string, string>,
): string {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams ?? {});

  const materialId =
    params.get('materialId') ||
    params.get('documentId') ||
    params.get('docId') ||
    params.get('material');

  const sessionId = params.get('sessionId') || params.get('session');
  const conceptId = params.get('conceptId') || params.get('concept');

  const cleanPath = pathname.replace(/\/$/, '');

  // 1. /app/tutor (Study / Recall)
  if (cleanPath === '/app/tutor') {
    if (materialId && sessionId) {
      return `/learn/${materialId}/session/${sessionId}${conceptId ? `?conceptId=${conceptId}` : ''}`;
    }
    if (materialId) {
      return `/learn/${materialId}/mode?mode=study${conceptId ? `&conceptId=${conceptId}` : ''}`;
    }
    return '/learn/new';
  }

  // 2. /app/review (Spaced Revision)
  if (cleanPath === '/app/review') {
    if (materialId) {
      return `/learn/${materialId}/mode?mode=revision`;
    }
    return '/learn';
  }

  // 3. /app/materials (Study Materials)
  if (cleanPath === '/app/materials') {
    if (materialId) {
      return `/learn/${materialId}/organise`;
    }
    return '/learn/new';
  }

  // 4. /app/path (Concept Map)
  if (cleanPath === '/app/path') {
    if (materialId) {
      return `/learn/${materialId}/organise${conceptId ? `?highlightConcept=${conceptId}` : ''}`;
    }
    return '/learn';
  }

  // 5. /app default
  if (cleanPath === '/app') {
    return '/learn';
  }

  return '/learn';
}
