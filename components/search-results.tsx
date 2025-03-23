import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Markdown } from './markdown';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type {
  SearchAnalysisPoint,
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

export function SearchResults({ searchResults }: { searchResults?: SearchResults }) {
  const { steps, status, query, results } = useSearch();

  // If we get direct results passed in, use them and update the state
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

  // Use either streaming steps or passed-in results
  const displayResults = results || searchResults;
  const displaySteps = steps.length > 0 ? steps : displayResults?.steps || [];
  const isSearching = status === 'starting' || status === 'searching';
  const totalSteps = displaySteps.length || 4;
  const completedSteps = displaySteps.filter((step) => step.completed).length;
  const searchProgress = isSearching
    ? Math.max(5, Math.round((completedSteps / totalSteps) * 100))
    : 100;

  if (!displayResults && !isSearching) {
    return <div className="text-center text-muted-foreground">No search results found</div>;
  }

  if (isSearching && displaySteps.length === 0) {
    return (
      <div className="flex w-full flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium">Pro Search</h3>
              <span className="text-xs text-muted-foreground">Searching...</span>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span>Searching</span>
            <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1">
              <span className="font-mono">{query}</span>
            </div>
          </div>
          <div className="w-full">
            <Progress value={searchProgress} className="h-1.5 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const defaultSearchResults: SearchResults = {
    results: [],
    query: query || '',
    images: [],
    number_of_results: 0
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium">Pro Search</h3>
            <span className="text-xs text-muted-foreground">
              {displayResults?.number_of_results || displayResults?.results?.length || 0} results
            </span>
          </div>
        </div>

        <div className="flex items-center">
          {isSearching && (
            <div className="mr-4">
              <Progress value={searchProgress} className="h-1.5 w-28" />
            </div>
          )}
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
            {displaySteps.length || 4} steps
            <ChevronDownIcon size={16} />
          </Button>
        </div>
      </div>

      {displaySteps.length > 0 ? (
        <DynamicSearchSteps
          searchResults={displayResults || defaultSearchResults}
          steps={displaySteps}
        />
      ) : (
        <FallbackSearchResults searchResults={displayResults || defaultSearchResults} />
      )}
    </div>
  );
}

function DynamicSearchSteps({
  searchResults,
  steps
}: {
  searchResults: SearchResults;
  steps: SearchStep[];
}) {
  const [activeStep, setActiveStep] = useState(0);
  const [expandedSteps, setExpandedSteps] = useState<number[]>([0]);

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
    setActiveStep(index);
  };

  if (steps.length === 0) {
    return <FallbackSearchResults searchResults={searchResults} />;
  }

  return (
    <div className="flex flex-col">
      {steps.map((step, index) => (
        <div key={index} className="relative border-l-2 border-muted pb-4 pl-4">
          <div className="absolute left-0 top-0 ml-[-9px]">
            <div
              className={cn('h-4 w-4 rounded-full border-2', {
                'border-primary bg-primary': step.completed,
                'border-muted bg-muted': !step.completed && activeStep !== index,
                'border-primary bg-background': !step.completed && activeStep === index
              })}
            ></div>
          </div>

          <div>
            <button
              className={cn(
                'flex w-full items-center justify-between py-2 text-left text-sm font-medium',
                {
                  'text-muted-foreground': !expandedSteps.includes(index) && index !== activeStep
                }
              )}
              onClick={() => toggleStep(index)}
            >
              <span>{step.title}</span>
              <div
                className={cn('transition-transform', {
                  'rotate-180': expandedSteps.includes(index)
                })}
              >
                <ChevronDownIcon size={16} />
              </div>
            </button>

            {expandedSteps.includes(index) && (
              <div className="mt-1">
                <StepContent step={step} allResults={searchResults.results} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepContent({ step, allResults }: { step: SearchStep; allResults: SearchResultItem[] }) {
  const [showAllSources, setShowAllSources] = useState(false);

  // Display at most 4 sources initially, or all if showAllSources is true
  const displaySourceDetails =
    step.sourceDetails && (showAllSources ? step.sourceDetails : step.sourceDetails.slice(0, 4));

  const hasMoreSources = step.sourceDetails && step.sourceDetails.length > 4;

  switch (step.type) {
    case 'search':
      return (
        <div className="space-y-4 pt-2">
          {step.query && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <span>Searching</span>
              <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1">
                <span className="font-mono">{step.query}</span>
                {step.additional_queries && step.additional_queries.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    +{step.additional_queries.length} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Sources section */}
          {step.sourceDetails && step.sourceDetails.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-sm font-medium">Sources</h4>

              {/* Grid of source cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {displaySourceDetails?.map((source) => (
                  <SourceCard key={source.url} source={source} />
                ))}
              </div>

              {/* View more/less button */}
              {hasMoreSources && (
                <button
                  onClick={() => setShowAllSources(!showAllSources)}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  {showAllSources
                    ? `Show less (${step.sourceDetails.length - 4} fewer)`
                    : `View all ${step.sourceDetails.length} sources (+${step.sourceDetails.length - 4} more)`}
                </button>
              )}
            </div>
          )}

          {/* Fallback to simple sources if no source details available */}
          {(!step.sourceDetails || step.sourceDetails.length === 0) &&
            step.sources &&
            step.sources.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-medium">Sources</h4>
                <div className="flex flex-wrap gap-2">
                  <TooltipProvider>
                    {step.sources.map((source) => (
                      <SourceBadgeSimple key={source} source={source} />
                    ))}
                  </TooltipProvider>
                </div>
              </div>
            )}

          {step.results && step.results.length > 0 && (
            <div className="pt-2">
              {step.results.map((result, index) => (
                <ResultCard key={`result-${index}`} result={result} />
              ))}
            </div>
          )}
        </div>
      );

    case 'reading':
      return (
        <div className="space-y-4 pt-2">
          <h4 className="text-sm font-medium">Sources</h4>

          {/* Similar grid layout for reading step */}
          {step.sourceDetails && step.sourceDetails.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {displaySourceDetails?.map((source) => (
                  <SourceCard key={source.url} source={source} />
                ))}
              </div>

              {hasMoreSources && (
                <button
                  onClick={() => setShowAllSources(!showAllSources)}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  {showAllSources
                    ? `Show less (${step.sourceDetails.length - 4} fewer)`
                    : `View all ${step.sourceDetails.length} sources (+${step.sourceDetails.length - 4} more)`}
                </button>
              )}
            </>
          ) : step.sources?.length ? (
            <div className="flex flex-wrap gap-2">
              <TooltipProvider>
                {step.sources.map((source) => (
                  <SourceBadgeSimple key={source} source={source} />
                ))}
              </TooltipProvider>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No source information available</div>
          )}

          {step.summary && (
            <div className="mt-2 rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
              {step.summary}
            </div>
          )}
        </div>
      );

    case 'analysis':
      return (
        <div className="space-y-3 pt-2">
          {step.completed ? (
            <>
              {step.summary && <div className="rounded-md p-2 text-sm">{step.summary}</div>}

              {step.analysisPoints && step.analysisPoints.length > 0 ? (
                <div className="space-y-3">
                  {step.analysisPoints.map((point, idx) => (
                    <AnalysisPoint key={idx} point={point} />
                  ))}
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
                  Analysis complete.
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-2 py-2 text-center text-sm text-muted-foreground">
              <div className="relative size-5">
                <div className="absolute size-5 animate-ping rounded-full bg-primary/30"></div>
                <div className="absolute size-5 rounded-full bg-primary/60"></div>
              </div>
              <span>Analysis in progress...</span>
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

function SourceCard({ source }: { source: SearchSourceDetail }) {
  return (
    <div className="group relative">
      <Link
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full overflow-hidden rounded-lg border bg-card transition-all hover:border-primary/50 hover:shadow-md"
      >
        <div className="flex h-full flex-col p-3">
          {/* Domain badge */}
          <div className="mb-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs">
              {source.domain}
              <span className="ml-1">
                <ExternalLinkIcon size={10} />
              </span>
            </span>
          </div>

          {/* Title */}
          <h5 className="line-clamp-2 text-sm font-medium">{source.title}</h5>

          {/* Summary on hover */}
          <div className="absolute inset-0 flex items-center justify-center bg-card/95 p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex flex-col gap-2">
              <h5 className="text-sm font-medium">{source.title}</h5>
              <p className="text-xs text-muted-foreground">{source.summary}</p>
              <div className="text-xs text-primary">Click to open</div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function SourceBadge({ source }: { source: SearchSourceDetail }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs transition-colors hover:bg-primary/10"
        >
          {source.domain}
          <span className="ml-0.5">
            <ExternalLinkIcon size={10} />
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" className="max-w-xs text-xs">
        <div className="space-y-1">
          <h5 className="font-medium">{source.title}</h5>
          {source.summary && <p className="text-muted-foreground">{source.summary}</p>}
          <div className="text-xs text-muted-foreground/80">{source.url}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function SourceBadgeSimple({ source }: { source: string }) {
  // Extract a plausible URL for basic sources
  const url = source.includes('.')
    ? `https://${source}.com`
    : `https://www.google.com/search?q=${encodeURIComponent(source)}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs transition-colors hover:bg-primary/10"
        >
          {source}
          <span className="ml-0.5">
            <ExternalLinkIcon size={10} />
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" className="max-w-xs text-xs">
        <div>Click to search for {source}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function AnalysisPoint({ point }: { point: SearchAnalysisPoint }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <h4 className="mb-1 text-sm font-medium">{point.title}</h4>
      <p className="text-sm text-muted-foreground">{point.content}</p>

      {point.sources && point.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {point.sources.map((source, idx) => (
            <span key={idx} className="text-xs text-muted-foreground">
              {idx > 0 && ', '}
              {source}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Fallback component that displays search results in a simplified format
// when no steps are available
function FallbackSearchResults({ searchResults }: { searchResults: SearchResults }) {
  return (
    <div className="flex flex-col gap-4">
      {searchResults.query && (
        <div className="text-sm text-muted-foreground">
          Search results for: <span className="font-medium">{searchResults.query}</span>
        </div>
      )}

      {/* Images section */}
      {searchResults.images && searchResults.images.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Images</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {searchResults.images.map((image, index) => (
              <ImageCard key={`image-${index}`} image={image} />
            ))}
          </div>
        </div>
      )}

      {/* Web results section */}
      {searchResults.results && searchResults.results.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Web Results</h3>
          <div className="flex flex-col gap-2">
            {searchResults.results.map((result, index) => (
              <ResultCard key={`result-${index}`} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImageCard({ image }: { image: SearchResultImage }) {
  if (typeof image === 'string') {
    return (
      <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
        <Image src={image} alt="" fill className="object-cover" />
      </div>
    );
  }

  return (
    <div className="group relative aspect-video overflow-hidden rounded-md bg-muted">
      <Image src={image.url} alt={image.description || ''} fill className="object-cover" />
      {image.description && (
        <div className="absolute inset-0 flex items-end bg-black/60 p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="text-xs text-white">{image.description}</p>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: SearchResultItem }) {
  // Extract the domain to determine if we should show an icon
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '').split('.')[0].toLowerCase();
    } catch {
      return '';
    }
  };

  const domain = result.source || getDomain(result.url);
  const showIcon =
    domain && ['cnbc', 'bloomberg', 'reuters', 'nytimes', 'bbc', 'cnn'].includes(domain);

  return (
    <Card className="mb-2 overflow-hidden">
      <CardHeader className="p-3 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            <Link href={result.url} target="_blank" className="text-primary hover:underline">
              {result.title}
            </Link>
          </CardTitle>
          {showIcon && (
            <div className="shrink-0">
              <Image
                src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
                alt={`${domain} icon`}
                width={60}
                height={40}
                className="rounded"
              />
            </div>
          )}
        </div>
        <CardDescription className="truncate text-xs">{result.url}</CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-2">
        <div className="text-sm text-muted-foreground">
          <Markdown>{result.content}</Markdown>
        </div>
      </CardContent>
    </Card>
  );
}
