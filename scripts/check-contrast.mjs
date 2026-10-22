/**
 * scripts/check-contrast.mjs
 * Validates WCAG 2.2 AA contrast ratios for EduMentor design tokens.
 * Normal text target: 4.5:1
 * Large text / graphical components target: 3.0:1
 */

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return [
    (num >> 16) & 255,
    (num >> 8) & 255,
    num & 255,
  ];
}

function sRgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]) {
  const lr = sRgbToLinear(r);
  const lg = sRgbToLinear(g);
  const lb = sRgbToLinear(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(hexToRgb(hex1));
  const lum2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

const tokens = {
  background: '#07091b',
  surface: '#0d1028',
  'surface-raised': '#131735',
  'surface-hover': '#1a2044',
  'border-color': '#2a3157',
  'text-primary': '#f4f5ff',
  'text-secondary': '#b5bad6',
  'text-muted': '#858cab',
  primary: '#8b5cf6',
  'primary-dark': '#7c3aed',
  'accent-blue': '#60a5fa',
  'accent-cyan': '#67e8f9',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#fb7185',
};

const checks = [
  { fg: 'text-primary', bg: 'background', min: 4.5, type: 'Normal text on background' },
  { fg: 'text-primary', bg: 'surface', min: 4.5, type: 'Normal text on surface' },
  { fg: 'text-primary', bg: 'surface-raised', min: 4.5, type: 'Normal text on raised surface' },
  { fg: 'text-secondary', bg: 'background', min: 4.5, type: 'Secondary text on background' },
  { fg: 'text-secondary', bg: 'surface', min: 4.5, type: 'Secondary text on surface' },
  { fg: 'text-secondary', bg: 'surface-raised', min: 4.5, type: 'Secondary text on raised surface' },
  { fg: 'accent-blue', bg: 'background', min: 4.5, type: 'Accent blue on background' },
  { fg: 'accent-cyan', bg: 'background', min: 4.5, type: 'Accent cyan on background' },
  { fg: 'success', bg: 'background', min: 4.5, type: 'Success on background' },
  { fg: 'warning', bg: 'background', min: 4.5, type: 'Warning on background' },
  { fg: 'danger', bg: 'background', min: 4.5, type: 'Danger on background' },
  { fg: 'text-primary', bg: 'primary-dark', min: 4.5, type: 'Text primary on primary-dark button' },
  { fg: 'text-muted', bg: 'background', min: 3.0, type: 'Muted metadata text on background (Large/graphical 3:1)' },
  { fg: 'text-muted', bg: 'surface', min: 3.0, type: 'Muted metadata text on surface (Large/graphical 3:1)' },
];

console.log('=== WCAG 2.2 AA Contrast Verification ===');
let failed = 0;

for (const check of checks) {
  const fgHex = tokens[check.fg];
  const bgHex = tokens[check.bg];
  const ratio = contrastRatio(fgHex, bgHex);
  const passed = ratio >= check.min;
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${check.type}: ${ratio.toFixed(2)}:1 (required >= ${check.min}:1) [${check.fg} on ${check.bg}]`);
  if (!passed) failed++;
}

console.log('-----------------------------------------');
if (failed > 0) {
  console.error(`FAILED: ${failed} contrast check(s) did not meet required WCAG ratio.`);
  process.exit(1);
} else {
  console.log('SUCCESS: All checked token pairs meet or exceed target WCAG contrast requirements.');
  process.exit(0);
}
