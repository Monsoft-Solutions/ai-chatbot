'use client';

import { useSearch } from '@/hooks/use-search';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CheckCircleFillIcon, CrossIcon, UserIcon } from './icons';

export function SearchStepIndicator() {
  const { status, query, steps, error } = useSearch();

  // Show the indicator as long as there's an active search or we have steps
  const isActive = status === 'starting' || status === 'searching' || steps.length > 0;

  // Don't render anything if idle AND no steps (we want to show completed steps)
  if (!isActive && status === 'idle') {
    return null;
  }

  const isSearching = status === 'starting' || status === 'searching';

  // Calculate progress based on step count and status
  const calculateProgress = () => {
    if (status === 'completed') return 100;
    if (status === 'error') return 100;
    if (steps.length === 0) return 10;
    return Math.max(10, Math.min(95, steps.length * 25));
  };

  const searchProgress = calculateProgress();

  return (
    <AnimatePresence>
      <motion.div
        className="mx-auto mb-4 w-full max-w-3xl px-4"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -5, opacity: 0 }}
      >
        <Card className="border border-primary/10 bg-primary/5">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserIcon />
                </div>
                <CardTitle className="text-sm">
                  {status === 'error'
                    ? 'Search Error'
                    : status === 'completed'
                      ? 'Search Completed'
                      : 'Searching...'}
                </CardTitle>
              </div>
              {isSearching && <Progress value={searchProgress} className="h-1 w-28" />}
              {status === 'completed' && (
                <div className="flex size-5 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                  <CheckCircleFillIcon size={12} />
                </div>
              )}
              {status === 'error' && (
                <div className="flex size-5 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <CrossIcon size={12} />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            {query && (
              <div className="mb-2 text-xs text-muted-foreground">
                <span className="font-medium">Query:</span> {query}
              </div>
            )}

            <div className="space-y-2">
              {steps.map((step, index) => (
                <div
                  key={`step-${index}`}
                  className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-sm', {
                    'bg-primary/10': !step.completed && isSearching,
                    'opacity-70': index < steps.length - 1 || step.completed
                  })}
                >
                  {step.completed ? (
                    <div className="flex size-4 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                      <CheckCircleFillIcon size={10} />
                    </div>
                  ) : (
                    <div className="size-4 animate-pulse rounded-full bg-primary/20" />
                  )}
                  <span className="text-xs font-medium">{step.title}</span>
                </div>
              ))}

              {/* Show pulsing step for active search */}
              {isSearching && steps.length === 0 && (
                <div className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1 text-sm">
                  <div className="size-4 animate-pulse rounded-full bg-primary/20" />
                  <span className="text-xs font-medium">Initiating search...</span>
                </div>
              )}
            </div>

            {error && <div className="mt-2 text-xs text-red-500">Error: {error}</div>}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
