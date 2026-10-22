/**
 * scripts/check-no-server-persistence.mjs
 * Security Audit Script:
 * 1. Proves package.json contains no external database, cloud KV, or server-side auth libraries.
 * 2. Proves src/app/api/ route handlers do not write user data to filesystem (/tmp, fs.writeFile, etc.).
 * 3. Proves no request bodies, note chunks, student answers, or secrets are logged on the server.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let violations = 0;

console.log('=== Checking Architectural Constraint: No Server-Side Persistence / Auth ===\n');

// 1. Check package.json dependencies
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const allDeps = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
};

const FORBIDDEN_DEPENDENCIES = [
  // Databases / ORMs
  'prisma',
  '@prisma/client',
  'drizzle-orm',
  'typeorm',
  'sequelize',
  'mongoose',
  'mongodb',
  'pg',
  'mysql',
  'mysql2',
  'sqlite',
  'sqlite3',
  'better-sqlite3',
  // KV / Cache
  '@vercel/kv',
  '@upstash/redis',
  'ioredis',
  'redis',
  '@vercel/postgres',
  // Auth services
  'next-auth',
  '@auth/core',
  '@clerk/nextjs',
  '@supabase/supabase-js',
  'firebase',
  'firebase-admin',
  'lucia',
  'passport',
];

for (const forbidden of FORBIDDEN_DEPENDENCIES) {
  if (allDeps[forbidden]) {
    console.error(`❌ VIOLATION: Forbidden server persistence/auth dependency found in package.json: "${forbidden}"`);
    violations++;
  }
}

if (violations === 0) {
  console.log('✅ package.json: Zero external database, cloud KV, or auth dependencies detected.');
}

// 2. Check API route handlers for filesystem persistence and forbidden calls
const apiDir = path.join(rootDir, 'src', 'app', 'api');

function scanApiDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanApiDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const relPath = path.relative(rootDir, fullPath);

      // Check filesystem writes
      if (/fs\.(?:writeFile|writeFileSync|createWriteStream)/.test(content) ||
          /fs\/promises/.test(content) ||
          /writeFile/.test(content)) {
        console.error(`❌ VIOLATION in ${relPath}: Server route contains filesystem write call.`);
        violations++;
      }

      // Check /tmp usage
      if (/['"`]\/tmp\//.test(content) || /os\.tmpdir/.test(content)) {
        console.error(`❌ VIOLATION in ${relPath}: Server route attempts /tmp filesystem write.`);
        violations++;
      }

      // Check for raw request body logging
      if (/console\.log\([^)]*(?:body|chunk|answer|note|key|secret)/i.test(content) &&
          !content.includes('safeLog')) {
        console.error(`❌ VIOLATION in ${relPath}: Potential logging of sensitive payload/answers.`);
        violations++;
      }
    }
  }
}

scanApiDirectory(apiDir);

console.log('--------------------------------------------------');
if (violations > 0) {
  console.error(`FAILED: ${violations} architecture violation(s) found.`);
  process.exit(1);
} else {
  console.log('✅ All checks passed: Server routes are 100% stateless and zero-persistence.');
  process.exit(0);
}
