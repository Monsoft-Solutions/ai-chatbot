'use client';

import { create } from 'zustand';
import type { SearchResults, SearchStep } from '@/lib/types/search.type';

type SearchStatus = 'idle' | 'starting' | 'searching' | 'completed' | 'error';

interface SearchState {
  status: SearchStatus;
  query: string;
  steps: SearchStep[];
  error: string | null;
  results: SearchResults | null;

  // Actions
  setSearchStatus: (status: string) => void;
  setSearchQuery: (query: string) => void;
  addSearchStep: (step: SearchStep) => void;
  updateSearchStep: (index: number, step: Partial<SearchStep>) => void;
  setSearchResults: (results: SearchResults) => void;
  setSearchError: (error: string) => void;
  resetSearch: () => void;
}

export const useSearch = create<SearchState>((set, get) => ({
  status: 'idle',
  query: '',
  steps: [],
  error: null,
  results: null,

  setSearchStatus: (status: string) => {
    let newStatus: SearchStatus = 'idle';
    console.log(`Setting search status: ${status}`);

    switch (status) {
      case 'starting':
        newStatus = 'starting';
        break;
      case 'searching':
        newStatus = 'searching';
        break;
      case 'completed':
        newStatus = 'completed';
        break;
      case 'error':
        newStatus = 'error';
        break;
      default:
        newStatus = 'idle';
    }

    // Only update if status is actually changing
    if (get().status !== newStatus) {
      console.log(`Updating search status from ${get().status} to ${newStatus}`);
      set({ status: newStatus });
    }
  },

  setSearchQuery: (query: string) => {
    console.log(`Setting search query: ${query}`);
    set({ query });

    // When we set a query and status is idle, update to starting
    const currentStatus = get().status;
    if (currentStatus === 'idle') {
      get().setSearchStatus('starting');
    }
  },

  addSearchStep: (step: SearchStep) => {
    console.log(`Adding/updating search step: ${step.title}`);

    // If we're adding steps, ensure status reflects we're searching
    const currentStatus = get().status;
    if (currentStatus === 'idle' || currentStatus === 'starting') {
      get().setSearchStatus('searching');
    }

    set((state) => {
      const existingIndex = state.steps.findIndex((s) => s.title === step.title);

      if (existingIndex >= 0) {
        // Update existing step
        const newSteps = [...state.steps];
        newSteps[existingIndex] = { ...newSteps[existingIndex], ...step };
        return { steps: newSteps };
      } else {
        // Add new step
        return { steps: [...state.steps, step] };
      }
    });
  },

  updateSearchStep: (index: number, stepUpdates: Partial<SearchStep>) =>
    set((state) => {
      console.log(`Updating search step at index: ${index}`);
      if (index < 0 || index >= state.steps.length) return state;

      const newSteps = [...state.steps];
      newSteps[index] = { ...newSteps[index], ...stepUpdates };

      return { steps: newSteps };
    }),

  setSearchResults: (results: SearchResults) => {
    console.log(`Setting search results with ${results.results?.length || 0} items`);

    // If we have results and no completion status, mark as completed
    const currentStatus = get().status;
    if (
      results?.results?.length > 0 &&
      currentStatus !== 'completed' &&
      currentStatus !== 'error'
    ) {
      get().setSearchStatus('completed');
    }

    set({ results });
  },

  setSearchError: (error: string) => {
    console.log(`Setting search error: ${error}`);
    set({ error, status: 'error' });
  },

  resetSearch: () => {
    console.log('Resetting search state');
    set({
      status: 'idle',
      query: '',
      steps: [],
      error: null,
      results: null
    });
  }
}));
