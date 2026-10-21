import { describe, it, expect } from 'vitest';
import { generateId, isValidId } from '@/lib/utils/id';

describe('ID Utility', () => {
  it('generates valid UUID formatted strings', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(isValidId(id)).toBe(true);
  });

  it('generates unique IDs across consecutive invocations', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('validates UUID format correctly', () => {
    expect(isValidId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidId('invalid-uuid-string')).toBe(false);
    expect(isValidId('')).toBe(false);
  });
});
