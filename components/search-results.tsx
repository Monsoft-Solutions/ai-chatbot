import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Markdown } from './markdown';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type {
  SearchResultImage,
  SearchResultItem,
  SearchResults,
  SearchSourceDetail,
  SearchStep
} from '@/lib/types/search.type';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { ChevronDownIcon, ExternalLinkIcon } from './icons';
import { useSearch } from '@/hooks/use-search';
import { Progress } from '@/components/ui/progress';
import { SearchStepIndicator } from './search-step-indicator';

export function SearchResults({ searchResults }: { searchResults?: SearchResults }) {
  const { steps, status, query, results } = useSearch();

  // Initialize state from props or hook
  useEffect(() => {
    if (searchResults) {
      useSearch.getState().setSearchResults(searchResults);
      if (searchResults.steps) {
        searchResults.steps.forEach((step) => {
          useSearch.getState().addSearchStep(step);
        });
      }
    }
  }, [searchResults]);

  // Determine what to display
  const displayResults = results || searchResults;
  const displaySteps = steps.length > 0 ? steps : displayResults?.steps || [];
  const isSearching = status === 'starting' || status === 'searching';
  const searchProgress = isSearching ? Math.max(5, Math.min(95, displaySteps.length * 25)) : 100;

  if (!displayResults && !isSearching) {
    return <div className="text-center text-muted-foreground">No search results found</div>;
  }

  // Loading state
  if (isSearching && !displayResults) {
    return <SearchStepIndicator />;
  }

  return (
    <div className="w-full rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <span className="text-sm font-medium">
              {displayResults?.number_of_results || displayResults?.results?.length || 0} results
            </span>
          </div>
        </div>

        {isSearching && <Progress value={searchProgress} className="h-1 w-28" />}
      </div>

      {/* Results section */}
      <SearchResultsList searchResults={displayResults as SearchResults} />
    </div>
  );
}

function SearchResultsList({ searchResults }: { searchResults: SearchResults }) {
  if (!searchResults || (!searchResults.results?.length && !searchResults.images?.length)) {
    return <div className="py-2 text-center text-muted-foreground">No results to display</div>;
  }

  return (
    <div className="space-y-4">
      {/* Query display */}
      {searchResults.query && (
        <div className="mb-2 text-sm text-muted-foreground">
          Results for: <span className="font-medium">{searchResults.query}</span>
        </div>
      )}

      {/* Images section */}
      {searchResults.images && searchResults.images.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Images</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {searchResults.images.slice(0, 6).map((image, index) => (
              <ImageCard key={`image-${index}`} image={image} />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {searchResults.results && searchResults.results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Web Results</h3>
          <div className="space-y-2">
            {searchResults.results.map((result, index) => (
              <ResultCard key={`result-${index}`} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const url = source.includes('.')
    ? `https://${source}`
    : `https://www.google.com/search?q=${encodeURIComponent(source)}`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-primary/10"
          >
            {source}
            <ExternalLinkIcon size={10} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" className="text-xs">
          <div>View source: {source}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ImageCard({ image }: { image: SearchResultImage }) {
  const imageUrl = typeof image === 'string' ? image : image.url;
  const description = typeof image === 'string' ? '' : image.description;

  return (
    <div className="group relative aspect-video overflow-hidden rounded-md bg-muted">
      <Image
        src={imageUrl}
        alt={description || ''}
        fill
        className="object-cover transition-transform group-hover:scale-105"
      />
      {description && (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="text-xs text-white">{description}</p>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: SearchResultItem }) {
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return '';
    }
  };

  const domain = result.source || getDomain(result.url);

  return (
    <Card className="overflow-hidden transition-colors hover:border-primary/20">
      <CardHeader className="p-3 pb-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">
            <Link href={result.url} target="_blank" className="text-primary hover:underline">
              {result.title}
            </Link>
          </CardTitle>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <SourceBadge source={domain} />
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-2">
        <div className="line-clamp-3 text-sm text-muted-foreground">
          <Markdown>{result.content}</Markdown>
        </div>
      </CardContent>
    </Card>
  );
}
