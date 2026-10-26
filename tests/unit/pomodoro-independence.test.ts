import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"].*features\/conversation.*['"]/,
  /from\s+['"].*features\/concepts.*['"]/,
  /from\s+['"].*features\/recall.*['"]/,
  /from\s+['"].*features\/spaced-repetition.*['"]/,
  /from\s+['"].*features\/evaluation.*['"]/,
  /from\s+['"].*lib\/db.*['"]/,
  /from\s+['"].*lib\/ai.*['"]/,
  /from\s+['"]@google\/genai['"]/,
  /from\s+['"]idb['"]/,
  /machineState/,
  /learningEvents/,
  /spacedRepetition/,
  /teachConcept/,
  /evaluateAnswer/,
];

function getFilesRecursively(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Pomodoro Independence Guarantees (Architectural Seam Enforcement)', () => {
  const pomodoroFeatureDir = path.resolve(process.cwd(), 'src/features/pomodoro');
  const pomodoroComponentDir = path.resolve(process.cwd(), 'src/components/pomodoro');

  const allPomodoroFiles = [
    ...getFilesRecursively(pomodoroFeatureDir),
    ...getFilesRecursively(pomodoroComponentDir),
  ];

  it('scans and finds all Pomodoro source files', () => {
    expect(allPomodoroFiles.length).toBeGreaterThanOrEqual(4);
  });

  allPomodoroFiles.forEach((filePath) => {
    const relativePath = path.relative(process.cwd(), filePath);

    it(`ensures ${relativePath} does not import from conversation, tutor, mastery, SM-2, or db repositories`, () => {
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `File ${relativePath} contains forbidden import matching ${pattern.toString()}: "${match?.[0]}"`,
        ).toBeNull();
      }
    });
  });
});
