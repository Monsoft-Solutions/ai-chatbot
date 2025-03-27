# Agentic AI Technical Specification

## Overview

This document provides detailed technical specifications for implementing agentic AI capabilities using Upstash technologies (Workflow, QStash, Redis) within a monorepo architecture. The implementation will enhance the existing architecture to support autonomous, multi-step reasoning with explicit planning and execution phases while overcoming the limitations of serverless environments.

## Current Architecture

The application currently uses the `ai` package with a streaming architecture to handle AI responses and tool invocations. Key components include:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│ Next.js UI      │◄────┤ AI API Route    │◄────┤ AI Provider     │
│ (React client)  │     │ (chat/route.ts) │     │ (Claude/OpenAI) │
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

## Enhanced Agentic Architecture with Upstash

The enhanced architecture adds agentic capabilities using Upstash technologies while maintaining compatibility with the existing system:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│ Next.js UI      │◄────┤ AI API Route    │◄────┤ AI Provider     │
│ (React client)  │     │ (chat/route.ts) │     │ (Claude/OpenAI) │
│                 │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │                 │              │
         │              │  Agent System   │              │
         │              │                 │              │
         │              └────────┬────────┘              │
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
         │              │                 │              │
         └─────────────►│   Tool System   │◄─────────────┘
                        │                 │
                        └─────────────────┘
```

## Monorepo Architecture

The implementation will be structured as a monorepo using Turborepo:

```
/
├── apps/
│   └── ai-chatbot/                # Current Next.js application
├── packages/
│   ├── agent-core/                # Core agent types and interfaces
│   ├── agent-workflow/            # Upstash Workflow implementations
│   ├── agent-services/            # Agent microservices
│   ├── agent-tools/               # Tool implementations and registry
│   ├── agent-memory/              # Memory management with Redis
│   └── ui-components/             # Shared UI components
├── turbo.json                     # Turborepo configuration
└── package.json                   # Root package.json
```

## Agent System Components

### 1. Core Types Package (`packages/agent-core/src`)

The Core Types Package serves as the foundation for the agent system, providing shared types, interfaces, and utility functions.

```typescript
// packages/agent-core/src/types/plan.ts
export type Plan = {
  id: string;
  goal: string;
  steps: Step[];
  createdAt: Date;
  updatedAt: Date;
  status: PlanStatus;
};

export type Step = {
  id: string;
  description: string;
  toolName?: string;
  toolParameters?: Record<string, any>;
  dependsOn: string[];
  status: StepStatus;
  result?: any;
  error?: Error;
};

export type PlanStatus = 'created' | 'in_progress' | 'completed' | 'failed';
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
```

### 2. Workflow Orchestration Layer (`packages/agent-workflow/src`)

The Workflow Orchestration Layer implements Upstash Workflow definitions for orchestrating the agent lifecycle across multiple serverless invocations.

```typescript
// packages/agent-workflow/src/workflows/agent-workflow.ts
import { serve } from '@upstash/workflow/nextjs';
import { AgentMemory } from '@/packages/agent-memory';
import { PlanningService, ExecutionService, ReflectionService } from '@/packages/agent-services';

export type AgentWorkflowInput = {
  userId: string;
  requestId: string;
  request: string;
  conversationId: string;
};

export const { POST } = serve<AgentWorkflowInput>(async (context) => {
  const { userId, requestId, request, conversationId } = context.requestPayload;

  // Step 1: Retrieve relevant memory
  const memory = await context.run('retrieve-memory', async () => {
    const memoryService = new AgentMemory();
    return memoryService.retrieveRelevantContext(request, conversationId);
  });

  // Step 2: Generate plan
  const plan = await context.run('generate-plan', async () => {
    const planningService = new PlanningService();
    return planningService.createPlan(request, memory);
  });

  // Step 3: Notify frontend of the plan
  await context.notify('plan-created', {
    requestId,
    plan
  });

  // Step 4: Execute each step of the plan
  const stepResults = {};
  for (const step of plan.steps) {
    const result = await context.run(`execute-step-${step.id}`, async () => {
      const executionService = new ExecutionService();
      return executionService.executeStep(step, stepResults);
    });

    stepResults[step.id] = result;

    await context.notify('step-completed', {
      requestId,
      stepId: step.id,
      result
    });
  }

  // Step 5: Reflect on execution
  const reflection = await context.run('reflect', async () => {
    const reflectionService = new ReflectionService();
    return reflectionService.reflect(plan, stepResults);
  });

  // Step 6: Store in memory
  await context.run('store-memory', async () => {
    const memoryService = new AgentMemory();
    return memoryService.storeExecution(request, plan, stepResults, reflection, conversationId);
  });

  return {
    plan,
    results: stepResults,
    reflection
  };
});
```

### 3. Agent Services (`packages/agent-services/src`)

The Agent Services package implements the core agent services as independent microservices for planning, execution, and reflection.

#### 3.1 Planning Service (`packages/agent-services/src/planning`)

```typescript
// packages/agent-services/src/planning/index.ts
import { type Plan } from '@/packages/agent-core';
import { ToolRegistry } from '@/packages/agent-tools';
import { Claude } from '@anthropic-ai/sdk';

export class PlanningService {
  private model: Claude;
  private toolRegistry: ToolRegistry;

  constructor() {
    this.model = new Claude({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    this.toolRegistry = new ToolRegistry();
  }

  async createPlan(request: string, context: any): Promise<Plan> {
    // Get available tools
    const tools = this.toolRegistry.getAllTools();

    // Generate plan using Claude
    const response = await this.model.messages.create({
      model: 'claude-3-5-haiku-20240307',
      max_tokens: 4000,
      system: this.getPlanningSystemPrompt(tools),
      messages: [
        {
          role: 'user',
          content: this.generatePlanningPrompt(request, context)
        }
      ]
    });

    // Extract and parse plan from response
    const planJson = this.extractJsonFromResponse(response.content[0].text);

    return this.validateAndFormatPlan(planJson);
  }

  private getPlanningSystemPrompt(tools: any[]): string {
    // Planning system prompt implementation
    // ...
  }

  private generatePlanningPrompt(request: string, context: any): string {
    // Planning prompt implementation
    // ...
  }

  private extractJsonFromResponse(text: string): any {
    // Extract JSON from text response
    // ...
  }

  private validateAndFormatPlan(planJson: any): Plan {
    // Validate and format plan
    // ...
  }
}
```

#### 3.2 Execution Service (`packages/agent-services/src/execution`)

```typescript
// packages/agent-services/src/execution/index.ts
import { type Step } from '@/packages/agent-core';
import { ToolExecutor } from '@/packages/agent-tools';

export class ExecutionService {
  private toolExecutor: ToolExecutor;

  constructor() {
    this.toolExecutor = new ToolExecutor();
  }

  async executeStep(step: Step, previousResults: Record<string, any>): Promise<any> {
    // Check if this step depends on previous steps
    if (step.dependsOn.length > 0) {
      this.validateDependencies(step, previousResults);
    }

    // Execute the tool if specified
    if (step.toolName && step.toolParameters) {
      return this.toolExecutor.executeTool(
        step.toolName,
        this.resolveParameters(step.toolParameters, previousResults)
      );
    }

    // For steps that don't involve tool execution
    return { status: 'completed', message: 'Step completed without tool execution' };
  }

  private validateDependencies(step: Step, previousResults: Record<string, any>): void {
    // Check if all dependencies are completed
    for (const depId of step.dependsOn) {
      if (!previousResults[depId]) {
        throw new Error(`Dependency ${depId} not completed before step ${step.id}`);
      }
    }
  }

  private resolveParameters(
    parameters: Record<string, any>,
    previousResults: Record<string, any>
  ): Record<string, any> {
    // Resolve parameters, including those that reference previous step results
    // ...
  }
}
```

#### 3.3 Reflection Service (`packages/agent-services/src/reflection`)

```typescript
// packages/agent-services/src/reflection/index.ts
import { type Plan } from '@/packages/agent-core';
import { Claude } from '@anthropic-ai/sdk';

export class ReflectionService {
  private model: Claude;

  constructor() {
    this.model = new Claude({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async reflect(plan: Plan, stepResults: Record<string, any>): Promise<any> {
    // Generate reflection using Claude
    const response = await this.model.messages.create({
      model: 'claude-3-5-haiku-20240307',
      max_tokens: 2000,
      system: this.getReflectionSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: this.generateReflectionPrompt(plan, stepResults)
        }
      ]
    });

    // Extract and parse reflection
    return this.extractReflectionFromResponse(response.content[0].text);
  }

  private getReflectionSystemPrompt(): string {
    // Reflection system prompt implementation
    // ...
  }

  private generateReflectionPrompt(plan: Plan, stepResults: Record<string, any>): string {
    // Reflection prompt implementation
    // ...
  }

  private extractReflectionFromResponse(text: string): any {
    // Extract reflection data from text response
    // ...
  }
}
```

### 4. Tool System (`packages/agent-tools/src`)

The Tool System implements tool registry, QStash integration for reliable execution, and standardized tool interfaces.

```typescript
// packages/agent-tools/src/registry.ts
import { Client } from '@upstash/qstash';
import { Redis } from '@upstash/redis';

export type ToolMetadata = {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required: boolean;
    }
  >;
  capabilities: string[];
};

export class ToolRegistry {
  private tools: Map<string, ToolMetadata>;
  private qstashClient: Client;
  private redis: Redis;

  constructor() {
    this.tools = new Map();
    this.qstashClient = new Client({
      token: process.env.QSTASH_TOKEN
    });
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });

    this.registerBuiltinTools();
  }

  registerTool(metadata: ToolMetadata): void {
    this.tools.set(metadata.name, metadata);
  }

  getTool(name: string): ToolMetadata | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolMetadata[] {
    return Array.from(this.tools.values());
  }

  findToolsByCapability(capability: string): ToolMetadata[] {
    return this.getAllTools().filter((tool) => tool.capabilities.includes(capability));
  }

  private registerBuiltinTools(): void {
    // Register built-in tools
    // ...
  }
}

// packages/agent-tools/src/executor.ts
export class ToolExecutor {
  private qstashClient: Client;
  private redis: Redis;
  private registry: ToolRegistry;

  constructor() {
    this.qstashClient = new Client({
      token: process.env.QSTASH_TOKEN
    });
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });
    this.registry = new ToolRegistry();
  }

  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    const toolMetadata = this.registry.getTool(toolName);

    if (!toolMetadata) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Generate a unique execution ID
    const executionId = this.generateExecutionId();

    // Execute through QStash for reliability
    const { messageId } = await this.qstashClient.publishJSON({
      url: `${process.env.TOOL_EXECUTION_BASE_URL}/${toolName}`,
      body: {
        parameters,
        executionId
      },
      retries: 3 // Automatic retries on failure
    });

    // Store the execution reference
    await this.redis.set(
      `tool:execution:${executionId}`,
      JSON.stringify({
        messageId,
        toolName,
        parameters,
        status: 'queued',
        timestamp: new Date().toISOString()
      })
    );

    // Wait for the result (with timeout)
    return this.waitForResult(executionId);
  }

  private async waitForResult(executionId: string, timeoutMs = 30000): Promise<any> {
    // Implementation to poll Redis for the tool execution result
    // with timeout handling
    // ...
  }

  private generateExecutionId(): string {
    return `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
```

### 5. Memory System (`packages/agent-memory/src`)

The Memory System implements Redis-based storage with vector search capabilities for semantic retrieval.

```typescript
// packages/agent-memory/src/store.ts
import { Redis } from '@upstash/redis';
import { RedisVectorSearch } from '@upstash/vector';
import { OpenAI } from 'openai';

export type MemoryEntry = {
  id: string;
  userId: string;
  conversationId: string;
  type: 'request' | 'plan' | 'execution' | 'reflection';
  content: any;
  embedding?: number[];
  timestamp: string;
};

export class MemoryStore {
  private redis: Redis;
  private vectorSearch: RedisVectorSearch;
  private openai: OpenAI;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });

    this.vectorSearch = new RedisVectorSearch({
      redis: this.redis,
      index: 'agent-memory'
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async storeMemory(entry: Omit<MemoryEntry, 'id' | 'embedding'>): Promise<string> {
    // Generate a unique ID
    const id = `memory:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;

    // Create text representation for embedding
    const textForEmbedding = this.createTextForEmbedding(entry);

    // Generate embedding
    const embedding = await this.generateEmbedding(textForEmbedding);

    // Store the complete entry
    const completeEntry: MemoryEntry = {
      ...entry,
      id,
      embedding
    };

    // Store in Redis
    await this.redis.set(`memory:${id}`, JSON.stringify(completeEntry));

    // Store in conversation history
    await this.redis.lpush(`conversation:${entry.conversationId}`, id);

    // Store in vector search
    await this.vectorSearch.upsert({
      id,
      vector: embedding,
      metadata: {
        userId: entry.userId,
        conversationId: entry.conversationId,
        type: entry.type,
        timestamp: entry.timestamp
      }
    });

    return id;
  }

  async retrieveRecentMemory(conversationId: string, limit = 10): Promise<MemoryEntry[]> {
    // Get recent memory IDs
    const ids = await this.redis.lrange(`conversation:${conversationId}`, 0, limit - 1);

    // Retrieve the entries
    return this.retrieveEntriesByIds(ids);
  }

  async retrieveSimilarMemory(text: string, limit = 5): Promise<MemoryEntry[]> {
    // Generate embedding for the query
    const embedding = await this.generateEmbedding(text);

    // Search for similar vectors
    const results = await this.vectorSearch.search({
      vector: embedding,
      limit
    });

    // Retrieve the entries
    return this.retrieveEntriesByIds(results.map((r) => r.id));
  }

  private async retrieveEntriesByIds(ids: string[]): Promise<MemoryEntry[]> {
    if (ids.length === 0) return [];

    // Retrieve entries in parallel
    const entries = await Promise.all(
      ids.map(async (id) => {
        const entry = await this.redis.get(`memory:${id}`);
        return entry ? JSON.parse(entry) : null;
      })
    );

    return entries.filter(Boolean);
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536
    });

    return response.data[0].embedding;
  }

  private createTextForEmbedding(entry: Omit<MemoryEntry, 'id' | 'embedding'>): string {
    // Create a text representation based on the entry type
    // ...
  }
}
```

### 6. UI Components (`packages/ui-components/src`)

The UI Components package provides shared React components for agent visualization and interaction.

```typescript
// packages/ui-components/src/agent/PlanVisualizer.tsx
import React, { useState, useEffect } from 'react';
import { Plan, Step, StepStatus } from '@/packages/agent-core';

type PlanVisualizerProps = {
  plan: Plan;
  onStepClick?: (stepId: string) => void;
};

export const PlanVisualizer: React.FC<PlanVisualizerProps> = ({ plan, onStepClick }) => {
  // Component implementation for visualizing the plan
  // ...
};

// packages/ui-components/src/agent/StepProgress.tsx
import React from 'react';
import { Step } from '@/packages/agent-core';

type StepProgressProps = {
  step: Step;
  result?: any;
};

export const StepProgress: React.FC<StepProgressProps> = ({ step, result }) => {
  // Component implementation for displaying step progress
  // ...
};
```

## Next.js Integration

### API Routes for Workflow Orchestration

```typitten
// apps/ai-chatbot/app/api/agent/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WorkflowClient } from '@/packages/agent-workflow/client';

export async function POST(req: NextRequest) {
  // Get session
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get request data
  const { request, conversationId } = await req.json();

  // Create a unique request ID
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Start the workflow
  const workflowClient = new WorkflowClient();
  const workflowId = await workflowClient.startAgentWorkflow({
    userId: session.user.id,
    requestId,
    request,
    conversationId
  });

  // Return the workflow ID and request ID
  return NextResponse.json({
    workflowId,
    requestId
  });
}
```

### WebSocket for Real-time Updates

```typescript
// apps/ai-chatbot/app/api/agent/updates/route.ts
import { NextRequest } from 'next/server';
import { WebSocketHandler } from '@/lib/websocket';
import { Redis } from '@upstash/redis';

export function GET(req: NextRequest) {
  const workflowId = req.nextUrl.searchParams.get('workflowId');
  if (!workflowId) {
    return new Response('Missing workflow ID', { status: 400 });
  }

  // Create a WebSocket handler
  const websocket = new WebSocketHandler();

  // Set up subscription to workflow updates from Redis
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL,
    token: process.env.UPSTASH_REDIS_TOKEN
  });

  // Subscribe to workflow updates
  const pubsub = redis.createPubSubClient();
  pubsub.subscribe(`workflow:${workflowId}`, (message) => {
    websocket.send(message);
  });

  // Handle WebSocket close
  websocket.onClose(() => {
    pubsub.unsubscribe(`workflow:${workflowId}`);
  });

  // Return the WebSocket handler
  return websocket.response;
}
```

## Implementation Plan

The implementation plan follows these phases without specific timelines:

### Phase 1: Monorepo Setup and Foundation

1. Initialize monorepo structure:

   - Set up Turborepo
   - Configure package dependencies
   - Set up shared tooling and scripts

2. Implement core packages:

   - Create agent-core package with shared types
   - Implement agent-memory with Redis integration
   - Develop basic agent-tools framework

### Phase 2: Workflow and Services

1. Implement workflow orchestration:

   - Create Upstash Workflow integration
   - Implement state persistence
   - Add event notifications

2. Develop agent services:

   - Implement planning service
   - Create execution service with QStash
   - Develop reflection service

### Phase 3: UI and Integration

1. Implement UI components:

   - Create agent visualization components
   - Develop plan and execution displays
   - Add interactive controls

2. Integrate with Next.js application:

   - Update API routes to use workflows
   - Implement WebSocket for real-time updates
   - Connect UI components to API

### Phase 4: Refinement and Deployment

1. Add advanced features:

   - Implement long-term memory persistence
   - Add user feedback collection
   - Create adaptive learning system

2. Performance optimization:

   - Optimize token usage
   - Add caching for common operations
   - Improve response time

3. Documentation and deployment:
   - Complete developer documentation
   - Add user guides
   - Prepare for production deployment

## Technical Considerations

### 1. Model Selection

The agent system will use:

- Planning: Claude 3.5 Haiku with reasoning extraction
- Memory retrieval: OpenAI text-embedding-3-small for vector search
- Reflection: Claude 3.5 Haiku with reasoning extraction

### 2. Performance Optimization

- Token usage optimization:

  - Contextual pruning of irrelevant history
  - Efficient prompt engineering
  - Streaming responses for immediate feedback

- Response time optimization:
  - Parallel tool execution with QStash
  - Redis caching for frequently used context
  - Progressive rendering of plan execution

### 3. Error Handling

- Graceful error recovery:

  - QStash automatic retries for failed tool executions
  - Alternative execution paths on failure
  - Resumable workflows with Upstash Workflow

- User feedback on errors:
  - Real-time error notifications via WebSocket
  - Suggested remediation steps
  - Option to modify the plan

### 4. Security Considerations

- Tool execution safety:

  - Parameter validation and sanitization
  - Execution environment isolation
  - Rate limiting for external API calls

- User data protection:
  - Scoped access to user data
  - Session validation
  - Minimal persistence of sensitive data

## Conclusion

This technical specification outlines the implementation plan for adding agentic AI capabilities using Upstash technologies within a monorepo architecture. The proposed architecture maintains compatibility with current systems while extending functionality with planning, execution, and reflection capabilities that can overcome the limitations of serverless environments.
