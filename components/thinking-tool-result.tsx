'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SparklesIcon } from './icons';
import { Markdown } from './markdown';

type ThinkingToolResultProps = {
  result: string;
  isCompact?: boolean;
};

export const ThinkingToolResult = ({ result, isCompact = false }: ThinkingToolResultProps) => {
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
        <div className="flex-1">
          <div className="text-xs font-medium text-muted-foreground">AI&apos;s Thought Process</div>
          <div className="mt-2 text-sm text-foreground">
            <Markdown>{result}</Markdown>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
