# API Abstraction Layer

## Overview

The application currently makes API calls directly from components using useSWR with hardcoded endpoint strings. This scattered approach to API interactions creates maintenance challenges, inconsistent error handling, and tight coupling between UI components and data fetching logic. This document outlines a comprehensive strategy to implement a proper API abstraction layer.

## Location in Code

Various components throughout the codebase, notably in:

`components/artifact.tsx`:

```typescript
const {
  data: documents,
  isLoading: isDocumentsFetching,
  mutate: mutateDocuments
} = useSWR<Array<Document>>(
  artifact.documentId !== 'init' && artifact.status !== 'streaming'
    ? `/api/document?id=${artifact.documentId}`
    : null,
  fetcher
);
```

## Issue/Reason for Improvement

The current approach to API calls has several significant issues:

1. **Scattered API Logic**: API endpoint strings are hardcoded throughout multiple components
2. **Inconsistent Error Handling**: Each component implements its own error handling (or lacks it)
3. **Type Safety Gaps**: Limited type checking between API responses and the expected data structures
4. **Testing Difficulty**: Direct API calls in components make testing more complex
5. **Code Duplication**: Similar API call patterns are repeated across components
6. **Poor Separation of Concerns**: Components mix UI rendering with data fetching logic

## Detailed Analysis

### Current API Call Patterns

- Direct useSWR calls embedded in components
- Hardcoded API endpoint strings
- Inconsistent null/undefined checking
- Minimal error handling
- No centralized request/response interceptors
- No request caching strategy besides SWR's built-in features

### Impact on Development

- Changing an API endpoint requires searching through components
- Error handling is inconsistent across the application
- Difficult to implement global loading states or error handling
- Type mismatches between expected and actual API responses
- Component testing requires mocking direct API calls

## Suggested Enhancement

Implement a comprehensive API service layer that centralizes all API interactions:

1. Create type-safe API service modules for each resource type
2. Implement consistent error handling and logging
3. Centralize authentication and request/response preprocessing
4. Abstract SWR usage into custom hooks with consistent patterns

## Implementation Steps

### 1. Create a Base API Service

```typescript
// lib/services/api/client.ts
export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Base fetch wrapper with error handling
export async function fetchWithErrorHandling<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new APIError(
      response.status,
      errorData.message || `API error: ${response.statusText}`,
      errorData
    );
  }

  // For 204 No Content
  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}
```

### 2. Create Resource-Specific API Services

```typescript
// lib/services/api/documents.ts
import { Document } from '@/lib/db/schema';
import { fetchWithErrorHandling } from './client';

export type CreateDocumentParams = {
  content: string;
  chatId: string;
  kind: string;
  title: string;
};

export type UpdateDocumentParams = {
  id: string;
  content: string;
};

export const DocumentsAPI = {
  getDocument: async (id: string): Promise<Document> => {
    return fetchWithErrorHandling<Document>(`/api/document?id=${id}`);
  },

  getDocumentVersions: async (id: string): Promise<Array<Document>> => {
    return fetchWithErrorHandling<Array<Document>>(`/api/document?id=${id}`);
  },

  createDocument: async (params: CreateDocumentParams): Promise<Document> => {
    return fetchWithErrorHandling<Document>('/api/document', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  updateDocument: async (params: UpdateDocumentParams): Promise<Document> => {
    return fetchWithErrorHandling<Document>('/api/document', {
      method: 'PUT',
      body: JSON.stringify(params)
    });
  },

  deleteDocument: async (id: string): Promise<void> => {
    return fetchWithErrorHandling<void>('/api/document', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    });
  }
};
```

### 3. Create Custom Hooks for Data Fetching

```typescript
// lib/services/hooks/useDocument.ts
import { Document } from '@/lib/db/schema';
import { DocumentsAPI } from '../api/documents';
import useSWR from 'swr';
import { useCallback } from 'react';

export function useDocument(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? [`document`, id] : null,
    async ([_, documentId]) => {
      return await DocumentsAPI.getDocument(documentId);
    }
  );

  const updateDocument = useCallback(
    async (content: string): Promise<Document> => {
      if (!id) throw new Error('Document ID is required');

      try {
        const updatedDoc = await DocumentsAPI.updateDocument({
          id,
          content
        });

        // Optimistically update the local data
        mutate(updatedDoc, false);
        return updatedDoc;
      } catch (error) {
        // Revalidate on error
        mutate();
        throw error;
      }
    },
    [id, mutate]
  );

  return {
    document: data,
    isLoading,
    error,
    updateDocument,
    mutate
  };
}
```

### 4. Create an Error Handling Utility

```typescript
// lib/utils/errorHandler.ts
import { APIError } from '../services/api/client';
import { toast } from 'sonner';

type ErrorOptions = {
  showToast?: boolean;
  logToService?: boolean;
};

export function handleError(error: unknown, options: ErrorOptions = { showToast: true }) {
  let message = 'An unexpected error occurred';
  let statusCode = 500;

  if (error instanceof APIError) {
    statusCode = error.statusCode;
    message = error.message;

    // Handle specific error codes
    if (statusCode === 401) {
      message = 'Your session has expired. Please login again.';
      // Redirect to login potentially
    } else if (statusCode === 403) {
      message = 'You do not have permission to perform this action';
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  // Show toast if enabled
  if (options.showToast) {
    toast.error(message);
  }

  // Log to error service if enabled
  if (options.logToService) {
    // logErrorToService(message, error);
    console.error(error);
  }

  return { message, statusCode };
}
```

### 5. Update Components to Use the New Services

```typescript
// Example refactored component
function DocumentEditor({ documentId }: { documentId: string }) {
  const {
    document,
    isLoading,
    error,
    updateDocument
  } = useDocument(documentId);

  const [content, setContent] = useState('');

  useEffect(() => {
    if (document) {
      setContent(document.content);
    }
  }, [document]);

  const handleSave = async () => {
    try {
      await updateDocument(content);
      toast.success('Document saved successfully');
    } catch (error) {
      handleError(error);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading document</div>;

  return (
    <div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

### 6. Create Constants for API Endpoints

```typescript
// lib/constants/api.ts
export const API_ENDPOINTS = {
  DOCUMENTS: '/api/document',
  CHAT: '/api/chat',
  HISTORY: '/api/history',
  VOTE: '/api/vote',
  AUTH: '/api/auth',
  SEARCH: '/api/search'
};
```

## Expected Impact

- **Improved Maintainability**: Centralized API logic makes changes to endpoints or payloads easier
- **Consistent Error Handling**: Standardized approach to handling and displaying errors
- **Enhanced Type Safety**: Strong typing between API interactions and application code
- **Better Testing**: Mocking service functions instead of direct API calls
- **Code Reusability**: Avoid duplicating API call patterns across components
- **Separation of Concerns**: UI components focus on rendering, not data fetching

## Testing Strategy

1. Unit tests for each API service function
2. Mock responses for expected success and error scenarios
3. Test hooks with mock SWR implementations
4. Integration tests for common data flow patterns

## Risks and Mitigation

- **Initial Refactoring Effort**: Implement changes gradually, focusing on high-value areas first
- **Learning Curve**: Document the new patterns and provide examples for the team
- **Potential Performance Impact**: Monitor API call patterns to avoid unnecessary fetches

## Priority

Medium - While this isn't the highest priority, implementing it will provide significant architectural benefits and make other refactoring efforts easier.
