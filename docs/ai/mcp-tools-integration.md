# Model Context Protocol (MCP) Integration for AI Agent Tools

## Overview

This document outlines the integration of Model Context Protocol (MCP) into our AI agent system within our monorepo architecture. MCP is an open protocol developed by Anthropic that enables AI agents to dynamically interact with external tools, data sources, and services in a standardized way.

## What is Model Context Protocol?

The Model Context Protocol (MCP) is an open standard that provides a universal way for AI assistants to connect with external data sources and tools. MCP enables AI systems to:

- Access real-time, up-to-date information beyond their training data
- Interact with external APIs, databases, and services
- Execute complex operations through specialized tools
- Maintain context across multiple agent interactions

MCP follows a client-server architecture where:

- **MCP Servers**: Expose data sources, resources, and tools to AI agents
- **MCP Clients**: Consume these resources and tools (our AI agent will be an MCP client)
- **MCP Hosts**: Facilitate communication between clients and servers (e.g., Claude Desktop)

## Architecture Integration

We will integrate MCP into our monorepo architecture within the `agent-tools` package to leverage standardized tool definition and execution:

```
/
├── packages/
│   ├── agent-core/               # Core agent types
│   ├── agent-workflow/           # Upstash Workflow implementations
│   ├── agent-services/           # Agent microservices
│   ├── agent-tools/              # Tool implementations with MCP
│   │   ├── src/
│   │   │   ├── mcp/              # MCP integration
│   │   │   │   ├── client.ts     # MCP client implementation
│   │   │   │   ├── server.ts     # MCP server for exposing our tools
│   │   │   │   ├── transport.ts  # Custom transport implementations
│   │   │   │   └── tools/        # MCP-compatible tool definitions
│   │   │   ├── registry.ts       # Enhanced tool registry with MCP support
│   │   │   └── executor.ts       # Tool execution with MCP capabilities
│   ├── agent-memory/             # Memory management with Redis
│   └── ui-components/            # Shared UI components
```

## MCP Components

### 1. MCP Server Implementation

The MCP server will expose our custom tools to the AI agent:

```typescript
// packages/agent-tools/src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerCoreTools } from './tools/core.js';
import { registerDataTools } from './tools/data.js';
import { registerAPITools } from './tools/api.js';

export function createMcpServer() {
  const server = new McpServer({
    name: 'AI-Chatbot Tools',
    version: '1.0.0'
  });

  // Register all tool categories
  registerCoreTools(server);
  registerDataTools(server);
  registerAPITools(server);

  return server;
}
```

### 2. Tool Definitions

Each tool will be defined using MCP's standardized format with Zod for type validation:

```typescript
// packages/agent-tools/src/mcp/tools/core.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchWeb } from '../../implementations/web-search.js';
import { createDocument } from '../../implementations/document.js';

export function registerCoreTools(server: McpServer) {
  // Web search tool
  server.tool(
    'searchWeb',
    {
      query: z.string().describe('The search query'),
      numResults: z.number().optional().describe('Number of results to return')
    },
    async ({ query, numResults = 5 }) => {
      const results = await searchWeb(query, numResults);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    }
  );

  // Document creation tool
  server.tool(
    'createDocument',
    {
      title: z.string().describe('Document title'),
      content: z.string().describe('Document content'),
      type: z.enum(['code', 'text', 'sheet']).describe('Document type')
    },
    async ({ title, content, type }) => {
      const document = await createDocument({ title, content, type });
      return {
        content: [
          {
            type: 'text',
            text: `Created document with ID: ${document.id}`
          }
        ]
      };
    }
  );
}
```

### 3. Resource Definitions

MCP allows exposing resources (data sources) to the agent:

```typescript
// packages/agent-tools/src/mcp/tools/data.ts
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDocumentById } from '../../implementations/document.js';

export function registerDataTools(server: McpServer) {
  // Document resource
  server.resource(
    'document',
    new ResourceTemplate('document://{documentId}', { list: undefined }),
    async (uri, { documentId }) => {
      const document = await getDocumentById(documentId);
      return {
        contents: [
          {
            uri: uri.href,
            text: document.content,
            metadata: {
              title: document.title,
              createdAt: document.createdAt,
              type: document.type
            }
          }
        ]
      };
    }
  );
}
```

### 4. Enhanced Tool Registry with MCP

We'll enhance our existing tool registry to support MCP tools:

```typescript
// packages/agent-tools/src/registry.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ToolMetadata } from './types.js';
import { createMcpServer } from './mcp/server.js';
import { McpServerTransport } from './mcp/transport.js';

export class ToolRegistry {
  private tools: Map<string, ToolMetadata>;
  private mcpClient: Client | null = null;

  constructor() {
    this.tools = new Map();
    this.registerBuiltinTools();
  }

  async initMcpClient() {
    // Create an MCP server
    const server = createMcpServer();

    // Create a transport that connects the client to the server
    const transport = new McpServerTransport(server);

    // Create and connect the client
    this.mcpClient = new Client(
      { name: 'AI-Chatbot', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } }
    );

    await this.mcpClient.connect(transport);
  }

  async listMcpTools() {
    if (!this.mcpClient) {
      await this.initMcpClient();
    }

    const { tools } = await this.mcpClient!.listTools();
    return tools;
  }

  async executeMcpTool(name: string, args: Record<string, any>) {
    if (!this.mcpClient) {
      await this.initMcpClient();
    }

    const result = await this.mcpClient!.callTool({
      name,
      arguments: args
    });

    return result;
  }

  // ...existing methods
}
```

### 5. Tool Executor with MCP Support

Our tool executor will support both traditional and MCP-based execution:

```typescript
// packages/agent-tools/src/executor.ts
import { ToolRegistry } from './registry.js';
import { Redis } from '@upstash/redis';

export class ToolExecutor {
  private registry: ToolRegistry;
  private redis: Redis;

  constructor() {
    this.registry = new ToolRegistry();
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });
  }

  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    // Generate execution ID for tracking
    const executionId = `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      // Store execution start in Redis
      await this.redis.set(
        `tool:execution:${executionId}`,
        JSON.stringify({
          toolName,
          parameters,
          status: 'started',
          timestamp: new Date().toISOString()
        })
      );

      // Check if this is an MCP tool
      const mcpTools = await this.registry.listMcpTools();
      const isMcpTool = mcpTools.some((tool) => tool.name === toolName);

      let result;
      if (isMcpTool) {
        // Execute via MCP
        result = await this.registry.executeMcpTool(toolName, parameters);
      } else {
        // Execute via traditional method
        result = await this.executeTraditionalTool(toolName, parameters);
      }

      // Store successful execution in Redis
      await this.redis.set(
        `tool:execution:${executionId}`,
        JSON.stringify({
          toolName,
          parameters,
          status: 'completed',
          result,
          timestamp: new Date().toISOString()
        })
      );

      return result;
    } catch (error) {
      // Store failed execution in Redis
      await this.redis.set(
        `tool:execution:${executionId}`,
        JSON.stringify({
          toolName,
          parameters,
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        })
      );

      throw error;
    }
  }

  private async executeTraditionalTool(
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    // Implementation for traditional tool execution
    // ...
  }
}
```

### 6. Custom Transport Implementation

Implement a custom transport to facilitate direct communication:

```typescript
// packages/agent-tools/src/mcp/transport.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  Message,
  ServerTransport,
  ClientTransport,
  TransportEvents
} from '@modelcontextprotocol/sdk/types.js';

export class McpServerTransport implements ClientTransport {
  private server: McpServer;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  constructor(server: McpServer) {
    this.server = server;

    // Set up message handler
    server.onMessage((message) => {
      this.emit('message', message);
    });
  }

  async send(message: Message): Promise<void> {
    await this.server.processMessage(message);
  }

  on<K extends keyof TransportEvents>(
    event: K,
    listener: (...args: TransportEvents[K]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof TransportEvents>(
    event: K,
    listener: (...args: TransportEvents[K]) => void
  ): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(listener);
    }
  }

  private emit<K extends keyof TransportEvents>(event: K, ...args: TransportEvents[K]): void {
    if (this.listeners.has(event)) {
      for (const listener of this.listeners.get(event)!) {
        listener(...args);
      }
    }
  }
}
```

## Integration with Workflow Orchestration

The MCP tools will integrate with our Upstash Workflow:

```typescript
// packages/agent-workflow/src/workflows/agent-workflow.ts
import { serve } from '@upstash/workflow/nextjs';
import { ToolExecutor } from '@/packages/agent-tools';

export const { POST } = serve(async (context) => {
  // Tool execution step
  const toolResult = await context.run('execute-tool', async () => {
    const executor = new ToolExecutor();
    return executor.executeTool('searchWeb', { query: 'latest developments in AI' });
  });

  // Process tool result...
});
```

## Benefits of MCP Integration

1. **Standardization**: Following an industry-standard protocol for tool definition and execution
2. **Extensibility**: Easy to add new tools without modifying the core agent implementation
3. **Interoperability**: Tools can be used by any MCP-compatible client
4. **Type Safety**: Zod schema validation ensures type safety for tool parameters
5. **Discoverability**: Automatic tool discovery and metadata
6. **Maintenance**: Separation of concerns between tool implementation and agent execution

## Best Practices for MCP Tool Development

1. **Clear Documentation**: Each tool should have clear descriptions for both the tool itself and its parameters
2. **Error Handling**: Tool implementations should handle errors gracefully and return meaningful error messages
3. **Performance**: Tools should be optimized for performance, especially for high-frequency operations
4. **Statelessness**: Design tools to be stateless wherever possible
5. **Validation**: Use Zod schemas to validate input parameters before execution
6. **Resource Management**: Close connections and free resources after tool execution
7. **Security**: Implement proper authentication and authorization for sensitive operations

## Implementation Roadmap

1. **Setup TypeScript SDK**: Install and configure the MCP TypeScript SDK
2. **Define Core Tools**: Implement basic tools like search, artifact creation, and weather
3. **Create Custom Transport**: Implement direct communication between client and server
4. **Enhance Tool Registry**: Add MCP support to existing tool registry
5. **Add Resource Support**: Implement resource providers for various data sources
6. **Test Integration**: Validate tool execution through the MCP client
7. **Documentation**: Create comprehensive documentation for all tools

## Conclusion

Integrating the Model Context Protocol into our AI agent system provides a standardized, scalable approach to tool definition and execution. By leveraging MCP, we'll ensure our agent can access a wide range of data sources and capabilities while maintaining a clean architecture and separation of concerns.
