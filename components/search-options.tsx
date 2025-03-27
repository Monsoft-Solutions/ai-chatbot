'use client';

import { useState, useEffect, startTransition } from 'react';
import { useSearch } from '@/hooks/use-search';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  CheckCircleFillIcon,
  ChevronDownIcon,
  GlobeIcon,
  BookOpenIcon,
  SparklesIcon
} from './icons';
import { useLocalStorage } from 'usehooks-ts';

export type SearchOption = 'none' | 'web-search' | 'deep-research';

const searchOptions = [
  {
    id: 'none',
    name: 'Standard',
    description: 'Regular chat without search',
    icon: <SparklesIcon size={14} />,
    shortName: 'Standard'
  },
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web for current information',
    icon: <GlobeIcon size={14} />,
    shortName: 'Web'
  },
  {
    id: 'deep-research',
    name: 'Deep Research',
    description: 'Thorough research with multiple sources',
    icon: <BookOpenIcon size={14} />,
    shortName: 'Research'
  }
];

export function SearchOptionsSelector({
  className,
  minimal = false
}: React.ComponentProps<typeof Button> & {
  minimal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchOption, setSearchOption] = useLocalStorage<SearchOption>('search-option', 'none');
  const searchStore = useSearch();

  const selectedOption =
    searchOptions.find((option) => option.id === searchOption) || searchOptions[0];

  const handleOptionSelect = (optionId: SearchOption) => {
    setOpen(false);

    startTransition(() => {
      // Reset any active search when changing options
      if (searchStore.status !== 'idle') {
        searchStore.resetSearch();
      }

      setSearchOption(optionId);
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className
        )}
      >
        <Button
          data-testid="search-option-selector"
          variant={minimal ? 'ghost' : 'outline'}
          size={minimal ? 'sm' : 'default'}
          className={cn(minimal ? 'h-8 p-2' : 'md:h-[34px] md:px-2')}
          title="Search options"
        >
          {minimal ? (
            <div className="flex items-center">
              {selectedOption.icon}
              <span className="ml-1 text-xs">{selectedOption.shortName}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center">
                <div className="mr-2">{selectedOption.icon}</div>
                <span className="hidden md:inline-flex">{selectedOption.name}</span>
              </div>
              <ChevronDownIcon />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {searchOptions.map((option) => (
          <DropdownMenuItem
            data-testid={`search-option-item-${option.id}`}
            key={option.id}
            onSelect={() => handleOptionSelect(option.id as SearchOption)}
            data-active={option.id === searchOption}
            asChild
          >
            <button
              type="button"
              className="group/item flex w-full flex-row items-center justify-between gap-4"
            >
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center">
                  <div className="mr-2">{option.icon}</div>
                  {option.name}
                </div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>

              <div className="text-foreground opacity-0 group-data-[active=true]/item:opacity-100 dark:text-foreground">
                <CheckCircleFillIcon />
              </div>
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
