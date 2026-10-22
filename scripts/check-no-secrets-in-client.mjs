import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const staticDir = path.join(rootDir, '.next', 'static');

const envKey = process.env.GEMINI_API_KEY;
const FORBIDDEN_STRINGS = ['GEMINI_API_KEY', '@google/genai'];
if (envKey && envKey.trim().length > 6) {
  FORBIDDEN_STRINGS.push(envKey.trim());
}

// AIzaSy... Google API key pattern
const AIZA_KEY_REGEX = /AIza[0-9A-Za-z-_]{35}/;

let violations = 0;
let scannedFiles = 0;

function scanDirectory(dir, excludePaths = []) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    if (excludePaths.some((ex) => relPath.startsWith(ex) || relPath === ex)) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath, excludePaths);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.js') ||
        entry.name.endsWith('.mjs') ||
        entry.name.endsWith('.ts') ||
        entry.name.endsWith('.tsx') ||
        entry.name.endsWith('.json') ||
        entry.name.endsWith('.html'))
    ) {
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Server-only modules are guaranteed not to be bundled into the client by Next.js
      if (content.includes("'server-only'") || content.includes('"server-only"')) {
        continue;
      }

      scannedFiles++;

      for (const pattern of FORBIDDEN_STRINGS) {
        if (content.includes(pattern)) {
          console.error(
            `❌ LEAK DETECTED in ${relPath}: Contains forbidden string "${pattern.startsWith('AIza') ? 'API_KEY_VALUE' : pattern}"`,
          );
          violations++;
        }
      }

      const match = content.match(AIZA_KEY_REGEX);
      if (match) {
        console.error(
          `❌ LEAK DETECTED in ${relPath}: Matches Google API Key regex pattern "${match[0].slice(0, 8)}..."`,
        );
        violations++;
      }
    }
  }
}

if (fs.existsSync(staticDir)) {
  scanDirectory(staticDir);
}

if (scannedFiles === 0) {
  console.log('🔍 Scanning all client-side source code...');
  const clientDirs = [
    path.join(rootDir, 'src', 'components'),
    path.join(rootDir, 'src', 'features'),
    path.join(rootDir, 'src', 'types'),
    path.join(rootDir, 'src', 'hooks'),
  ];
  for (const dir of clientDirs) {
    scanDirectory(dir);
  }

  // Scan src/app excluding server API routes (src/app/api)
  scanDirectory(path.join(rootDir, 'src', 'app'), [path.join('src', 'app', 'api')]);

  // Scan src/lib excluding server-only AI gateway (src/lib/ai/gemini.ts, src/lib/ai/guard.ts)
  scanDirectory(path.join(rootDir, 'src', 'lib'), [
    path.join('src', 'lib', 'ai', 'gemini.ts'),
    path.join('src', 'lib', 'ai', 'guard.ts'),
  ]);
}

if (violations > 0) {
  console.error(
    `\n❌ Security check failed: ${violations} potential secret leak(s) found across ${scannedFiles} client files.`,
  );
  process.exit(1);
}

console.log(
  `✅ Security check passed: ${scannedFiles} client files scanned. No secrets, GEMINI_API_KEY, @google/genai, or AIza-style keys found.`,
);
process.exit(0);
