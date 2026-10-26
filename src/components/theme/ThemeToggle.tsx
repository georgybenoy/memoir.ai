'use client';

import * as React from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme } from '@/features/theme';
import { type ThemeMode } from '@/features/theme/types';
import { cn } from '@/lib/utils/cn';

export interface ThemeToggleProps {
  className?: string;
  variant?: 'dropdown' | 'radio-group';
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className,
  variant = 'dropdown',
}) => {
  const { mode, resolvedTheme, setMode } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);

  // Close menu on click outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  // Keyboard navigation within the dropdown menu
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        const currentIdx = THEME_OPTIONS.findIndex((o) => o.id === mode);
        setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % THEME_OPTIONS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const targetOption = THEME_OPTIONS[focusedIndex];
      if (targetOption) {
        // Keyboard activation: origin is center of trigger
        const rect = triggerRef.current?.getBoundingClientRect();
        const origin = rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : undefined;
        void setMode(targetOption.id, origin);
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
  };

  // Focus active menu item when menu opens or index changes
  React.useEffect(() => {
    if (isOpen && menuRef.current) {
      const buttons = menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
      buttons[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const handleSelect = (
    selectedMode: ThemeMode,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const origin = {
      x: event.clientX,
      y: event.clientY,
    };
    void setMode(selectedMode, origin);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Inline radio-group view (for Settings page)
  if (variant === 'radio-group') {
    return (
      <div
        role="radiogroup"
        aria-label="Color theme preference"
        data-testid="theme-radiogroup"
        className={cn('grid grid-cols-3 gap-2.5 max-w-md', className)}
      >
        {THEME_OPTIONS.map((opt) => {
          const isSelected = mode === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              data-testid={`theme-radio-${opt.id}`}
              aria-checked={isSelected}
              onClick={(e) => {
                const origin = { x: e.clientX, y: e.clientY };
                void setMode(opt.id, origin);
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border transition-all text-xs font-semibold cursor-pointer min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                isSelected
                  ? 'border-[var(--primary)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                  : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown menu view (Top bar, Drawer, Navigation)
  const CurrentIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;

  return (
    <div className={cn('relative inline-block text-left', className)}>
      <button
        ref={triggerRef}
        type="button"
        data-testid="theme-toggle-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'} theme (currently ${resolvedTheme === 'dark' ? 'Dark' : 'Light'}). Change theme`}
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (nextOpen) {
            const currentIdx = THEME_OPTIONS.findIndex((o) => o.id === mode);
            setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
          }
        }}
        onKeyDown={handleKeyDown}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition-colors cursor-pointer select-none"
      >
        <CurrentIcon className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
        <span className="capitalize font-medium">{mode}</span>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          data-testid="theme-toggle-menu"
          aria-label="Color theme options"
          onKeyDown={handleKeyDown}
          className="absolute right-0 mt-2 w-36 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-1 shadow-lg ring-1 ring-black/5 z-50 focus:outline-none animate-in fade-in zoom-in-95 duration-100"
        >
          {THEME_OPTIONS.map((opt, idx) => {
            const isSelected = mode === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                data-testid={`theme-option-${opt.id}`}
                tabIndex={focusedIndex === idx ? 0 : -1}
                aria-checked={isSelected}
                onClick={(e) => handleSelect(opt.id, e)}
                onMouseEnter={() => setFocusedIndex(idx)}
                className={cn(
                  'w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer min-h-[44px]',
                  focusedIndex === idx
                    ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]',
                  isSelected && 'text-[var(--primary)] font-semibold'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
