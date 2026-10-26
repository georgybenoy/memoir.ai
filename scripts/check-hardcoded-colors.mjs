/**
 * scripts/check-hardcoded-colors.mjs
 * Validates that all components and CSS outside token files use semantic
 * CSS variables and design tokens rather than hardcoded hex, rgb, or hsl colors.
 *
 * Scans src/ for:
 * - Hex colors: #[0-9a-fA-F]{3,8}
 * - Functional colors: rgb(...), rgba(...), hsl(...), hsla(...)
 *
 * Allowed files:
 * - src/app/globals.css (Token definitions)
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');
const ALLOWED_FILES = new Set([
  path.resolve(SRC_DIR, 'app/globals.css'),
]);

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);

// Regex patterns
const HEX_PATTERN = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const FUNCTIONAL_COLOR_PATTERN = /\b(?:rgb|rgba|hsl|hsla)\s*\([^)]*\)/g;

function isAllowedFile(filePath) {
  return ALLOWED_FILES.has(path.resolve(filePath));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;

    // Ignore comment-only lines
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // Skip anchor links e.g. href="#main-content", id="#..."
    // Find all hex matches
    let hexMatch;
    const hexRegex = new RegExp(HEX_PATTERN.source, 'g');
    while ((hexMatch = hexRegex.exec(rawLine)) !== null) {
      const matchText = hexMatch[0];
      const matchIndex = hexMatch.index;
      
      // Check if preceded by href=" or id=" or anchor
      const before = rawLine.slice(Math.max(0, matchIndex - 10), matchIndex);
      if (/href=["']$|id=["']$|#[\w-]+/.test(before + matchText) && !/^#[0-9a-fA-F]{3,8}$/.test(matchText)) {
        continue;
      }

      // Check if it's inside a URL anchor link (e.g. href="#...")
      if (/href=["']#/.test(before + '#')) {
        continue;
      }

      violations.push({
        line: lineNum,
        color: matchText,
        snippet: trimmed,
      });
    }

    // Find functional rgb/hsl matches
    let fnMatch;
    const fnRegex = new RegExp(FUNCTIONAL_COLOR_PATTERN.source, 'g');
    while ((fnMatch = fnRegex.exec(rawLine)) !== null) {
      violations.push({
        line: lineNum,
        color: fnMatch[0],
        snippet: trimmed,
      });
    }
  }

  return violations;
}

function walkDir(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        results.push(...walkDir(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (EXTENSIONS.has(ext) && !isAllowedFile(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

console.log('=== Hardcoded Colors Scanner (Design Token Enforcement) ===');
const filesToScan = walkDir(SRC_DIR);
let totalViolations = 0;

for (const file of filesToScan) {
  const violations = scanFile(file);
  if (violations.length > 0) {
    const relPath = path.relative(process.cwd(), file);
    console.error(`\n[VIOLATION] ${relPath} (${violations.length} hardcoded color(s) found):`);
    for (const v of violations) {
      console.error(`  Line ${v.line}: "${v.color}" in -> ${v.snippet.slice(0, 80)}`);
      totalViolations++;
    }
  }
}

console.log('\n-----------------------------------------------------------');
if (totalViolations > 0) {
  console.error(`FAILED: Found ${totalViolations} hardcoded color(s) outside token files.`);
  console.error('All colors must use semantic CSS variables (var(--...)) or Tailwind theme tokens.');
  process.exit(1);
} else {
  console.log(`SUCCESS: All ${filesToScan.length} scanned files use semantic CSS variables and design tokens.`);
  process.exit(0);
}
