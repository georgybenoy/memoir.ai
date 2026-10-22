/**
 * Concept Status Badge
 * Never communicates state through color alone: always pairs an accessible icon with visible text.
 * Source of truth: DESIGN_DOC §6.4, PRD FR-05
 */

import React from 'react';
import { type ConceptStatus } from '@/types/domain';
import { Lock, Sparkles, Clock, RefreshCw, CheckCircle2 } from 'lucide-react';

interface ConceptStatusBadgeProps {
  status: ConceptStatus;
  className?: string;
  size?: 'sm' | 'md';
}

export const STATUS_CONFIG: Record<
  ConceptStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
    bgColor: string;
    textColor: string;
    borderColor: string;
  }
> = {
  locked: {
    label: 'Locked',
    icon: Lock,
    bgColor: 'bg-surface-elevated/80',
    textColor: 'text-text-muted',
    borderColor: 'border-border-subtle',
  },
  available: {
    label: 'Available',
    icon: Sparkles,
    bgColor: 'bg-accent-cyan/15',
    textColor: 'text-accent-cyan',
    borderColor: 'border-accent-cyan/30',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    bgColor: 'bg-accent-violet/15',
    textColor: 'text-accent-violet',
    borderColor: 'border-accent-violet/30',
  },
  review_due: {
    label: 'Review Due',
    icon: RefreshCw,
    bgColor: 'bg-amber-500/15',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
  },
  mastered: {
    label: 'Mastered',
    icon: CheckCircle2,
    bgColor: 'bg-emerald-500/15',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
  },
};

export function ConceptStatusBadge({
  status,
  className = '',
  size = 'md',
}: ConceptStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.locked;
  const IconComponent = config.icon;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs gap-1.5'
      : 'px-2.5 py-1 text-xs font-medium gap-1.5';
  const iconSizeClasses = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.bgColor} ${config.textColor} ${config.borderColor} ${sizeClasses} ${className}`}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <IconComponent className={iconSizeClasses} aria-hidden={true} />
      <span>{config.label}</span>
    </span>
  );
}
