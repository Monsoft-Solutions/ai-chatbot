# AI and Agent System Architecture

## Overview

This document outlines the AI and agent system architecture for the rebuilt AI Chatbot. The system is designed to support both simple AI chats and complex agent workflows using a combination of AI SDK, Upstash technologies, and a distributed architecture.

## Current vs. New Architecture

### Current Architecture

The current implementation uses a single API route for chat interactions, with streaming responses and tool calls happening within the context of a single request/response cycle:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│ React UI        │◄────┤ API Route       │◄────┤ AI Provider     │
│                 │     │ (chat/route.ts) │     │ (Claude/OpenAI) │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                │
                                ▼
                     ┌─────────────────────────┐
                     │                         │
                     │ Tool System             │
                     │ - createDocument        │
                     │ - updateDocument        │
                     │ - requestSuggestions    │
                     │ - getWeather           │
                     │ - searchTool           │
                     │                         │
                     └─────────────────────────┘
```

### New Agent-Based Architecture

The new architecture separates simple chats from complex agent workflows, using Upstash Workflow for long-running agent tasks:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│ React UI        │◄────┤ Chat API        │◄────┤ AI SDK Provider │
│                 │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │                 │              │
         │              │  Basic Tools    │              │
         │              │                 │              │
         │              └─────────────────┘              │
         │                                               │
         │                                               │
         ▼                                               ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│ Agent UI        │◄────┤ Agent API       │◄────┤ AI SDK Provider │
│                 │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │                 │              │
         │              │ Upstash Workflow│              │
         │              │                 │              │
         │              └────────┬────────┘              │
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │                 │              │
         │              │  QStash Queue   │              │
         │              │                 │              │
         │              └────────┬────────┘              │
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         └─────────────►│   Agent Tools   │◄─────────────┘
                        │                 │
                        └─────────────────┘
```

## AI Core Components (`packages/ai-core`)

The AI core package provides the foundation for AI interactions, including:

### Provider Management

```typescript
// packages/ai-core/src/providers.ts
import { customProvider } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export const aiProviders = {
  claude: anthropic('claude-3-7-sonnet-latest'),
  claudeHaiku: anthropic('claude-3-haiku-20240307'),
  gpt4: openai('gpt-4o'),
  gpt35: openai('gpt-3.5-turbo')
};

export const imageProviders = {
  dalle: openai.image('dall-e-3')
};
```

### Prompts Management

```typescript
// packages/ai-core/src/prompts.ts
import { PromptTemplate } from './types';

export const systemPrompts: Record<string, PromptTemplate> = {
  chat: {
    template: `You are a helpful AI assistant that responds accurately and concisely.
    The current date is {{currentDate}}.
    {{#if user}}
    You are speaking with {{user.name}}.
    {{/if}}`,
    defaultVariables: {
      currentDate: () => new Date().toISOString().split('T')[0]
    }
  },

  reasoning: {
    template: `You are a helpful AI assistant with reasoning capabilities.
    Break down complex problems step-by-step using the <think></think> tags.
    {{#if user}}
    You are speaking with {{user.name}}.
    {{/if}}`
  },

  agent: {
    template: `You are an autonomous agent with specific capabilities defined below.
    Goal: {{goal}}
    
    Capabilities:
    {{#each capabilities}}
    - {{this}}
    {{/each}}
    
    Available tools:
    {{#each tools}}
    - {{this.name}}: {{this.description}}
    {{/each}}
    
    Working memory:
    {{memory}}
    
    Remember to plan your actions carefully and execute them step by step.`
  }
};
```

### Core Tool System

```typescript
// packages/ai-core/src/tools/registry.ts
import { ToolDefinition } from '../types';

const toolRegistry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition) {
  toolRegistry.set(tool.name, tool);
  return tool;
}

export function getTool(name: string) {
  return toolRegistry.get(name);
}

export function getAllTools() {
  return Array.from(toolRegistry.values());
}
```

## Agent System Components (`packages/agents`)

### Agent Core Types (`packages/agents/core`)

```typescript
// packages/agents/core/src/types.ts
export type AgentDefinition = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  capabilities: Record<string, any>;
  metadata: Record<string, any>;
};

export type AgentInstance = {
  id: string;
  definitionId: string;
  userId: string;
  name: string;
  configuration: Record<string, any>;
  status: 'active' | 'paused' | 'archived';
};

export type Workflow = {
  id: string;
  userId: string;
  agentInstanceId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  goal: string;
  steps: Step[];
  result?: Record<string, any>;
};

export type Step = {
  id: string;
  description: string;
  toolName?: string;
  toolParameters?: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  error?: Error;
};
```

### Agent Workflow Integration (`packages/agents/workflow`)

```typescript
// packages/agents/workflow/src/workflow.ts
import { serve } from '@upstash/workflow/nextjs';
import { AgentManager } from '../manager';
import { MemoryService } from '../memory';
import { Step, Workflow } from '@/packages/agents/core';

export type AgentWorkflowInput = {
  userId: string;
  agentInstanceId: string;
  goal: string;
  conversationId: string;
};

export const { POST } = serve<AgentWorkflowInput>(async (context) => {
  const { userId, agentInstanceId, goal, conversationId } = context.requestPayload;

  // Initialize services
  const agentManager = new AgentManager();
  const memoryService = new MemoryService();

  // Step 1: Retrieve agent instance
  const agentInstance = await context.run('retrieve-agent', async () => {
    return agentManager.getAgentInstance(agentInstanceId);
  });

  // Step 2: Retrieve relevant context from memory
  const memory = await context.run('retrieve-memory', async () => {
    return memoryService.retrieveRelevantMemory(userId, conversationId, goal);
  });

  // Step 3: Generate plan
  const plan = await context.run('generate-plan', async () => {
    return agentManager.generatePlan(agentInstance, goal, memory);
  });

  // Step 4: Execute plan steps
  const results = [];

  for (const step of plan.steps) {
    const stepResult = await context.run(`execute-step-${step.id}`, async () => {
      return agentManager.executeStep(step, agentInstance);
    });

    results.push(stepResult);

    // Update memory with step result
    await context.run(`update-memory-${step.id}`, async () => {
      return memoryService.storeStepResult(userId, conversationId, step, stepResult);
    });
  }

  // Step 5: Reflect on results
  const reflection = await context.run('reflect', async () => {
    return agentManager.reflectOnResults(agentInstance, goal, plan, results);
  });

  // Step 6: Store final results
  await context.run('store-results', async () => {
    return agentManager.storeWorkflowResults(
      userId,
      agentInstanceId,
      goal,
      plan,
      results,
      reflection
    );
  });

  return {
    plan,
    results,
    reflection
  };
});
```

### Agent Memory System (`packages/agents/memory`)

```typescript
// packages/agents/memory/src/memory-service.ts
import { Redis } from '@upstash/redis';
import { Step } from '@/packages/agents/core';

export class MemoryService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL!,
      token: process.env.UPSTASH_REDIS_TOKEN!
    });
  }

  async retrieveRelevantMemory(userId: string, conversationId: string, goal: string) {
    const conversationKey = `memory:conversation:${userId}:${conversationId}`;
    const workflowsKey = `memory:workflows:${userId}`;

    // Get conversation history
    const conversationHistory = (await this.redis.get(conversationKey)) || [];

    // Get relevant past workflows for this user
    const workflows = (await this.redis.get(workflowsKey)) || [];

    // Filter for relevant workflows and their results based on goal
    const relevantWorkflows = workflows.filter((wf: any) => {
      // Simple keyword matching (this would be replaced with vector search in production)
      return wf.goal.toLowerCase().includes(goal.toLowerCase());
    });

    return {
      conversationHistory,
      relevantWorkflows
    };
  }

  async storeStepResult(userId: string, conversationId: string, step: Step, result: any) {
    const stepKey = `memory:step:${userId}:${conversationId}:${step.id}`;

    await this.redis.set(stepKey, {
      step,
      result,
      timestamp: Date.now()
    });

    // Set TTL for temporary memory (24 hours)
    await this.redis.expire(stepKey, 60 * 60 * 24);

    return true;
  }

  async storeConversationMessage(userId: string, conversationId: string, message: any) {
    const conversationKey = `memory:conversation:${userId}:${conversationId}`;

    await this.redis.lpush(conversationKey, message);

    // Trim to last 100 messages
    await this.redis.ltrim(conversationKey, 0, 99);

    return true;
  }
}
```

## Advanced Tool Architecture

### Tool Registry with QStash Integration

```typescript
// packages/agents/tools/src/tool-executor.ts
import { QStash } from '@upstash/qstash';
import { getTool } from '@/packages/ai-core/tools/registry';

const qstash = new QStash({
  token: process.env.QSTASH_TOKEN!
});

export async function executeTool(
  toolName: string,
  parameters: Record<string, any>,
  options: {
    userId: string;
    retries?: number;
    priority?: 'high' | 'normal' | 'low';
  }
) {
  const tool = getTool(toolName);

  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  // For simple tools, execute directly
  if (tool.executionType === 'direct') {
    try {
      return await tool.execute(parameters, { userId: options.userId });
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      throw error;
    }
  }

  // For complex tools, queue execution with QStash
  const messageId = await qstash.publishJSON({
    url: `/api/tools/${toolName}`,
    body: {
      parameters,
      userId: options.userId
    },
    retries: options.retries || 3,
    delay: tool.delay || 0
  });

  return {
    status: 'queued',
    messageId,
    toolName,
    parameters
  };
}
```

### Tool API Route

```typescript
// apps/api/src/app/api/tools/[toolName]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTool } from '@/packages/ai-core/tools/registry';
import { verifySignature } from '@upstash/qstash/nextjs';

async function handler(req: NextRequest, { params }: { params: { toolName: string } }) {
  const { toolName } = params;
  const { parameters, userId } = await req.json();

  const tool = getTool(toolName);

  if (!tool) {
    return NextResponse.json({ error: `Tool ${toolName} not found` }, { status: 404 });
  }

  try {
    const result = await tool.execute(parameters, { userId });

    return NextResponse.json({ result });
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);

    return NextResponse.json({ error: `Failed to execute tool ${toolName}` }, { status: 500 });
  }
}

// Verify that the request is coming from QStash
export const POST = verifySignature(handler);
```

## Agent Creation User Experience

The agent creation flow will allow users to define custom agents with specific capabilities:

### Agent Definition Interface

```typescript
// packages/agents/ui/src/components/agent-definition-form.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Textarea, Button, Select } from '@/packages/ui';
import { getAllTools } from '@/packages/ai-core/tools/registry';

const agentSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().min(10).max(500),
  systemPrompt: z.string().min(10),
  tools: z.array(z.string()),
  isPublic: z.boolean().default(false)
});

type AgentFormValues = z.infer<typeof agentSchema>;

export function AgentDefinitionForm({ onSubmit }: { onSubmit: (values: AgentFormValues) => Promise<void> }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tools = getAllTools();

  const { register, handleSubmit, formState: { errors } } = useForm<AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      isPublic: false,
      tools: []
    }
  });

  const submitHandler = async (values: AgentFormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      console.error('Failed to create agent:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(submitHandler)} className="space-y-6">
      <div>
        <label htmlFor="name">Agent Name</label>
        <Input id="name" {...register('name')} />
        {errors.name && <p className="text-red-500">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="description">Description</label>
        <Textarea id="description" {...register('description')} />
        {errors.description && <p className="text-red-500">{errors.description.message}</p>}
      </div>

      <div>
        <label htmlFor="systemPrompt">System Prompt</label>
        <Textarea id="systemPrompt" {...register('systemPrompt')} rows={6} />
        {errors.systemPrompt && <p className="text-red-500">{errors.systemPrompt.message}</p>}
      </div>

      <div>
        <label>Available Tools</label>
        <div className="space-y-2">
          {tools.map(tool => (
            <div key={tool.name} className="flex items-center">
              <input
                type="checkbox"
                id={`tool-${tool.name}`}
                value={tool.name}
                {...register('tools')}
              />
              <label htmlFor={`tool-${tool.name}`} className="ml-2">
                {tool.name} - {tool.description}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="isPublic" className="flex items-center">
          <input type="checkbox" id="isPublic" {...register('isPublic')} />
          <span className="ml-2">Make this agent public</span>
        </label>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create Agent'}
      </Button>
    </form>
  );
}
```

## Integration with Existing Features

The agent system will be integrated with the existing features:

### Artifacts Integration

```typescript
// packages/agents/tools/src/artifact-tools.ts
import { registerTool } from '@/packages/ai-core/tools/registry';

// Create document tool
registerTool({
  name: 'createDocument',
  description: 'Creates a new document artifact',
  schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['code', 'text', 'sheet', 'image'],
        description: 'The type of document to create'
      },
      title: {
        type: 'string',
        description: 'The title of the document'
      },
      content: {
        type: 'string',
        description: 'The content of the document'
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata for the document'
      }
    },
    required: ['type', 'title', 'content']
  },
  executionType: 'direct',
  execute: async (parameters, { userId }) => {
    // Implementation to create artifact
    // This would call the database service to create the artifact
    return {
      artifactId: 'new-artifact-id',
      success: true
    };
  }
});

// Update document tool
registerTool({
  name: 'updateDocument',
  description: 'Updates an existing document artifact',
  schema: {
    type: 'object',
    properties: {
      artifactId: {
        type: 'string',
        description: 'The ID of the artifact to update'
      },
      content: {
        type: 'string',
        description: 'The new content of the document'
      },
      title: {
        type: 'string',
        description: 'The new title of the document'
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata for the document'
      }
    },
    required: ['artifactId', 'content']
  },
  executionType: 'direct',
  execute: async (parameters, { userId }) => {
    // Implementation to update artifact
    return {
      success: true,
      artifactId: parameters.artifactId
    };
  }
});
```

## Performance Considerations

### Redis Caching Strategy

The application will use Upstash Redis for caching:

```typescript
// packages/utils/src/cache.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

export async function getCachedData<T>(key: string, ttl: number = 3600): Promise<T | null> {
  try {
    return await redis.get(key);
  } catch (error) {
    console.error('Redis cache error:', error);
    return null;
  }
}

export async function setCachedData<T>(key: string, data: T, ttl: number = 3600): Promise<void> {
  try {
    await redis.set(key, data, { ex: ttl });
  } catch (error) {
    console.error('Redis cache error:', error);
  }
}

// Cache wrapper for expensive operations
export async function withCache<T>(
  key: string,
  operation: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {
  const cached = await getCachedData<T>(key);

  if (cached) {
    return cached;
  }

  const result = await operation();
  await setCachedData(key, result, ttl);

  return result;
}
```

### Rate Limiting

The application will use Upstash Redis for rate limiting:

```typescript
// packages/utils/src/rate-limiter.ts
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Create a new ratelimiter that allows 10 requests per 10 seconds
const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!
  }),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true
});

export async function checkRateLimit(identifier: string) {
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier);

  return {
    success,
    limit,
    reset,
    remaining
  };
}
```

## Future Enhancements

1. **Vector Database Integration**: Enhance memory retrieval with vector search for semantic similarity
2. **Multi-agent Collaboration**: Enable multiple agents to collaborate on complex tasks
3. **Agent Marketplace**: Allow users to share and discover agent definitions
4. **Custom Tool Creation**: Enable users to define custom tools for their agents
5. **Performance Optimization**: Use edge functions for latency-sensitive operations
