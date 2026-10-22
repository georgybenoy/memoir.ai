'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react';

export interface ConfidenceSelectorProps {
  value: 1 | 2 | 3 | null;
  onChange: (value: 1 | 2 | 3) => void;
  disabled?: boolean;
}

const CONFIDENCE_LEVELS = [
  {
    value: 1 as const,
    label: 'Not very confident',
    sublabel: 'Still building understanding',
    icon: ShieldAlert,
    activeBorder: 'border-[var(--warning)]',
    activeBg: 'bg-[var(--warning)]/10',
    activeText: 'text-[var(--warning)]',
  },
  {
    value: 2 as const,
    label: 'Somewhat confident',
    sublabel: 'Grasp the core idea',
    icon: Shield,
    activeBorder: 'border-[var(--accent-blue)]',
    activeBg: 'bg-[var(--accent-blue)]/10',
    activeText: 'text-[var(--accent-blue)]',
  },
  {
    value: 3 as const,
    label: 'Very confident',
    sublabel: 'Ready to explain to others',
    icon: ShieldCheck,
    activeBorder: 'border-[var(--success)]',
    activeBg: 'bg-[var(--success)]/10',
    activeText: 'text-[var(--success)]',
  },
];

export const ConfidenceSelector: React.FC<ConfidenceSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <fieldset className="space-y-2 border-0 p-0 m-0" disabled={disabled}>
      <legend className="text-xs font-semibold text-[var(--text-primary)] mb-2 flex items-center justify-between w-full">
        <span>How confident are you in this explanation?</span>
        <span className="text-[11px] font-normal text-[var(--text-muted)]">
          Required before submitting
        </span>
      </legend>

      <div
        role="radiogroup"
        aria-label="Confidence in your recall answer"
        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
      >
        {CONFIDENCE_LEVELS.map((level) => {
          const Icon = level.icon;
          const isSelected = value === level.value;

          return (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(level.value)}
              className={cn(
                'flex items-center sm:flex-col sm:items-start p-3 rounded-xl border text-left transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] cursor-pointer',
                isSelected
                  ? `${level.activeBorder} ${level.activeBg} shadow-xs`
                  : 'border-[var(--border-color)] bg-[var(--surface-raised)]/40 hover:bg-[var(--surface-hover)]',
                disabled && 'opacity-60 cursor-not-allowed',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isSelected ? level.activeText : 'text-[var(--text-muted)]',
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'text-xs font-semibold',
                    isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                  )}
                >
                  {level.label}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] ml-6 sm:ml-0">
                {level.sublabel}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
};
