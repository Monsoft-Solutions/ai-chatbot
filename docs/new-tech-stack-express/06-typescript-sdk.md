# TypeScript SDK Implementation

## Overview

This document outlines the implementation of a TypeScript SDK for the VernisAI platform. The SDK provides third-party developers with a type-safe, developer-friendly way to integrate with the VernisAI API.

## Goals

- Provide a strongly-typed client experience using TypeScript
- Abstract away the complexity of API communication
- Ensure consistent error handling across all API interactions
- Support streaming responses for real-time AI interactions
- Generate SDK automatically from the tRPC router definitions

## SDK Architecture

The SDK follows a modular design that mirrors the API structure:

```
┌─────────────────────────┐
│                         │
│    Third-Party App      │
│                         │
└────────────┬────────────┘
             │
     ┌───────▼──────────┐
     │                  │
     │   SDK Client     │
     │                  │
     └┬──────┬──────┬───┘
      │      │      │
┌─────▼─┐ ┌──▼───┐ ┌▼───────┐
│       │ │      │ │        │
│ Chat  │ │Agents│ │ Users  │
│       │ │      │ │        │
└───────┘ └──────┘ └────────┘
```

## Implementation

### Core Client

The core client handles authentication, request construction, and response parsing:

```typescript
// src/sdk/client.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/routers/_app';
import { handleError } from './error-handling';

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export function createClient(options: ClientOptions) {
  const { apiKey, baseUrl = 'https://app.vernis.ai/api', timeout = 30000 } = options;

  const client = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        headers: () => ({
          Authorization: `Bearer ${apiKey}`
        }),
        fetch: (url, options) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          return fetch(url, {
            ...options,
            signal: controller.signal
          })
            .then((response) => {
              clearTimeout(timeoutId);
              return response;
            })
            .catch((error) => {
              clearTimeout(timeoutId);
              throw handleError(error);
            });
        }
      })
    ]
  });

  return client;
}
```

### Error Handling

A standardized error handling module ensures consistent error management:

```typescript
// src/sdk/error-handling.ts
export class APIError extends Error {
  code: string;
  status: number;
  details?: Record<string, any>;

  constructor(message: string, code: string, status: number, details?: Record<string, any>) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function handleError(error: any): never {
  // Network errors
  if (error.name === 'AbortError') {
    throw new APIError('Request timed out', 'request_timeout', 408);
  }

  if (!error.json) {
    throw new APIError(error.message || 'Network error occurred', 'network_error', 0);
  }

  // Parse API error response
  const data = error.json;
  if (data?.error) {
    throw new APIError(data.error.message, data.error.code, data.error.status, data.error.details);
  }

  // Fallback for unexpected errors
  throw new APIError('An unexpected error occurred', 'unknown_error', 500);
}
```

### Streaming Support

The SDK provides first-class support for streaming responses:

```typescript
// src/sdk/streaming.ts
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source';

export interface StreamOptions {
  apiKey: string;
  baseUrl: string;
  endpoint: string;
  onMessage: (message: any) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;
}

export function createStream(options: StreamOptions) {
  const { apiKey, baseUrl, endpoint, onMessage, onError, onComplete, signal } = options;

  let isClosed = false;

  const controller = new AbortController();
  const combinedSignal = signal ? new AbortController().signal : controller.signal;

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  fetchEventSource(`${baseUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream'
    },
    signal: combinedSignal,
    onmessage(event: EventSourceMessage) {
      try {
        if (event.data === '[DONE]') {
          if (onComplete && !isClosed) {
            onComplete();
          }
          isClosed = true;
          return;
        }

        const parsedData = JSON.parse(event.data);
        onMessage(parsedData);
      } catch (error) {
        if (onError && !isClosed) {
          onError(error as Error);
        }
      }
    },
    onerror(error) {
      if (onError && !isClosed) {
        onError(error);
      }
      isClosed = true;
      throw error; // This will cause the fetchEventSource to close
    },
    onclose() {
      if (onComplete && !isClosed) {
        onComplete();
      }
      isClosed = true;
    }
  });

  return {
    close: () => {
      if (!isClosed) {
        controller.abort();
        isClosed = true;
      }
    }
  };
}
```

### Module Structure

The SDK mirrors the API's modular structure:

```typescript
// src/sdk/index.ts
import { createClient, ClientOptions } from './client';
import { createStream } from './streaming';

export { APIError } from './error-handling';

export function createSDKClient(options: ClientOptions) {
  const trpcClient = createClient(options);

  return {
    ...trpcClient,

    // Enhanced functionality for streaming
    conversations: {
      ...trpcClient.conversations,
      streamMessages: (conversationId: string, options: any = {}) => {
        return createStream({
          apiKey: options.apiKey,
          baseUrl: options.baseUrl || 'https://app.vernis.ai/api',
          endpoint: `/conversations/${conversationId}/messages/stream`,
          onMessage: options.onMessage,
          onError: options.onError,
          onComplete: options.onComplete,
          signal: options.signal
        });
      }
    },

    agents: {
      ...trpcClient.agents,
      streamRun: (agentId: string, input: string, options: any = {}) => {
        return createStream({
          apiKey: options.apiKey,
          baseUrl: options.baseUrl || 'https://app.vernis.ai/api',
          endpoint: `/agents/${agentId}/run/stream`,
          onMessage: options.onMessage,
          onError: options.onError,
          onComplete: options.onComplete,
          signal: options.signal
        });
      }
    }
  };
}

export default createSDKClient;
```

## Automatic SDK Generation

The SDK is automatically generated from the tRPC router definitions:

```typescript
// scripts/generate-sdk.ts
import { generateClientDefinition } from 'trpc-typescript-sdk-generator';
import { resolve } from 'path';
import { writeFileSync } from 'fs';
import { appRouter } from '../src/server/routers/_app';

async function generateSDK() {
  console.log('Generating TypeScript SDK...');

  const outputPath = resolve(__dirname, '../packages/sdk/src/generated');

  // Generate the client type definitions
  const clientDefs = generateClientDefinition({
    router: appRouter,
    outputDir: outputPath,
    // Additional options
    includeServerValidation: false,
    generateReactHooks: false
  });

  // Write client index
  writeFileSync(resolve(outputPath, 'index.ts'), clientDefs.clientIndexSource);

  console.log('SDK generated successfully at', outputPath);
}

generateSDK().catch(console.error);
```

## NPM Package Structure

The SDK is published as an NPM package:

```
packages/
└── sdk/
    ├── src/
    │   ├── generated/
    │   │   └── ... (auto-generated)
    │   ├── client.ts
    │   ├── error-handling.ts
    │   ├── streaming.ts
    │   └── index.ts
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

Package.json configuration:

```json
{
  "name": "@vernisai/sdk",
  "version": "1.0.0",
  "description": "TypeScript SDK for VernisAI",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc",
    "prepare": "npm run build"
  },
  "dependencies": {
    "@microsoft/fetch-event-source": "^2.0.1",
    "@trpc/client": "^10.35.0"
  },
  "devDependencies": {
    "typescript": "^5.1.6"
  },
  "peerDependencies": {
    "typescript": ">=4.7.0"
  }
}
```

## Usage Examples

### Basic Usage

```typescript
import { createClient } from '@vernisai/sdk';

// Initialize client
const client = createClient({
  apiKey: 'your_api_key'
});

// List conversations
async function listConversations() {
  const conversations = await client.conversations.list();
  console.log(conversations);
}

// Create a conversation
async function createConversation() {
  const conversation = await client.conversations.create({
    title: 'New Conversation',
    systemPrompt: 'You are a helpful assistant.'
  });
  return conversation;
}

// Send a message
async function sendMessage(conversationId: string, content: string) {
  const message = await client.conversations.messages.create({
    conversationId,
    content,
    role: 'user'
  });
  return message;
}
```

### Streaming Example

```typescript
import { createClient } from '@vernisai/sdk';

const client = createClient({
  apiKey: 'your_api_key'
});

function streamChat(conversationId: string) {
  const stream = client.conversations.streamMessages(conversationId, {
    onMessage: (message) => {
      console.log('Received message chunk:', message.content);
      // Update UI with message content
    },
    onError: (error) => {
      console.error('Stream error:', error);
    },
    onComplete: () => {
      console.log('Stream completed');
    }
  });

  // To stop streaming
  // stream.close();
}

// Using agent streaming
function streamAgentExecution(agentId: string, input: string) {
  const stream = client.agents.streamRun(agentId, input, {
    onMessage: (step) => {
      console.log('Agent step:', step);
      // Update UI with agent progress
    },
    onComplete: () => {
      console.log('Agent execution completed');
    }
  });

  return stream;
}
```

### Error Handling

```typescript
import { createClient, APIError } from '@vernisai/sdk';

const client = createClient({
  apiKey: 'your_api_key'
});

async function handleAPIRequests() {
  try {
    const result = await client.conversations.list();
    return result;
  } catch (error) {
    if (error instanceof APIError) {
      console.error(`API Error: ${error.message} (${error.code}, Status: ${error.status})`);

      if (error.code === 'rate_limit_exceeded') {
        // Implement retry logic with exponential backoff
      }

      if (error.code === 'authentication_failed') {
        // Prompt for new API key
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}
```

## Versioning and Compatibility

The SDK follows semantic versioning aligned with the API:

- **Major version** (1.x.x): Breaking changes that require code updates
- **Minor version** (x.1.x): New features without breaking changes
- **Patch version** (x.x.1): Bug fixes and small improvements

When the API introduces a new version (e.g., v2), a corresponding SDK major version is released.

## Documentation Generation

API documentation is automatically generated from TypeScript types:

```typescript
// scripts/generate-docs.ts
import { generateDocumentation } from 'typedoc';
import { resolve } from 'path';

async function generateDocs() {
  console.log('Generating SDK documentation...');

  await generateDocumentation({
    entryPoints: [resolve(__dirname, '../packages/sdk/src/index.ts')],
    out: resolve(__dirname, '../docs/sdk'),
    name: 'VernisAI SDK',
    excludePrivate: true,
    excludeProtected: true,
    excludeExternals: true
  });

  console.log('Documentation generated successfully');
}

generateDocs().catch(console.error);
```

## Testing

The SDK includes comprehensive testing:

```typescript
// packages/sdk/__tests__/client.test.ts
import { createClient } from '../src';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.get('https://app.vernis.ai/api/trpc/conversations.list', (req, res, ctx) => {
    const auth = req.headers.get('authorization');

    if (auth !== 'Bearer test_api_key') {
      return res(
        ctx.status(401),
        ctx.json({
          error: {
            code: 'authentication_failed',
            message: 'Invalid API key',
            status: 401
          }
        })
      );
    }

    return res(
      ctx.json({
        result: {
          data: [
            {
              id: 'conv_123',
              title: 'Test Conversation',
              createdAt: '2023-11-15T10:30:00Z'
            }
          ]
        }
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Client', () => {
  test('successful request', async () => {
    const client = createClient({ apiKey: 'test_api_key' });
    const result = await client.conversations.list();

    expect(result).toEqual([
      {
        id: 'conv_123',
        title: 'Test Conversation',
        createdAt: '2023-11-15T10:30:00Z'
      }
    ]);
  });

  test('authentication error', async () => {
    const client = createClient({ apiKey: 'invalid_key' });

    await expect(client.conversations.list()).rejects.toThrow('Invalid API key');
  });
});
```

## Distribution and Release Process

1. **Automated Build**: CI pipeline builds the SDK package
2. **Version Bump**: Auto-increments version based on commit messages
3. **Documentation Update**: Generates and publishes updated docs
4. **NPM Publish**: Publishes the package to NPM registry
5. **Release Notes**: Generates changelog and release notes

## Conclusion

The TypeScript SDK provides a seamless integration experience for third-party developers, with strongly-typed methods, streaming support, and robust error handling. By automatically generating the SDK from the tRPC router definitions, we ensure full type compatibility and consistency between the API and its client library, reducing maintenance overhead and improving developer experience.
