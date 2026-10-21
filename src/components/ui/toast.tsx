'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useWorkspaceStore, type ToastItem } from '@/lib/state/workspace-store';
import { cn } from '@/lib/utils/cn';

const toastIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

const toastBorderColors = {
  info: 'border-[var(--accent-blue)] text-[var(--accent-blue)]',
  success: 'border-[var(--success)] text-[var(--success)]',
  warning: 'border-[var(--warning)] text-[var(--warning)]',
  error: 'border-[var(--danger)] text-[var(--danger)]',
};

export const Toast = ({ item }: { item: ToastItem }) => {
  const dismiss = useWorkspaceStore((state) => state.dismissToast);
  const Icon = toastIcons[item.type];

  React.useEffect(() => {
    if (!item.durationMs || item.durationMs <= 0) return;
    const timer = setTimeout(() => {
      dismiss(item.id);
    }, item.durationMs);
    return () => clearTimeout(timer);
  }, [item.id, item.durationMs, dismiss]);

  return (
    <div
      role={item.type === 'error' ? 'alert' : 'status'}
      aria-live={item.type === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 w-full max-w-sm rounded-[10px] border bg-[var(--surface-raised)] p-4 shadow-lg transition-all duration-200 pointer-events-auto',
        'border-l-4',
        toastBorderColors[item.type],
      )}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] leading-none">
          {item.title}
        </h4>
        {item.description && (
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        className="rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export const ToastViewport = () => {
  const toasts = useWorkspaceStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <aside
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} item={toast} />
      ))}
    </aside>
  );
};
