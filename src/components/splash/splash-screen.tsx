'use client';

import * as React from 'react';
import Image from 'next/image';

const emptySubscribe = () => () => {};

function getSessionSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem('edumentor_loaded') === 'true';
  } catch {
    return false;
  }
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

export function SplashScreen() {
  const isAlreadyLoaded = React.useSyncExternalStore(
    emptySubscribe,
    getSessionSnapshot,
    () => false,
  );

  const prefersReducedMotion = React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );

  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    // If already loaded in this session, do nothing
    if (isAlreadyLoaded) return;

    // Scroll lock while splash is active
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Progress animation (~3.6s progress duration + 300ms completion hold = ~4.5s total visible time)
    const totalDuration = prefersReducedMotion ? 600 : 3600;
    const startTime = performance.now();
    let rafId: number;
    let pauseTimeoutId: ReturnType<typeof setTimeout>;
    let exitTimeoutId: ReturnType<typeof setTimeout>;

    const tick = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const currentProgress = Math.min(100, (elapsed / totalDuration) * 100);
      setProgress(currentProgress);

      if (currentProgress < 100) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Mark session as loaded
        try {
          sessionStorage.setItem('edumentor_loaded', 'true');
        } catch {
          // ignore storage error
        }

        // Hold at 100% briefly so "Ready to learn deeply." is comfortably absorbed
        const holdDuration = prefersReducedMotion ? 50 : 300;
        pauseTimeoutId = setTimeout(() => {
          // Trigger exit animation: opacity 0, scale 1.04
          setIsExiting(true);

          // Restore body scroll
          document.body.style.overflow = originalOverflow;

          // Unmount node completely after 600ms exit transition
          const exitDuration = prefersReducedMotion ? 150 : 600;
          exitTimeoutId = setTimeout(() => {
            setIsDismissed(true);
          }, exitDuration);
        }, holdDuration);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(pauseTimeoutId);
      clearTimeout(exitTimeoutId);
      document.body.style.overflow = originalOverflow;
    };
  }, [isAlreadyLoaded, prefersReducedMotion]);

  if (isAlreadyLoaded || isDismissed) {
    return null;
  }

  // Dynamic Micro-Copy based on exact progress intervals
  let statusCopy = 'Initializing browser-local Socratic studio...';
  if (progress > 75) {
    statusCopy = 'Ready to learn deeply.';
  } else if (progress > 35) {
    statusCopy = 'Mounting private IndexedDB storage...';
  }

  return (
    <>
      <style>{`
        @keyframes splash-levitate {
          0% {
            transform: translateY(0px);
          }
          100% {
            transform: translateY(-8px);
          }
        }
        @keyframes splash-aura-pulse {
          0% {
            transform: translate(-50%, -50%) scale(0.85);
            opacity: 0.55;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.15);
            opacity: 0.95;
          }
        }
        @keyframes splash-orbit-1 {
          0% {
            transform: translate(-50%, -50%) rotateX(62deg) rotateY(-18deg) rotateZ(0deg);
          }
          100% {
            transform: translate(-50%, -50%) rotateX(62deg) rotateY(-18deg) rotateZ(360deg);
          }
        }
        @keyframes splash-orbit-2 {
          0% {
            transform: translate(-50%, -50%) rotateX(55deg) rotateY(22deg) rotateZ(360deg);
          }
          100% {
            transform: translate(-50%, -50%) rotateX(55deg) rotateY(22deg) rotateZ(0deg);
          }
        }
        @keyframes splash-twinkle-1 {
          0%, 100% {
            transform: scale(0.65) rotate(0deg);
            opacity: 0.25;
          }
          50% {
            transform: scale(1.25) rotate(15deg);
            opacity: 1;
          }
        }
        @keyframes splash-twinkle-2 {
          0%, 100% {
            transform: scale(0.5) rotate(0deg);
            opacity: 0.2;
          }
          50% {
            transform: scale(1.15) rotate(-15deg);
            opacity: 0.95;
          }
        }
        .splash-levitate-anim {
          animation: splash-levitate 3s ease-in-out infinite alternate;
        }
        .splash-aura-anim {
          animation: splash-aura-pulse 3s ease-in-out infinite alternate;
        }
        .splash-orbit-1-anim {
          animation: splash-orbit-1 9s linear infinite;
        }
        .splash-orbit-2-anim {
          animation: splash-orbit-2 12s linear infinite;
        }
        .splash-twinkle-1-anim {
          animation: splash-twinkle-1 1.8s ease-in-out infinite;
        }
        .splash-twinkle-2-anim {
          animation: splash-twinkle-2 2.4s ease-in-out infinite 0.6s;
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-levitate-anim,
          .splash-aura-anim,
          .splash-orbit-1-anim,
          .splash-orbit-2-anim,
          .splash-twinkle-1-anim,
          .splash-twinkle-2-anim {
            animation: none !important;
          }
        }
      `}</style>

      <div
        role="status"
        aria-live="polite"
        aria-label="EduMentor is loading"
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none overflow-hidden"
        style={{
          backgroundColor: '#070614',
          opacity: isExiting ? 0 : 1,
          transform: isExiting ? 'scale(1.04)' : 'scale(1)',
          pointerEvents: isExiting ? 'none' : 'auto',
          transition: isExiting
            ? `opacity ${prefersReducedMotion ? '150ms' : '600ms'} cubic-bezier(0.16, 1, 0.3, 1), transform ${prefersReducedMotion ? '150ms' : '600ms'} cubic-bezier(0.16, 1, 0.3, 1)`
            : 'none',
        }}
      >
        {/* Subtle 48px x 48px Background Grid with Centered Radial Gradient Mask */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(139, 92, 246, 0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(139, 92, 246, 0.05) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(circle at center, black 35%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(circle at center, black 35%, transparent 80%)',
          }}
          aria-hidden="true"
        />

        {/* Logo Stage Container (170px x 170px) */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: '170px', height: '170px', perspective: '1000px' }}
        >
          {/* 1. Ambient Aura: Blurred radial gradient circle softly pulsing */}
          <div
            className="absolute top-1/2 left-1/2 rounded-full pointer-events-none splash-aura-anim"
            style={{
              width: '120px',
              height: '120px',
              background:
                'radial-gradient(circle, rgba(139, 92, 246, 0.75) 0%, rgba(34, 211, 238, 0.45) 55%, transparent 75%)',
              filter: 'blur(24px)',
            }}
            aria-hidden="true"
          />

          {/* 3. 3D Orbital Rings around the logo */}
          {/* Orbital Ring 1: rotateX(62deg) rotateY(-18deg) */}
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none splash-orbit-1-anim"
            style={{
              width: '210px',
              height: '210px',
              transformStyle: 'preserve-3d',
            }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 210 210" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="ringGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.85" />
                  <stop offset="45%" stopColor="#22d3ee" stopOpacity="0.9" />
                  <stop offset="75%" stopColor="#8b5cf6" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              <ellipse
                cx="105"
                cy="105"
                rx="100"
                ry="100"
                fill="none"
                stroke="url(#ringGrad1)"
                strokeWidth="1.6"
                strokeDasharray="160 50 40 30"
              />
              {/* Orbital accent node */}
              <circle cx="205" cy="105" r="3" fill="#22d3ee" filter="drop-shadow(0 0 6px #22d3ee)" />
            </svg>
          </div>

          {/* Orbital Ring 2: rotateX(55deg) rotateY(22deg) */}
          <div
            className="absolute top-1/2 left-1/2 pointer-events-none splash-orbit-2-anim"
            style={{
              width: '190px',
              height: '190px',
              transformStyle: 'preserve-3d',
            }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 190 190" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="ringGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#a855f7" stopOpacity="0.85" />
                  <stop offset="80%" stopColor="#38bdf8" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              <ellipse
                cx="95"
                cy="95"
                rx="90"
                ry="90"
                fill="none"
                stroke="url(#ringGrad2)"
                strokeWidth="1.4"
                strokeDasharray="120 40 30 20"
              />
              {/* Orbital satellite node */}
              <circle cx="5" cy="95" r="2.5" fill="#a855f7" filter="drop-shadow(0 0 5px #a855f7)" />
            </svg>
          </div>

          {/* 2. Logo Levitation: continuous vertical floating with neon drop-shadow */}
          <div
            className="relative z-10 flex items-center justify-center splash-levitate-anim"
            style={{
              filter: 'drop-shadow(0 0 18px rgba(139, 92, 246, 0.45))',
            }}
          >
            <Image
              src="/Neon_Learning_Book_Icon-removebg-preview.png"
              alt="EduMentor Logo"
              width={150}
              height={150}
              className="object-contain select-none pointer-events-none"
              priority
            />
          </div>

          {/* 4. Twinkling Sparkles: Two 4-point stars */}
          {/* Top-Right Star */}
          <div
            className="absolute top-2 right-1 z-20 pointer-events-none splash-twinkle-1-anim"
            style={{
              color: '#38bdf8',
              textShadow: '0 0 10px #22d3ee, 0 0 20px #22d3ee',
              fontSize: '18px',
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            ✦
          </div>

          {/* Bottom-Left Star */}
          <div
            className="absolute bottom-4 left-2 z-20 pointer-events-none splash-twinkle-2-anim"
            style={{
              color: '#a78bfa',
              textShadow: '0 0 10px #8b5cf6, 0 0 18px #a855f7',
              fontSize: '15px',
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            ✦
          </div>
        </div>

        {/* Typography, Progress Bar & Status Copy */}
        <div className="flex flex-col items-center mt-7 text-center space-y-3 z-10">
          {/* Brand Title: Edu in white, Mentor in violet-to-cyan gradient */}
          <h1
            className="font-extrabold select-none"
            style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            <span style={{ color: '#f8fafc' }}>Edu</span>
            <span
              style={{
                backgroundImage: 'linear-gradient(90deg, #a78bfa, #38bdf8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Mentor
            </span>
          </h1>

          {/* Progress Track: 220px wide, 4px high pill container */}
          <div
            className="rounded-full overflow-hidden"
            style={{
              width: '220px',
              height: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.07)',
            }}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                backgroundImage: 'linear-gradient(90deg, #8b5cf6, #22d3ee)',
                boxShadow: '0 0 12px #8b5cf6',
                transition: 'width 60ms linear',
              }}
            />
          </div>

          {/* Dynamic Micro-Copy */}
          <p
            className="font-normal tracking-wide min-h-[1.25rem] transition-all duration-200"
            style={{
              fontSize: '0.78rem',
              color: '#94a3b8',
            }}
          >
            {statusCopy}
          </p>
        </div>
      </div>
    </>
  );
}
