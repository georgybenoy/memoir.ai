import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'landing' | 'workspace' | 'narrow' | 'full';
}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = 'workspace', ...props }, ref) => {
    const sizeClasses = {
      narrow: 'max-w-3xl',
      landing: 'max-w-[1200px]',
      workspace: 'max-w-[1440px]',
      full: 'max-w-full',
    };

    return (
      <div
        ref={ref}
        className={cn('w-full mx-auto px-4 sm:px-6 lg:px-8', sizeClasses[size], className)}
        {...props}
      />
    );
  },
);

Container.displayName = 'Container';
