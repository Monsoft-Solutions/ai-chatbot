import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Markdown } from './markdown';
import type { SearchResultImage, SearchResultItem, SearchResults } from '@/lib/types/search.type';

export function SearchResults({ searchResults }: { searchResults: SearchResults }) {
  if (!searchResults || (!searchResults.results?.length && !searchResults.images?.length)) {
    return <div className="text-center text-muted-foreground">No search results found</div>;
  }

  return (
    <div className="flex w-full flex-col gap-4">
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
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 pb-0">
        <CardTitle className="text-sm">
          <Link href={result.url} target="_blank" className="text-primary hover:underline">
            {result.title}
          </Link>
        </CardTitle>
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
