'use client';

import * as React from 'react';
import { type AvatarExpression, AVATAR_EXPRESSION_META } from './types';
import { cn } from '@/lib/utils/cn';

export interface TeacherAvatarProps {
  expression: AvatarExpression;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  className?: string;
  onClick?: () => void;
}

const SIZE_CLASSES = {
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-18 h-18',
  xl: 'w-24 h-24',
};

const BADGE_SIZE_CLASSES = {
  sm: 'text-[9px] px-1.5 py-0.2',
  md: 'text-[10px] px-2 py-0.5',
  lg: 'text-xs px-2.5 py-0.5',
  xl: 'text-xs px-3 py-1',
};

export const TeacherAvatar: React.FC<TeacherAvatarProps> = ({
  expression,
  size = 'md',
  showBadge = false,
  className,
  onClick,
}) => {
  const meta = AVATAR_EXPRESSION_META[expression] ?? AVATAR_EXPRESSION_META.Idle;

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-1.5 select-none shrink-0', className)}
      onClick={onClick}
    >
      <div
        role="img"
        aria-label={`Teacher avatar: ${meta.accessibleDescription}`}
        className={cn(
          'relative rounded-full flex items-center justify-center p-0.5 border border-[var(--border-color)] bg-gradient-to-b from-[#131735] to-[#0D1028] shadow-md transition-transform duration-200 hover:scale-105 motion-reduce:transform-none',
          SIZE_CLASSES[size],
        )}
      >
        {/* Expression-tailored SVG character */}
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Subtle Ambient Radial Backlight */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="url(#avatarGlow)"
            className={cn(
              'transition-opacity duration-300',
              expression === 'Celebration'
                ? 'opacity-80'
                : expression === 'Thinking'
                  ? 'opacity-40'
                  : 'opacity-25',
            )}
          />

          <defs>
            <radialGradient id="avatarGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#60A5FA" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#07091B" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="skinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F5D0B5" />
              <stop offset="100%" stopColor="#E2A67D" />
            </linearGradient>
            <linearGradient id="hairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#312E81" />
              <stop offset="100%" stopColor="#1E1B4B" />
            </linearGradient>
            <linearGradient id="robeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#6D28D9" />
            </linearGradient>
          </defs>

          {/* Shoulders / Tutor Robe Collar */}
          <path
            d="M20 90 Q50 68 80 90 Z"
            fill="url(#robeGrad)"
            stroke="#A78BFA"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Academic Scarf / Accent Collar */}
          <path
            d="M42 74 L50 86 L58 74 Z"
            fill="#60A5FA"
            stroke="#93C5FD"
            strokeWidth="1"
          />

          {/* Head & Neck */}
          <rect x="44" y="58" width="12" height="14" rx="4" fill="url(#skinGrad)" />
          <ellipse cx="50" cy="46" rx="26" ry="28" fill="url(#skinGrad)" />

          {/* Stylized Scholar Hair (back & front swoosh) */}
          <path
            d="M24 44 C22 24 38 18 50 18 C64 18 78 24 76 44 C76 44 72 32 60 28 C46 24 36 34 24 44 Z"
            fill="url(#hairGrad)"
          />

          {/* Spectacles / Scholar Glasses Frame */}
          <g stroke="#93C5FD" strokeWidth="1.8" fill="#1E1B4B" fillOpacity="0.15">
            <circle cx="38" cy="45" r="9" />
            <circle cx="62" cy="45" r="9" />
            <path d="M47 45 L53 45" />
          </g>

          {/* Dynamic Eyebrows & Eyes based on expression */}
          {/* 1. Greeting & Happy: smiling crescents */}
          {(expression === 'Greeting' || expression === 'Happy') && (
            <g stroke="#1E1B4B" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <path d="M33 46 Q38 41 43 46" />
              <path d="M57 46 Q62 41 67 46" />
              {/* Soft rosy cheeks */}
              <circle cx="30" cy="53" r="3.5" fill="#FB7185" fillOpacity="0.4" stroke="none" />
              <circle cx="70" cy="53" r="3.5" fill="#FB7185" fillOpacity="0.4" stroke="none" />
              {/* Joyful open smile */}
              <path d="M43 56 Q50 63 57 56" />
            </g>
          )}

          {/* 2. Celebration: radiant joy and sparkles */}
          {expression === 'Celebration' && (
            <g>
              <path
                d="M33 47 Q38 42 43 47"
                stroke="#1E1B4B"
                strokeWidth="2.2"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M57 47 Q62 42 67 47"
                stroke="#1E1B4B"
                strokeWidth="2.2"
                strokeLinecap="round"
                fill="none"
              />
              {/* Wide celebratory smile */}
              <path
                d="M42 55 Q50 67 58 55 Z"
                fill="#EF4444"
                stroke="#1E1B4B"
                strokeWidth="1.5"
              />
              <circle cx="28" cy="52" r="4" fill="#FB7185" fillOpacity="0.5" />
              <circle cx="72" cy="52" r="4" fill="#FB7185" fillOpacity="0.5" />
              {/* Floating celebration stars */}
              <path d="M16 26 L19 28 L16 30 L14 28 Z" fill="#FBBF24" />
              <path d="M84 24 L87 26 L84 28 L82 26 Z" fill="#FBBF24" />
              <path d="M50 10 L52 13 L50 16 L48 13 Z" fill="#67E8F9" />
            </g>
          )}

          {/* 3. Thinking: gaze tilted up to right */}
          {expression === 'Thinking' && (
            <g fill="#1E1B4B">
              {/* Pensive brows */}
              <path d="M33 39 Q38 37 44 40" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M56 41 Q62 38 67 39" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              {/* Eyes looking up-right */}
              <circle cx="39" cy="43" r="3" />
              <circle cx="63" cy="43" r="3" />
              {/* Pensive pursed mouth */}
              <path d="M46 58 Q50 56 55 57" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
              {/* Floating thought dot bubbles */}
              <circle cx="78" cy="28" r="2.5" fill="#60A5FA" opacity="0.8" />
              <circle cx="84" cy="20" r="3.5" fill="#8B5CF6" opacity="0.9" />
            </g>
          )}

          {/* 4. Listening: attentive wide eyes */}
          {expression === 'Listening' && (
            <g fill="#1E1B4B">
              <path d="M33 39 Q38 37 43 38" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M57 38 Q62 37 67 39" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="38" cy="45" r="3.2" />
              <circle cx="62" cy="45" r="3.2" />
              {/* Gentle attentive smile */}
              <path d="M45 57 Q50 60 55 57" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}

          {/* 5. Explaining: animated instructional expression */}
          {expression === 'Explaining' && (
            <g fill="#1E1B4B">
              <path d="M33 38 Q38 35 43 39" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M57 39 Q62 36 67 38" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="38" cy="45" r="3" />
              <circle cx="62" cy="45" r="3" />
              {/* Open talking mouth */}
              <ellipse cx="50" cy="58" rx="4" ry="3" fill="#1E1B4B" />
              {/* Little sparkle of inspiration */}
              <path d="M82 34 L84 36 L82 38 L80 36 Z" fill="#67E8F9" />
            </g>
          )}

          {/* 6. Encouraging: confident, reassuring nod */}
          {expression === 'Encouraging' && (
            <g fill="#1E1B4B">
              <path d="M33 39 Q38 36 43 39" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
              <path d="M57 39 Q62 36 67 39" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
              <circle cx="38" cy="45" r="3" />
              <circle cx="62" cy="45" r="3" />
              <path d="M44 57 Q50 63 56 57" stroke="#1E1B4B" strokeWidth="2.2" strokeLinecap="round" />
              {/* Star badge of encouragement */}
              <path d="M18 36 L20 38 L18 40 L16 38 Z" fill="#FBBF24" />
            </g>
          )}

          {/* 7. Almost correct: one raised brow, encouraging squint */}
          {expression === 'Almost correct' && (
            <g fill="#1E1B4B">
              {/* Left brow quizzical raise */}
              <path d="M33 37 Q38 33 43 37" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
              <path d="M57 40 Q62 39 67 41" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="38" cy="45" r="3" />
              <circle cx="62" cy="45" r="2.8" />
              {/* Thoughtful encouraging curve */}
              <path d="M46 58 Q50 61 56 57" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}

          {/* 8. Supportive: warm empathy, reassuring smile */}
          {expression === 'Supportive' && (
            <g fill="#1E1B4B">
              {/* Gentle compassionate brows */}
              <path d="M33 40 Q38 38 43 41" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M57 41 Q62 38 67 40" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="38" cy="45" r="2.8" />
              <circle cx="62" cy="45" r="2.8" />
              <circle cx="30" cy="52" r="3" fill="#FB7185" fillOpacity="0.3" />
              <circle cx="70" cy="52" r="3" fill="#FB7185" fillOpacity="0.3" />
              <path d="M44 57 Q50 61 56 57" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}

          {/* 9. Reminder: pointing to key review */}
          {expression === 'Reminder' && (
            <g fill="#1E1B4B">
              <path d="M33 39 Q38 37 43 39" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M57 39 Q62 37 67 39" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="38" cy="45" r="3" />
              <circle cx="62" cy="45" r="3" />
              <path d="M45 58 Q50 59 55 58" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
              {/* Subtle clock / bookmark indicator */}
              <circle cx="82" cy="30" r="6" stroke="#FBBF24" strokeWidth="1.5" fill="#131735" />
              <path d="M82 27 L82 30 L84 31" stroke="#FBBF24" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          )}

          {/* 10. Idle: calm baseline attentive expression */}
          {expression === 'Idle' && (
            <g fill="#1E1B4B">
              <path d="M33 40 Q38 38 43 40" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M57 40 Q62 38 67 40" stroke="#1E1B4B" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="38" cy="45" r="2.8" />
              <circle cx="62" cy="45" r="2.8" />
              <path d="M45 57 Q50 60 55 57" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}
        </svg>
      </div>

      {/* Accessible Badge Text */}
      {showBadge && (
        <span
          className={cn(
            'inline-flex items-center font-medium rounded-full bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--accent-blue)] select-none',
            BADGE_SIZE_CLASSES[size],
          )}
        >
          {meta.badgeText}
        </span>
      )}
    </div>
  );
};
