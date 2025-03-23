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
  const { setSearchStatus, setSearchQuery, addSearchStep, resetSearch, setSearchError } =
    useSearch();
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      // Handle search-related stream data
      if (delta.type === 'search-status') {
        const status = delta.content as string;
        if (status === 'starting') {
          resetSearch();
        }
        setSearchStatus(status);
        return;
      }

      if (delta.type === 'search-query') {
        setSearchQuery(delta.content as string);
        return;
      }

      if (delta.type === 'search-step') {
        try {
          const step = JSON.parse(delta.content as string) as SearchStep;
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
        } catch (error) {
          setSearchError('Unknown search error');
        }
        return;
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
    setSearchError
  ]);

  return null;
}
