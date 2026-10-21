import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon | React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  ariaLive?: 'polite' | 'assertive' | 'off';
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ariaLive = 'polite', ...props }, ref) => {
    const renderIcon = () => {
      if (!icon) return null;
      if (React.isValidElement(icon)) {
        return icon;
      }
      const IconComp = icon as React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
      return <IconComp className="h-8 w-8 text-[var(--accent-blue)]" aria-hidden="true" />;
    };

    return (
      <div
        ref={ref}
        role="region"
        aria-live={ariaLive}
        className={cn(
          'flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-[14px] border border-dashed border-[var(--border-color)] bg-[var(--surface-raised)]/50',
          className,
        )}
        {...props}
      >
        {icon && (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-hover)] border border-[var(--border-color)]">
            {renderIcon()}
          </div>
        )}
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1.5">{title}</h3>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
        {action && <div className="flex items-center gap-3">{action}</div>}
      </div>
    );
  },
);

EmptyState.displayName = 'EmptyState';
