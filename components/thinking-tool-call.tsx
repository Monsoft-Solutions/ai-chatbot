'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LoaderIcon, SparklesIcon } from './icons';

type ThinkingToolCallProps = {
  args?: { thought?: string };
  isCompact?: boolean;
};

export const ThinkingToolCall = ({ args, isCompact = false }: ThinkingToolCallProps) => {
  return (
    <motion.div
      className={cn(
        'my-2 w-full rounded-lg border border-border bg-muted/30 p-4',
        isCompact ? 'my-1 p-3' : 'my-2 p-4'
      )}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SparklesIcon size={12} />
        </div>
        <div className="flex flex-1 items-center justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground">AI is thinking...</div>
            {args?.thought && (
              <div className="mt-1 text-sm text-muted-foreground">{args.thought}</div>
            )}
          </div>
          <div className="animate-spin text-muted-foreground">
            <LoaderIcon size={16} />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
