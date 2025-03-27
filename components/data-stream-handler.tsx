'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { artifactDefinitions, type ArtifactKind } from './artifact';
import type { Suggestion } from '@/lib/db/schema';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';
import { useSearch } from '@/hooks/use-search';
import type { SearchStep } from '@/lib/types/search.type';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'search-status'
    | 'search-query'
    | 'search-step'
    | 'search-error';
  content: string | Suggestion;
};

export function DataStreamHandler({ id }: { id: string }) {
  const { data: dataStream } = useChat({ id });
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const {
    setSearchStatus,
    setSearchQuery,
    addSearchStep,
    resetSearch,
    setSearchError,
    status: searchStatus
  } = useSearch();

  const lastProcessedIndex = useRef(-1);
  // Track if a tool call is in progress
  const searchToolInProgress = useRef(false);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      // Handle search-related stream data
      console.log(`delta: ${JSON.stringify(delta)}`);
      console.log(`delta.type: ${delta.type}`);

      // Check if a tool call is starting
      if (delta.type === 'search-status') {
        const status = delta.content as string;
        if (status === 'starting') {
          // Reset search state at start of new search
          resetSearch();
          searchToolInProgress.current = true;
        } else if (status === 'completed' || status === 'error') {
          // Mark search as no longer in progress
          searchToolInProgress.current = false;
        }

        // Update search status in store
        setSearchStatus(status);
        return;
      }

      // Only process search-related updates if we're in an active search
      // or we have received a 'starting' status recently
      if (searchToolInProgress.current || searchStatus !== 'idle') {
        if (delta.type === 'search-query') {
          console.log(`search-query: ${delta.content}`);
          setSearchQuery(delta.content as string);
          return;
        }

        if (delta.type === 'search-step') {
          console.log(`search-step: ${delta.content}`);
          try {
            const step = JSON.parse(delta.content as string) as SearchStep;
            // Set status to searching when we're receiving steps
            if (searchStatus === 'idle' || searchStatus === 'starting') {
              setSearchStatus('searching');
            }
            addSearchStep(step);
          } catch (error) {
            console.error('Failed to parse search step', error);
          }
          return;
        }

        if (delta.type === 'search-error') {
          try {
            const error = JSON.parse(delta.content as string);
            setSearchError(error.message);
            searchToolInProgress.current = false;
          } catch (error) {
            setSearchError('Unknown search error');
            searchToolInProgress.current = false;
          }
          return;
        }
      }

      // Handle artifact-related stream data
      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (delta.type) {
          case 'id':
            return {
              ...draftArtifact,
              documentId: delta.content as string,
              status: 'streaming'
            };

          case 'title':
            return {
              ...draftArtifact,
              title: delta.content as string,
              status: 'streaming'
            };

          case 'kind':
            return {
              ...draftArtifact,
              kind: delta.content as ArtifactKind,
              status: 'streaming'
            };

          case 'clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming'
            };

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle'
            };

          default:
            return draftArtifact;
        }
      });
    });
  }, [
    dataStream,
    setArtifact,
    setMetadata,
    artifact,
    setSearchStatus,
    setSearchQuery,
    addSearchStep,
    resetSearch,
    setSearchError,
    searchStatus
  ]);

  return null;
}
