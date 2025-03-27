# tRPC Implementation

## Overview

This document outlines the implementation of tRPC for the AI Chatbot API. tRPC provides end-to-end type safety between the server and client, dramatically improving developer experience and reducing runtime errors.

## Key Benefits

- **Type Safety**: Full TypeScript type inference from backend to frontend
- **Automatic Client Generation**: No need to manually create API clients
- **Simplified API Development**: Reduced boilerplate compared to REST
- **OpenAPI Integration**: Compatibility with standard REST clients
- **Performance**: Efficient data transfer with minimal overhead

## Architecture

The tRPC implementation follows a modular architecture:

```
┌─────────────────────┐
│                     │
│    API Routes       │
│    /api/trpc/[...]  │
│                     │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────┐
│                      │
│    App Router        │
│                      │
└──────┬───────┬───────┘
       │       │
┌──────▼─┐ ┌───▼───┐ ┌──▼────┐
│        │ │       │ │       │
│ Chat   │ │ Agent │ │ User  │
│ Router │ │ Router│ │ Router│
│        │ │       │ │       │
└────────┘ └───────┘ └───────┘
       │       │       │
       ▼       ▼       ▼
┌─────────────────────────┐
│                         │
│     Service Layer       │
│                         │
└─────────────────────────┘
```

## Core Implementation

### tRPC Server Setup

```typescript
// src/server/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { OpenApiMeta } from 'trpc-openapi';
import { validateAPIKey } from '../services/auth';
import type { Context } from './context';

const t = initTRPC
  .context<Context>()
  .meta<OpenApiMeta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          code: error.code,
          httpStatus: shape.data?.httpStatus,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      };
    }
  });

export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure that requires authentication
export const protectedProcedure = t.procedure.use(
  middleware(async ({ ctx, next }) => {
    if (!ctx.apiKey) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'API key is required'
      });
    }

    const validatedKey = await validateAPIKey(ctx.apiKey);

    if (!validatedKey) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      });
    }

    return next({
      ctx: {
        ...ctx,
        organizationId: validatedKey.organizationId,
        apiKeyScopes: validatedKey.scopes
      }
    });
  })
);

// Procedure that checks for specific API key scopes
export const scopedProcedure = (requiredScopes: string[]) =>
  protectedProcedure.use(
    middleware(async ({ ctx, next }) => {
      const hasRequiredScopes = requiredScopes.every((scope) => ctx.apiKeyScopes.includes(scope));

      if (!hasRequiredScopes) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'API key does not have the required scopes'
        });
      }

      return next({ ctx });
    })
  );
```

### Context Creation

```typescript
// src/server/context.ts
import { inferAsyncReturnType } from '@trpc/server';
import { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getDb } from '../db';

export async function createContext({ req, res }: CreateNextContextOptions) {
  // Get the API key from the Authorization header
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  return {
    req,
    res,
    db: getDb(),
    apiKey,
    // These will be set in the protected procedure
    organizationId: null as string | null,
    apiKeyScopes: [] as string[]
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
```

### API Router Configuration

```typescript
// src/server/routers/_app.ts
import { router } from '../trpc';
import { chatRouter } from './chat';
import { agentRouter } from './agent';
import { userRouter } from './user';
import { organizationRouter } from './organization';

export const appRouter = router({
  chat: chatRouter,
  agent: agentRouter,
  user: userRouter,
  organization: organizationRouter
});

export type AppRouter = typeof appRouter;
```

### Feature Router Example

```typescript
// src/server/routers/chat.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, scopedProcedure } from '../trpc';
import { chatService } from '../../services/chat';

export const chatRouter = router({
  list: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/conversations',
        tags: ['chat'],
        summary: 'List all conversations'
      }
    })
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        cursor: z.string().optional()
      })
    )
    .output(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            createdAt: z.date(),
            updatedAt: z.date(),
            messageCount: z.number()
          })
        ),
        nextCursor: z.string().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor } = input;
      const { organizationId } = ctx;

      const result = await chatService.listConversations({
        organizationId: organizationId!,
        limit,
        cursor
      });

      return result;
    }),

  byId: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/conversations/{id}',
        tags: ['chat'],
        summary: 'Get conversation by ID'
      }
    })
    .input(
      z.object({
        id: z.string()
      })
    )
    .output(
      z.object({
        id: z.string(),
        title: z.string(),
        createdAt: z.date(),
        updatedAt: z.date(),
        messages: z.array(
          z.object({
            id: z.string(),
            role: z.enum(['user', 'assistant', 'system']),
            content: z.string(),
            createdAt: z.date()
          })
        )
      })
    )
    .query(async ({ ctx, input }) => {
      const { id } = input;
      const { organizationId } = ctx;

      const conversation = await chatService.getConversationWithMessages({
        conversationId: id,
        organizationId: organizationId!
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found'
        });
      }

      return conversation;
    }),

  create: scopedProcedure(['write'])
    .meta({
      openapi: {
        method: 'POST',
        path: '/conversations',
        tags: ['chat'],
        summary: 'Create a new conversation'
      }
    })
    .input(
      z.object({
        title: z.string().optional(),
        systemPrompt: z.string().optional()
      })
    )
    .output(
      z.object({
        id: z.string(),
        title: z.string(),
        createdAt: z.date()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { title, systemPrompt } = input;
      const { organizationId } = ctx;

      const conversation = await chatService.createConversation({
        organizationId: organizationId!,
        title: title || 'New Conversation',
        systemPrompt: systemPrompt || 'You are a helpful assistant.'
      });

      return conversation;
    }),

  addMessage: scopedProcedure(['write'])
    .meta({
      openapi: {
        method: 'POST',
        path: '/conversations/{conversationId}/messages',
        tags: ['chat'],
        summary: 'Add a message to a conversation'
      }
    })
    .input(
      z.object({
        conversationId: z.string(),
        content: z.string(),
        role: z.enum(['user', 'system']).default('user')
      })
    )
    .output(
      z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
        createdAt: z.date()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { conversationId, content, role } = input;
      const { organizationId } = ctx;

      // Verify conversation ownership
      const conversation = await chatService.getConversation({
        conversationId,
        organizationId: organizationId!
      });

      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found'
        });
      }

      // Add user message
      const userMessage = await chatService.addMessage({
        conversationId,
        role,
        content
      });

      // If user message, generate AI response
      if (role === 'user') {
        // Handled separately for streaming use case
        await chatService.generateAIResponse(conversationId);
      }

      return userMessage;
    })
});
```

## API Route Setup

```typescript
// src/pages/api/trpc/[trpc].ts
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '../../../server/routers/_app';
import { createContext } from '../../../server/context';

export default createNextApiHandler({
  router: appRouter,
  createContext,
  onError:
    process.env.NODE_ENV === 'development'
      ? ({ path, error }) => {
          console.error(`❌ tRPC error on ${path}: ${error.message}`);
        }
      : undefined
});
```

## OpenAPI Integration

```typescript
// src/pages/api/openapi.ts
import { generateOpenApiDocument } from 'trpc-openapi';
import { appRouter } from '../../server/routers/_app';

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'AI Chatbot API',
  description: 'OpenAPI documentation for the AI Chatbot API',
  version: '1.0.0',
  baseUrl: 'https://api.aichatbot.com'
});

export default function handler(req, res) {
  res.status(200).json(openApiDocument);
}
```

## Rate Limiting and Middleware

```typescript
// src/pages/api/trpc/[trpc].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { appRouter } from '../../../server/routers/_app';
import { createContext } from '../../../server/context';
import { getUserPlanRateLimit } from '../../../services/subscription';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

// Handler with rate limiting
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Skip rate limiting for GET requests
  if (req.method === 'GET') {
    return createNextApiHandler({
      router: appRouter,
      createContext
    })(req, res);
  }

  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({
      error: {
        code: 'authentication_failed',
        message: 'API key is required',
        status: 401
      }
    });
  }

  // Get the appropriate rate limit based on the user's plan
  const { limit, window } = await getUserPlanRateLimit(apiKey);

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true
  });

  const identifier = `api:${apiKey}`;
  const { success, limit: rateLimit, remaining, reset } = await ratelimit.limit(identifier);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', rateLimit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);

  if (!success) {
    return res.status(429).json({
      error: {
        code: 'rate_limit_exceeded',
        message: 'You have exceeded your rate limit',
        status: 429,
        details: {
          limit: rateLimit,
          remaining,
          reset
        }
      }
    });
  }

  // If rate limit check passes, process the request
  return createNextApiHandler({
    router: appRouter,
    createContext
  })(req, res);
}
```

## Streaming Support

```typescript
// src/pages/api/conversations/[id]/messages/stream.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { validateAPIKey } from '../../../../../services/auth';
import { chatService } from '../../../../../services/chat';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({
      error: {
        code: 'authentication_failed',
        message: 'API key is required'
      }
    });
  }

  const validatedKey = await validateAPIKey(apiKey);

  if (!validatedKey) {
    return res.status(401).json({
      error: {
        code: 'authentication_failed',
        message: 'Invalid API key'
      }
    });
  }

  const { id } = req.query;
  const conversationId = Array.isArray(id) ? id[0] : id;

  if (!conversationId) {
    return res.status(400).json({
      error: {
        code: 'invalid_request',
        message: 'Conversation ID is required'
      }
    });
  }

  // Verify conversation ownership
  const conversation = await chatService.getConversation({
    conversationId,
    organizationId: validatedKey.organizationId
  });

  if (!conversation) {
    return res.status(404).json({
      error: {
        code: 'resource_not_found',
        message: 'Conversation not found'
      }
    });
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Start streaming
  try {
    await chatService.streamConversation({
      conversationId,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
        // Flush the response to ensure data is sent immediately
        res.flush?.();
      },
      onComplete: () => {
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    });
  } catch (error) {
    console.error('Streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: 'An error occurred during streaming' })}\n\n`);
    res.end();
  }
}
```

## React Client Integration

```typescript
// src/utils/trpc.ts
import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import superjson from 'superjson';
import type { AppRouter } from '../server/routers/_app';

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return '';
  }

  // SSR should use the server URL
  return process.env.NEXT_PUBLIC_API_URL || `http://localhost:${process.env.PORT ?? 3000}`;
}

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error)
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            return {
              // Get API key from local storage or session
              Authorization: `Bearer ${localStorage.getItem('apiKey')}`
            };
          }
        })
      ]
    };
  },
  ssr: false
});
```

## Error Mapping

```typescript
// src/utils/api-errors.ts
import { TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../server/routers/_app';

type RouterError = TRPCClientError<AppRouter>;

export function mapTRPCErrorToUserFriendlyMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const trpcError = error as RouterError;

    // Handle specific error codes
    switch (trpcError.data?.code) {
      case 'UNAUTHORIZED':
        return 'Your API key is invalid or expired. Please check your credentials.';

      case 'FORBIDDEN':
        return 'You do not have permission to perform this action.';

      case 'NOT_FOUND':
        return 'The requested resource was not found.';

      case 'TIMEOUT':
        return 'The request timed out. Please try again.';

      case 'TOO_MANY_REQUESTS':
        return 'Rate limit exceeded. Please try again later.';

      case 'INTERNAL_SERVER_ERROR':
        return 'An unexpected error occurred. Our team has been notified.';

      default:
        return trpcError.message;
    }
  }

  return 'An unexpected error occurred';
}
```

## Optimistic Updates

```typescript
// src/components/ChatInput.tsx
import { useState } from 'react';
import { trpc } from '../utils/trpc';
import { mapTRPCErrorToUserFriendlyMessage } from '../utils/api-errors';

export function ChatInput({ conversationId }: { conversationId: string }) {
  const [input, setInput] = useState('');
  const utils = trpc.useContext();

  const { mutate, isLoading } = trpc.chat.addMessage.useMutation({
    // Optimistically update the UI
    onMutate: async (newMessage) => {
      // Cancel outgoing fetches
      await utils.chat.byId.cancel({ id: conversationId });

      // Get current data
      const prevData = utils.chat.byId.getData({ id: conversationId });

      // Optimistically update to the new value
      utils.chat.byId.setData({ id: conversationId }, (old) => {
        if (!old) return old;

        return {
          ...old,
          messages: [
            ...old.messages,
            {
              id: `temp-${Date.now()}`,
              role: 'user',
              content: newMessage.content,
              createdAt: new Date(),
            },
            // Add a loading message for the assistant
            {
              id: `temp-assistant-${Date.now()}`,
              role: 'assistant',
              content: '...',
              createdAt: new Date(),
            },
          ],
        };
      });

      // Return previous data so we can revert if error
      return { prevData };
    },
    onError: (err, newMessage, context) => {
      // Revert to previous data on error
      if (context?.prevData) {
        utils.chat.byId.setData(
          { id: conversationId },
          context.prevData
        );
      }

      // Show error to user
      alert(mapTRPCErrorToUserFriendlyMessage(err));
    },
    onSettled: () => {
      // Refetch after error or success to update with accurate data
      utils.chat.byId.invalidate({ id: conversationId });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    mutate({
      conversationId,
      content: input,
      role: 'user',
    });

    setInput('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a message..."
        disabled={isLoading}
      />
      <button type="submit" disabled={isLoading}>
        Send
      </button>
    </form>
  );
}
```

## Testing

```typescript
// src/__tests__/trpc.test.ts
import { inferProcedureInput } from '@trpc/server';
import { createInnerTRPCContext } from '../server/context';
import { appRouter, AppRouter } from '../server/routers/_app';

// Mock database and services
jest.mock('../services/chat', () => ({
  chatService: {
    listConversations: jest.fn(),
    getConversationWithMessages: jest.fn(),
    createConversation: jest.fn(),
    addMessage: jest.fn(),
    generateAIResponse: jest.fn()
  }
}));

import { chatService } from '../services/chat';

describe('Chat Router', () => {
  test('list conversations', async () => {
    // Arrange
    const mockData = {
      items: [
        {
          id: 'conv_123',
          title: 'Test Conversation',
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 2
        }
      ],
      nextCursor: undefined
    };

    (chatService.listConversations as jest.Mock).mockResolvedValue(mockData);

    // Create a context with a valid API key
    const ctx = createInnerTRPCContext({
      apiKey: 'valid_key',
      organizationId: 'org_123',
      apiKeyScopes: ['read']
    });

    // Create the caller
    const caller = appRouter.createCaller(ctx);

    // Act
    type Input = inferProcedureInput<AppRouter['chat']['list']>;
    const input: Input = { limit: 10 };

    const result = await caller.chat.list(input);

    // Assert
    expect(result).toEqual(mockData);
    expect(chatService.listConversations).toHaveBeenCalledWith({
      organizationId: 'org_123',
      limit: 10,
      cursor: undefined
    });
  });
});
```

## Conclusion

Our tRPC implementation delivers a powerful, type-safe API that significantly improves developer experience for both internal and third-party developers. The architecture supports modern features like streaming, optimistic updates, and OpenAPI compatibility while maintaining high performance and security standards.
