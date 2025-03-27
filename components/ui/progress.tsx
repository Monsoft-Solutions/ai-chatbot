'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  className?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    // Ensure value is within 0-max range
    const normalizedValue = Math.max(0, Math.min(value, max));
    const percentage = (normalizedValue / max) * 100;

    return (
      <div
        ref={ref}
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={normalizedValue}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-primary transition-all"
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export { Progress };
