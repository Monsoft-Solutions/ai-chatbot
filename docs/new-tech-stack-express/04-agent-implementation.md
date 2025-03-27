# Agent Implementation in Express.js

## Overview

This document outlines the implementation of intelligent agents within the Express.js API for the AI Chatbot application. These agents can perform complex tasks, use external tools, and maintain state across multiple interactions.

## Technology Stack

- **Agent Framework**: Custom agent implementation based on LLM function calling
- **State Management**: Upstash Redis for agent state persistence
- **Task Processing**: Upstash Workflow for complex agent tasks
- **External Tools**: RESTful API integrations with various services

## Agent Architecture

```
┌─────────────────────┐
│                     │
│   Express API       │
│   (Serverless)      │
│                     │
└────────┬────────────┘
         │
         │
         ▼
┌─────────────────────┐
│                     │
│   Agent System      │
│                     │
│  ┌───────────────┐  │
│  │ Agent Manager │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │  Agent Runner │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │   Tool System │  │
│  └───────────────┘  │
│                     │
└─────────┬───────────┘
          │
          │
          ▼
┌─────────────────────┐
│                     │
│   External Services │
│                     │
└─────────────────────┘
```

## Core Components

### Agent Types and Registration

Agents are defined with specific capabilities and registered in the system:

```javascript
// packages/agent-core/src/types.ts
export type Tool = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  handler: (params: any) => Promise<any>;
};

export type AgentDefinition = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  systemPrompt: string;
  tools: Tool[];
  defaultModel: string;
};

// packages/agent-core/src/registry.ts
import { AgentDefinition } from './types';

class AgentRegistry {
  private agents: Map<string, AgentDefinition> = new Map();

  registerAgent(agent: AgentDefinition): void {
    this.agents.set(agent.id, agent);
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }
}

export const agentRegistry = new AgentRegistry();
```

### Agent Manager

The Agent Manager handles agent instantiation and execution:

```javascript
// packages/agent-core/src/manager.ts
import { Redis } from '@upstash/redis';
import { AgentRuntime } from './runtime';
import { agentRegistry } from './registry';
import { v4 as uuidv4 } from 'uuid';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

export class AgentManager {
  async createAgentInstance(agentId: string, userId: string) {
    const agent = agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent definition not found: ${agentId}`);
    }

    const instanceId = uuidv4();
    const instance = {
      id: instanceId,
      agentId,
      userId,
      state: 'initialized',
      createdAt: new Date().toISOString(),
      conversationHistory: [],
    };

    // Store agent instance
    await redis.set(`agent:instance:${instanceId}`, JSON.stringify(instance));

    return instanceId;
  }

  async runAgentWithInput(instanceId: string, input: string) {
    // Get agent instance
    const instanceJson = await redis.get(`agent:instance:${instanceId}`);
    if (!instanceJson) {
      throw new Error(`Agent instance not found: ${instanceId}`);
    }

    const instance = JSON.parse(instanceJson);
    const agentDef = agentRegistry.getAgent(instance.agentId);

    if (!agentDef) {
      throw new Error(`Agent definition not found: ${instance.agentId}`);
    }

    // Update conversation history
    instance.conversationHistory.push({
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    });

    // Create agent runtime
    const runtime = new AgentRuntime(agentDef, instance);

    // Run agent
    const result = await runtime.run(input);

    // Update conversation history with response
    instance.conversationHistory.push({
      role: 'assistant',
      content: result.response,
      timestamp: new Date().toISOString(),
    });

    // Update agent state
    instance.state = 'waiting';

    // Save updated instance
    await redis.set(`agent:instance:${instanceId}`, JSON.stringify(instance));

    return result;
  }
}
```

### Agent Runtime

The Agent Runtime handles the execution loop and tool calling:

```javascript
// packages/agent-core/src/runtime.ts
import { AIProviderFactory } from '@/packages/ai-core';
import { Tool, AgentDefinition } from './types';

export class AgentRuntime {
  private agentDef: AgentDefinition;
  private instance: any;
  private aiProvider: any;

  constructor(agentDef: AgentDefinition, instance: any) {
    this.agentDef = agentDef;
    this.instance = instance;
    this.aiProvider = AIProviderFactory.getProvider('openai', {
      model: agentDef.defaultModel || 'gpt-4o',
    });
  }

  private buildMessages() {
    const messages = [
      { role: 'system', content: this.agentDef.systemPrompt },
    ];

    // Add conversation history
    for (const msg of this.instance.conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return messages;
  }

  private buildFunctionDefinitions() {
    return this.agentDef.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }
    }));
  }

  async run(input: string) {
    const messages = this.buildMessages();
    const tools = this.buildFunctionDefinitions();

    let isComplete = false;
    let finalResponse = '';

    // Maximum number of tool execution steps
    const MAX_STEPS = 10;
    let steps = 0;

    while (!isComplete && steps < MAX_STEPS) {
      steps++;

      // Get response from AI with function calling
      const response = await this.aiProvider.client.chat.completions.create({
        model: this.agentDef.defaultModel,
        messages,
        tools,
        tool_choice: 'auto',
      });

      const responseMessage = response.choices[0].message;

      // Add AI response to messages
      messages.push(responseMessage);

      // Check if function call is present
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Execute each tool call
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          // Find the tool
          const tool = this.agentDef.tools.find(t => t.name === functionName);

          if (tool) {
            try {
              // Execute tool
              const result = await tool.handler(functionArgs);

              // Add function response to messages
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              // Add error response to messages
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: error.message }),
              });
            }
          }
        }
      } else {
        // No function call, agent is complete
        isComplete = true;
        finalResponse = responseMessage.content;
      }
    }

    if (!isComplete) {
      finalResponse = "I've reached the maximum number of steps. Here's what I know so far: " +
        messages[messages.length - 1].content;
    }

    return {
      response: finalResponse,
      steps,
    };
  }
}
```

## Tool System

### Tool Definition

Tools are defined with metadata and handler functions:

```javascript
// packages/agent-core/src/tools/weather.ts
import axios from 'axios';
import { Tool } from '../types';

export const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g. San Francisco, CA',
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'The unit of temperature',
      },
    },
    required: ['location'],
  },
  handler: async (params) => {
    try {
      const { location, unit = 'celsius' } = params;
      const response = await axios.get(
        `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(location)}`
      );

      const data = response.data;
      const temp = unit === 'celsius' ? data.current.temp_c : data.current.temp_f;
      const condition = data.current.condition.text;

      return {
        temperature: temp,
        unit: unit === 'celsius' ? 'C' : 'F',
        condition,
        location: `${data.location.name}, ${data.location.country}`,
      };
    } catch (error) {
      console.error('Weather API error:', error);
      throw new Error('Failed to get weather information');
    }
  },
};
```

### Tool Registry

Tools are registered and made available to agents:

```javascript
// packages/agent-core/src/tools/index.ts
import { weatherTool } from './weather';
import { searchTool } from './search';
import { calculatorTool } from './calculator';

// Export all tools
export const tools = {
  weather: weatherTool,
  search: searchTool,
  calculator: calculatorTool
  // Add more tools here
};

// Group tools by category
export const toolCategories = {
  information: [weatherTool, searchTool],
  utilities: [calculatorTool]
};
```

## Agent Definition Examples

### Research Agent Example

```javascript
// packages/agent-core/src/agents/research-agent.ts
import { AgentDefinition } from '../types';
import { tools } from '../tools';
import { agentRegistry } from '../registry';

const researchAgent: AgentDefinition = {
  id: 'research-agent',
  name: 'Research Assistant',
  description: 'Helps with research tasks and finding information',
  capabilities: [
    'Search for information online',
    'Summarize articles and content',
    'Answer factual questions',
  ],
  systemPrompt: `You are a Research Assistant, an AI that helps users with research tasks.
Your goal is to provide accurate information and helpful summaries.
Use the tools available to you to find information requested by the user.
Always cite your sources when providing information.`,
  tools: [
    tools.search,
    tools.weather,
  ],
  defaultModel: 'gpt-4o',
};

// Register agent
agentRegistry.registerAgent(researchAgent);
```

### Customer Support Agent Example

```javascript
// packages/agent-core/src/agents/support-agent.ts
import { AgentDefinition } from '../types';
import { tools } from '../tools';
import { agentRegistry } from '../registry';

const supportAgent: AgentDefinition = {
  id: 'support-agent',
  name: 'Customer Support Agent',
  description: 'Helps with customer support and product inquiries',
  capabilities: [
    'Answer product questions',
    'Troubleshoot common issues',
    'Search documentation',
  ],
  systemPrompt: `You are a Customer Support Agent, an AI that helps users with product questions and issues.
Your goal is to provide helpful, accurate, and friendly support.
Use the tools available to you to search documentation and provide solutions.
If you don't know an answer, suggest escalating to a human support agent.`,
  tools: [
    tools.search,
    // Custom support tools would be added here
  ],
  defaultModel: 'gpt-4o',
};

// Register agent
agentRegistry.registerAgent(supportAgent);
```

## Express Integration

### Agent Controller

```javascript
// apps/api/src/controllers/agent.js
const { AgentManager } = require('@/packages/agent-core/manager');
const { agentRegistry } = require('@/packages/agent-core/registry');

const agentManager = new AgentManager();

// List available agents
async function listAgents(req, res) {
  try {
    const agents = agentRegistry.listAgents().map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      capabilities: agent.capabilities
    }));

    return res.json(agents);
  } catch (error) {
    console.error('Error listing agents:', error);
    return res.status(500).json({ error: 'Failed to list agents' });
  }
}

// Create agent instance
async function createAgentInstance(req, res) {
  try {
    const { agentId } = req.body;
    const userId = req.user.id;

    const instanceId = await agentManager.createAgentInstance(agentId, userId);

    return res.json({ instanceId });
  } catch (error) {
    console.error('Error creating agent instance:', error);
    return res.status(500).json({ error: 'Failed to create agent instance' });
  }
}

// Run agent with input
async function runAgent(req, res) {
  try {
    const { instanceId } = req.params;
    const { input } = req.body;
    const userId = req.user.id;

    // Set up SSE for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Start agent processing
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

    try {
      // Run agent
      const result = await agentManager.runAgentWithInput(instanceId, input);

      // Send result
      res.write(
        `data: ${JSON.stringify({
          type: 'message',
          content: result.response,
          steps: result.steps
        })}\n\n`
      );

      // Complete
      res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      res.end();
    } catch (error) {
      // Send error
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error running agent:', error);

    // If headers already sent, write to stream
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: 'Failed to process agent request' })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to process agent request' });
    }
  }
}

module.exports = {
  listAgents,
  createAgentInstance,
  runAgent
};
```

### Agent Router

```javascript
// apps/api/src/routes/agent.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { listAgents, createAgentInstance, runAgent } = require('../controllers/agent');

const router = express.Router();

// Get list of available agents
router.get('/agents', authenticate, listAgents);

// Create new agent instance
router.post('/agents/instances', authenticate, rateLimit('agent'), createAgentInstance);

// Run agent with input
router.post('/agents/instances/:instanceId/run', authenticate, rateLimit('agent'), runAgent);

module.exports = router;
```

## Long-Running Tasks with Upstash Workflow

For complex agent tasks that may exceed serverless timeouts:

```javascript
// packages/agent-core/src/workflow.ts
import { Workflow } from '@upstash/workflow';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

// Define workflow for complex agent tasks
export const agentWorkflow = new Workflow({
  id: 'agent-workflow',
  version: 'v1'
});

// Step to process agent requests that may take longer than serverless timeout
agentWorkflow.step({
  id: 'process-agent-request',
  handler: async (ctx, { instanceId, input, userId }) => {
    try {
      // Get instance data from Redis
      const instanceJson = await redis.get(`agent:instance:${instanceId}`);
      if (!instanceJson) {
        throw new Error(`Agent instance not found: ${instanceId}`);
      }

      const instance = JSON.parse(instanceJson);

      // Verify user
      if (instance.userId !== userId) {
        throw new Error('Unauthorized');
      }

      // Process with agent runtime
      // This code would be similar to the AgentManager.runAgentWithInput method
      // but optimized for the workflow environment

      // Store results in Redis for later retrieval
      await redis.set(
        `agent:result:${instanceId}:${Date.now()}`,
        JSON.stringify({
          input,
          response: 'Agent response here',
          timestamp: new Date().toISOString()
        })
      );

      return { success: true };
    } catch (error) {
      console.error('Error in agent workflow:', error);
      return { error: error.message };
    }
  }
});

// Function to trigger the workflow
export async function startAgentWorkflow(instanceId, input, userId) {
  try {
    const workflowId = `agent-${instanceId}-${Date.now()}`;

    await agentWorkflow.enqueue({
      workflowId,
      data: {
        instanceId,
        input,
        userId
      }
    });

    return workflowId;
  } catch (error) {
    console.error('Failed to start agent workflow:', error);
    throw error;
  }
}
```

## Agent State Management

```javascript
// packages/agent-core/src/state.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

export class AgentStateManager {
  // Save agent memory/state
  static async saveState(instanceId, stateData) {
    await redis.set(`agent:state:${instanceId}`, JSON.stringify(stateData));
  }

  // Get agent memory/state
  static async getState(instanceId) {
    const stateJson = await redis.get(`agent:state:${instanceId}`);
    return stateJson ? JSON.parse(stateJson) : null;
  }

  // Save conversation message
  static async saveMessage(instanceId, message) {
    const timestamp = Date.now();
    await redis.lpush(
      `agent:messages:${instanceId}`,
      JSON.stringify({
        ...message,
        timestamp
      })
    );
  }

  // Get conversation history
  static async getMessages(instanceId, limit = 100) {
    const messages = await redis.lrange(`agent:messages:${instanceId}`, 0, limit - 1);
    return messages.map((msg) => JSON.parse(msg));
  }
}
```

## Performance Considerations

### Optimizing Function Calls

```javascript
// packages/agent-core/src/optimizers.ts
export class AgentOptimizer {
  // Analyze conversation to determine next best action
  static analyzeConversation(messages) {
    // Count tool usage frequency
    const toolUsage = {};

    for (const msg of messages) {
      if (msg.tool_calls) {
        for (const call of msg.tool_calls) {
          const toolName = call.function.name;
          toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
        }
      }
    }

    return {
      toolUsage,
      messageCount: messages.length,
      userMessages: messages.filter((m) => m.role === 'user').length,
      assistantMessages: messages.filter((m) => m.role === 'assistant').length
    };
  }

  // Compact history to stay within token limits
  static compactHistory(messages, maxTokens = 4000) {
    // Simple estimation: 4 tokens per word, plus some overhead
    const estimateTokens = (text) => {
      return (text?.split(/\s+/).length || 0) * 4;
    };

    // Keep system message and recent messages
    const systemMessages = messages.filter((m) => m.role === 'system');
    let recentMessages = messages.filter((m) => m.role !== 'system');

    // Estimate current token count
    let totalTokens = systemMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);

    // Compact from oldest to newest
    while (recentMessages.length > 0 && totalTokens > maxTokens) {
      // Remove oldest message
      const oldestMsg = recentMessages.shift();
      totalTokens -= estimateTokens(oldestMsg.content);
    }

    // Combine and return
    return [...systemMessages, ...recentMessages];
  }
}
```

## Conclusion

This agent implementation in Express.js provides a robust framework for building intelligent agents that can perform complex tasks in the AI Chatbot application. Key features include:

1. **Flexible Architecture**: Supports multiple agent types with different capabilities
2. **Tool System**: Enables agents to interact with external services
3. **State Management**: Persists agent state and conversation history
4. **Express.js Integration**: Provides RESTful API endpoints for agent interactions
5. **Long-Running Tasks**: Handles complex tasks with Upstash Workflow
6. **Performance Optimization**: Implements techniques to optimize token usage and response time

The architecture is designed to work efficiently in a serverless environment while providing the advanced features needed for a sophisticated AI agent system.
