import type { NextConfig } from 'next';
import path from 'path';

/**
 * Content Security Policy & Security Response Headers
 * Source of truth: PRD §8, TECH_STACK §7.3, Phase 10 specifications.
 *
 * Relaxations documented:
 * - 'unsafe-inline' on script-src & style-src: Required for Next.js hydration scripts and inline CSS variables.
 * - 'wasm-unsafe-eval' on script-src: Strictly required by WebAssembly runtime in @huggingface/transformers / ONNX runtime.
 * - worker-src 'self' blob:: Required for PDF.js worker and Transformers.js embedding worker.
 * - connect-src: Allows downloading quantized ONNX model files from Hugging Face CDN.
 * - frame-ancestors 'none': Strict clickjacking protection.
 */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co",
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: cspDirectives,
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
