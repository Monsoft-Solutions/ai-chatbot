# Upstash Integration: Workflow, QStash, and Redis

## Overview

This document outlines the implementation of Upstash technologies in the AI Chatbot rebuild, focusing on how Upstash Workflow, QStash, and Redis will be used to enhance application capabilities, reliability, and performance.

## Key Upstash Technologies

### 1. Upstash Workflow

**Purpose**: Orchestrate multi-step agent workflows that can exceed serverless function timeouts

**Features**:

- Durable execution across multiple serverless functions
- State persistence between steps
- Error handling and retry mechanisms
- Timeout management
- Real-time progress tracking

### 2. Upstash QStash

**Purpose**: Reliable message queue for task execution and background processing

**Features**:

- Reliable message delivery
- Scheduled message delivery
- Automatic retries
- Message deduplication
- Dead letter queues

### 3. Upstash Redis

**Purpose**: Fast, scalable data storage for caching, session management, and rate limiting

**Features**:

- Key-value storage
- Pub/Sub messaging
- Rate limiting
- Caching
- Session management

## Implementation Architecture

```
┌─────────────────┐
│                 │
│  Web Interface  │
│                 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │
│  API Endpoints  │◄────┤  Rate Limiting  │
│                 │     │  (Redis)        │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│                 │
│  Auth & Caching │
│  (Redis)        │
│                 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │
│  Agent System   │◄────┤  Memory System  │
│                 │     │  (Redis)        │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│                 │
│  Workflow       │
│  Orchestration  │
│                 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│                 │
│  Tool Execution │
│  (QStash)       │
│                 │
└─────────────────┘
```

## Upstash Workflow Implementation

### Setup and Configuration

```typescript
// packages/agents/workflow/src/config.ts
import { config } from '@upstash/workflow';

export const workflowConfig = config({
  upstash: {
    redis: {
      url: process.env.UPSTASH_REDIS_URL!,
      token: process.env.UPSTASH_REDIS_TOKEN!
    }
  },
  webhooks: {
    enabled: true,
    url: process.env.WORKFLOW_WEBHOOK_URL
  }
});
```

### Agent Workflow Definition

```typescript
// packages/agents/workflow/src/workflows/agent-workflow.ts
import { serve } from '@upstash/workflow/nextjs';
import { workflowConfig } from '../config';

export type AgentWorkflowInput = {
  userId: string;
  agentInstanceId: string;
  goal: string;
  conversationId: string;
};

export const { POST } = serve<AgentWorkflowInput>({
  config: workflowConfig,
  workflow: async (context) => {
    const { userId, agentInstanceId, goal, conversationId } = context.requestPayload;

    // Step 1: Planning
    const plan = await context.run('planning', async () => {
      // Call planning service via API
      const response = await fetch(`${process.env.API_URL}/api/agents/planning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, agentInstanceId, goal, conversationId })
      });

      if (!response.ok) {
        throw new Error(`Planning failed: ${await response.text()}`);
      }

      return response.json();
    });

    // Step 2: Execute each step in the plan
    const results = [];

    for (const step of plan.steps) {
      const result = await context.run(`step-${step.id}`, async () => {
        // Call execution service via API
        const response = await fetch(`${process.env.API_URL}/api/agents/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, agentInstanceId, step, conversationId })
        });

        if (!response.ok) {
          throw new Error(`Step execution failed: ${await response.text()}`);
        }

        return response.json();
      });

      results.push(result);

      // Send real-time update to client via webhook
      await context.webhook.send({
        type: 'step-completed',
        payload: {
          userId,
          conversationId,
          step,
          result
        }
      });
    }

    // Step 3: Reflection and summary
    const summary = await context.run('reflection', async () => {
      // Call reflection service via API
      const response = await fetch(`${process.env.API_URL}/api/agents/reflect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, agentInstanceId, goal, plan, results, conversationId })
      });

      if (!response.ok) {
        throw new Error(`Reflection failed: ${await response.text()}`);
      }

      return response.json();
    });

    return {
      plan,
      results,
      summary
    };
  }
});
```

### Workflow API Route

```typescript
// apps/api/app/api/agents/workflow/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { agentWorkflow } from '@/packages/agents/workflow';
import { saveWorkflow } from '@/packages/database';

export async function POST(req: NextRequest) {
  try {
    const { userId, agentInstanceId, goal, conversationId } = await req.json();

    // Start the workflow
    const { id: workflowId } = await agentWorkflow.POST({
      userId,
      agentInstanceId,
      goal,
      conversationId
    });

    // Save workflow reference in database
    await saveWorkflow({
      userId,
      agentInstanceId,
      workflowId,
      goal,
      status: 'running'
    });

    return NextResponse.json({ workflowId });
  } catch (error) {
    console.error('Failed to start workflow:', error);

    return NextResponse.json({ error: 'Failed to start workflow' }, { status: 500 });
  }
}
```

## QStash Implementation

### Tool Execution Queue

```typescript
// packages/agents/tools/src/queue.ts
import { QStash } from '@upstash/qstash';

const qstash = new QStash({
  token: process.env.QSTASH_TOKEN!
});

export async function queueToolExecution(
  toolName: string,
  parameters: Record<string, any>,
  options: {
    userId: string;
    retries?: number;
    delay?: number;
    deduplicationId?: string;
  }
) {
  const { userId, retries = 3, delay = 0, deduplicationId } = options;

  const messageId = await qstash.publishJSON({
    url: `${process.env.API_URL}/api/tools/${toolName}`,
    body: {
      parameters,
      userId
    },
    retries,
    delay,
    deduplicationId
  });

  return {
    messageId,
    status: 'queued'
  };
}
```

### Tool API Endpoint

```typescript
// apps/api/app/api/tools/[toolName]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '@upstash/qstash/nextjs';
import { executeToolDirectly } from '@/packages/agents/tools';
import { logToolExecution } from '@/packages/database';

async function handler(req: NextRequest, { params }: { params: { toolName: string } }) {
  const { toolName } = params;
  const { parameters, userId } = await req.json();

  try {
    // Execute the tool
    const result = await executeToolDirectly(toolName, parameters, { userId });

    // Log tool execution
    await logToolExecution({
      toolName,
      parameters,
      userId,
      status: 'success',
      result
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);

    // Log failed execution
    await logToolExecution({
      toolName,
      parameters,
      userId,
      status: 'error',
      error: error.message
    });

    return NextResponse.json({ error: `Failed to execute tool ${toolName}` }, { status: 500 });
  }
}

// Verify that the request is coming from QStash
export const POST = verifySignature(handler);
```

## Redis Implementation

### Memory Service Implementation

```typescript
// packages/agents/memory/src/memory-service.ts
import { Redis } from '@upstash/redis';

export class MemoryService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL!,
      token: process.env.UPSTASH_REDIS_TOKEN!
    });
  }

  // Short-term memory (conversation context)
  async storeMessage(userId: string, conversationId: string, message: any) {
    const key = `memory:conversations:${userId}:${conversationId}`;

    await this.redis.lpush(key, JSON.stringify(message));
    await this.redis.ltrim(key, 0, 99); // Keep last 100 messages

    // Set expiration for 30 days
    await this.redis.expire(key, 60 * 60 * 24 * 30);
  }

  async getConversationHistory(userId: string, conversationId: string, limit: number = 50) {
    const key = `memory:conversations:${userId}:${conversationId}`;
    const messages = await this.redis.lrange(key, 0, limit - 1);

    return messages.map((msg) => JSON.parse(msg));
  }

  // Working memory (for workflow execution)
  async storeWorkingMemory(workflowId: string, key: string, value: any, ttl: number = 60 * 60) {
    const memoryKey = `memory:workflows:${workflowId}:${key}`;

    await this.redis.set(memoryKey, JSON.stringify(value));
    await this.redis.expire(memoryKey, ttl);
  }

  async getWorkingMemory(workflowId: string, key: string) {
    const memoryKey = `memory:workflows:${workflowId}:${key}`;
    const value = await this.redis.get(memoryKey);

    return value ? JSON.parse(value as string) : null;
  }

  // Long-term memory (agent knowledge)
  async storeKnowledge(userId: string, agentId: string, key: string, value: any) {
    const knowledgeKey = `memory:knowledge:${userId}:${agentId}:${key}`;

    await this.redis.set(knowledgeKey, JSON.stringify(value));
  }

  async getKnowledge(userId: string, agentId: string, key: string) {
    const knowledgeKey = `memory:knowledge:${userId}:${agentId}:${key}`;
    const value = await this.redis.get(knowledgeKey);

    return value ? JSON.parse(value as string) : null;
  }
}
```

### Caching Implementation

```typescript
// packages/utils/src/cache.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

export async function cacheData<T>(key: string, data: T, ttl: number = 3600) {
  await redis.set(key, JSON.stringify(data), { ex: ttl });
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data as string) : null;
}

export async function invalidateCache(key: string) {
  await redis.del(key);
}

export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {
  // Try to get from cache first
  const cached = await getCachedData<T>(key);

  if (cached) {
    return cached;
  }

  // If not in cache, call the function
  const data = await fn();

  // Store in cache
  await cacheData(key, data, ttl);

  return data;
}
```

### Rate Limiting Implementation

```typescript
// packages/utils/src/rate-limit.ts
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Create Redis instance
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

// Define rate limiters for different endpoints
const rateLimiters = {
  // General API rate limiter - 100 requests per minute
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 m'),
    analytics: true,
    prefix: 'ratelimit:api'
  }),

  // AI chat rate limiter - 20 requests per minute
  chat: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'),
    analytics: true,
    prefix: 'ratelimit:chat'
  }),

  // Agent creation rate limiter - 5 requests per minute
  agentCreation: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'),
    analytics: true,
    prefix: 'ratelimit:agent-creation'
  })
};

export async function checkRateLimit(limiterName: keyof typeof rateLimiters, identifier: string) {
  const limiter = rateLimiters[limiterName];

  if (!limiter) {
    throw new Error(`Rate limiter "${limiterName}" not found`);
  }

  return limiter.limit(identifier);
}
```

### Rate Limiting Middleware

```typescript
// apps/api/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/packages/utils/rate-limit';

export async function middleware(request: NextRequest) {
  // Skip rate limiting for non-API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Determine which rate limiter to use based on the path
  let limiterName: 'api' | 'chat' | 'agentCreation' = 'api';

  if (request.nextUrl.pathname.startsWith('/api/chat')) {
    limiterName = 'chat';
  } else if (request.nextUrl.pathname.startsWith('/api/agents/create')) {
    limiterName = 'agentCreation';
  }

  // Get identifier for rate limiting
  // Use IP address or user ID if authenticated
  const ip = request.ip || 'anonymous';
  const identifier = ip;

  // Check rate limit
  const { success, limit, reset, remaining } = await checkRateLimit(limiterName, identifier);

  // Set rate limit headers
  const response = success
    ? NextResponse.next()
    : NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });

  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', reset.toString());

  return response;
}

export const config = {
  matcher: '/api/:path*'
};
```

## Real-time Updates with Redis Pub/Sub

```typescript
// packages/agents/workflow/src/webhook-handler.ts
import { Redis } from '@upstash/redis';
import { Server } from 'socket.io';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

export async function handleWebhook(payload: any, io: Server) {
  const { type, payload: eventPayload } = payload;

  switch (type) {
    case 'workflow-started':
      // Notify client that workflow has started
      io.to(eventPayload.userId).emit('workflow-started', eventPayload);
      break;

    case 'step-completed':
      // Notify client that a step has completed
      io.to(eventPayload.userId).emit('step-completed', eventPayload);
      break;

    case 'workflow-completed':
      // Notify client that workflow has completed
      io.to(eventPayload.userId).emit('workflow-completed', eventPayload);
      break;

    case 'workflow-failed':
      // Notify client that workflow has failed
      io.to(eventPayload.userId).emit('workflow-failed', eventPayload);
      break;
  }

  // Store event in Redis for clients that are not connected
  await redis.lpush(
    `events:${eventPayload.userId}:${eventPayload.conversationId}`,
    JSON.stringify(payload)
  );

  // Trim the list to prevent it from growing too large
  await redis.ltrim(`events:${eventPayload.userId}:${eventPayload.conversationId}`, 0, 99);

  // Set TTL to ensure cleanup
  await redis.expire(`events:${eventPayload.userId}:${eventPayload.conversationId}`, 60 * 60 * 24);
}
```

## Session Management with Redis

```typescript
// packages/auth/src/session.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

export async function createSession(userId: string, sessionData: any) {
  const sessionId = crypto.randomUUID();
  const key = `session:${sessionId}`;

  await redis.set(
    key,
    JSON.stringify({
      userId,
      ...sessionData,
      createdAt: Date.now()
    })
  );

  // Set session expiration (30 days)
  await redis.expire(key, 60 * 60 * 24 * 30);

  return sessionId;
}

export async function getSession(sessionId: string) {
  const key = `session:${sessionId}`;
  const session = await redis.get(key);

  if (!session) {
    return null;
  }

  // Extend session expiration on access
  await redis.expire(key, 60 * 60 * 24 * 30);

  return JSON.parse(session as string);
}

export async function deleteSession(sessionId: string) {
  const key = `session:${sessionId}`;
  await redis.del(key);
}
```

## Environment Variables Configuration

```bash
# Upstash Workflow Configuration
UPSTASH_WORKFLOW_API_KEY=wf_your_api_key_here
UPSTASH_WORKFLOW_API_URL=https://api.upstash.com/v2/workflow
WORKFLOW_WEBHOOK_URL=https://your-app.com/api/webhooks/workflow

# Upstash Redis Configuration
UPSTASH_REDIS_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_TOKEN=your_redis_token_here

# Upstash QStash Configuration
QSTASH_TOKEN=your_qstash_token_here
QSTASH_CURRENT_SIGNING_KEY=your_signing_key_here
QSTASH_NEXT_SIGNING_KEY=your_next_signing_key_here

# Application Configuration
API_URL=https://your-app.com
```

## Security Considerations

1. **Authentication**: All requests to Upstash services are authenticated using tokens
2. **Request Verification**: QStash requests are verified using cryptographic signatures
3. **Data Encryption**: Sensitive data is encrypted before storage
4. **Rate Limiting**: Protects against abuse and DoS attacks
5. **Access Control**: Redis data is namespaced and access-controlled

## Performance Optimizations

1. **Caching Strategy**:

   - Cache frequently accessed data
   - Implement cache invalidation
   - Use appropriate TTLs

2. **Connection Pooling**:

   - Reuse Redis connections
   - Implement connection timeouts

3. **Batch Operations**:

   - Use Redis pipelines for multiple operations
   - Batch QStash messages when possible

4. **Monitoring and Alerts**:
   - Set up monitoring for Redis metrics
   - Configure alerts for unusual patterns

## Future Considerations

1. **Vector Search**: Implement vector search capabilities for semantic memory retrieval
2. **Sharding**: Implement Redis sharding for horizontal scaling
3. **Edge Caching**: Deploy Redis to edge locations for reduced latency
4. **Advanced Rate Limiting**: Implement more sophisticated rate limiting strategies
