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

export const useSearch = create<SearchState>((set) => ({
  status: 'idle',
  query: '',
  steps: [],
  error: null,
  results: null,

  setSearchStatus: (status: string) => {
    let newStatus: SearchStatus = 'idle';

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

    set({ status: newStatus });
  },

  setSearchQuery: (query: string) => set({ query }),

  addSearchStep: (step: SearchStep) =>
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
    }),

  updateSearchStep: (index: number, stepUpdates: Partial<SearchStep>) =>
    set((state) => {
      if (index < 0 || index >= state.steps.length) return state;

      const newSteps = [...state.steps];
      newSteps[index] = { ...newSteps[index], ...stepUpdates };

      return { steps: newSteps };
    }),

  setSearchResults: (results: SearchResults) => set({ results }),

  setSearchError: (error: string) => set({ error, status: 'error' }),

  resetSearch: () =>
    set({
      status: 'idle',
      query: '',
      steps: [],
      error: null,
      results: null
    })
}));
