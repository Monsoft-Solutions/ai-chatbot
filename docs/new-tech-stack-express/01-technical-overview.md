# Technical Overview: VernisAI with tRPC

## Feature Overview

VernisAI is a sophisticated application that enables users to interact with AI models through both simple chat interfaces and complex agent-based workflows. The system supports multiple organizations, each with their own set of users, and allows for the creation and management of custom AI agents that can perform specific tasks.

### Key Features

- **AI-Powered Chat**: Real-time conversations with state-of-the-art AI models
- **Intelligent Agents**: Predefined and dynamic agents capable of using tools and solving complex tasks
- **Multi-Organization Support**: Organization-based access control and user management
- **API-First Architecture**: Fully accessible via tRPC endpoints with TypeScript SDK
- **Third-Party Integration**: OpenAPI documentation and SDK for third-party developers
- **Serverless Deployment**: Efficient scaling and cost optimization

## Architecture Overview

VernisAI application is built on a modern serverless architecture using TypeScript, tRPC, and Supabase. The application is designed to be deployed as serverless functions, providing excellent scalability and cost efficiency.

```
┌───────────────────────┐
│                       │
│    Client Apps        │
│    (Web/Mobile)       │
│                       │
└───────────┬───────────┘
            │
            │ HTTPS/tRPC
            ▼
┌───────────────────────┐
│                       │
│   API Layer (tRPC)    │
│   (Serverless)        │
│                       │
└───────────┬───────────┘
            │
            │
            ▼
┌───────────────────────────────────────────────────┐
│                                                   │
│              Service Layer                        │
│                                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │             │ │             │ │             │ │
│  │   User &    │ │  Chat &     │ │  Agent      │ │
│  │Organization │ │  Message    │ │  System     │ │
│  │  Service    │ │  Service    │ │  Service    │ │
│  │             │ │             │ │             │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                   │
└───────────┬───────────────────────┬───────────────┘
            │                       │
            │                       │
            ▼                       ▼
┌───────────────────┐     ┌─────────────────────────┐
│                   │     │                         │
│   Data Layer      │     │   External Services     │
│   (Supabase/      │     │                         │
│    Drizzle)       │     │  ┌─────────┐ ┌───────┐ │
│                   │     │  │         │ │       │ │
│                   │     │  │ OpenAI/ │ │Upstash│ │
│                   │     │  │Anthropic│ │/Stripe│ │
│                   │     │  │         │ │       │ │
│                   │     │  └─────────┘ └───────┘ │
│                   │     │                         │
└───────────────────┘     └─────────────────────────┘
```

## Key Components and Modules

### API Layer (tRPC)

The API layer is implemented using tRPC, providing type-safe API endpoints with automatic TypeScript type generation for clients. This layer handles:

- Request validation
- Authentication and authorization
- Rate limiting
- Request routing
- OpenAPI documentation generation

### Service Layer

The service layer contains the core business logic, separated into several key services:

- **User & Organization Service**: Manages user accounts, organization membership, and permissions
- **Chat & Message Service**: Handles conversation management and message processing
- **Agent Service**: Manages agent definitions, tool integrations, and agent execution

### Data Layer

The data layer uses Supabase (PostgreSQL) with Drizzle ORM for type-safe database access:

- **Database Schema**: Strongly typed with Drizzle ORM
- **Database Migrations**: Managed with Drizzle Kit
- **Connection Pooling**: Optimized for serverless environments

### External Service Integrations

- **AI Providers**: OpenAI, Anthropic, and other LLM providers
- **Upstash**: Redis for caching, Workflow for agent tasks, QStash for message queuing
- **Stripe**: Subscription and payment processing

## Technical Stack

### Core Technologies

- **Language**: TypeScript
- **API Framework**: tRPC
- **Database**: Supabase PostgreSQL
- **ORM**: Drizzle ORM
- **Serverless Deployment**: Vercel or AWS Lambda
- **Authentication**: Supabase Auth with JWT

### AI & Agent Technologies

- **AI SDK**: Vercel AI SDK
- **LLM Integration**: OpenAI, Anthropic
- **Agent Framework**: Custom implementation using AI SDK for multi-step execution
- **Stream Processing**: Server-Sent Events (SSE) for real-time streaming

### Development & Deployment

- **Package Management**: pnpm with workspaces
- **Build System**: TypeScript, ESBuild
- **Testing**: Vitest, Playwright
- **CI/CD**: GitHub Actions
- **Containerization**: Docker for local development
- **API Documentation**: OpenAPI with Swagger UI

## Implementation Strategy

### tRPC Implementation

The API will be implemented using tRPC for type-safe API endpoints:

```typescript
// Example tRPC router structure
export const appRouter = router({
  users: userRouter,
  organizations: organizationRouter,
  conversations: conversationRouter,
  messages: messageRouter,
  agents: agentRouter,
  billing: billingRouter
});

// Example procedure (endpoint)
export const userRouter = router({
  getCurrentUser: protectedProcedure.query(async ({ ctx }) => {
    // Get current user logic
    return ctx.userService.getCurrentUser(ctx.user.id);
  })

  // Other user endpoints
});

// Export type for client usage
export type AppRouter = typeof appRouter;
```

### OpenAPI Integration

The tRPC API will be documented using OpenAPI specifications:

```typescript
import { generateOpenApiDocument } from 'trpc-openapi';

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'VernisAI API',
  version: '1.0.0',
  baseUrl: 'https://app.vernis.ai/api'
});
```

### Organization & User Structure

The system uses a multi-tenant design with organizations as the top-level entity:

```
Organization
  └── Users
       ├── Owner (Admin)
       └── Members (various roles)
  └── Subscriptions
  └── Conversations
  └── Agents
       ├── Public (available to all users in organization)
       └── Private (user-specific)
```

### Agent System

Agent implementation follows the AI SDK agent design patterns:

1. **Agent Definition**: Schema for defining agent capabilities, tools, and system prompt
2. **Agent Execution**: Multi-step execution with tool handling
3. **Agent Storage**: Persistence of agent definitions and execution state

## Integration Strategy

### Client Integration

Clients can integrate with the AI Chatbot using:

1. **TypeScript SDK**: Type-safe client library generated from tRPC router
2. **REST API**: Traditional REST endpoints generated from tRPC with OpenAPI documentation
3. **WebSocket**: Real-time updates for conversation and agent status

### Third-Party Integration

Third-party developers can:

1. Use the OpenAPI documentation to generate clients in any language
2. Leverage the TypeScript SDK for type-safe integration
3. Implement webhook receivers for agent-based notifications

## Impact on Existing Architecture

The transition to tRPC from Express.js introduces several architectural changes:

1. **Type-Safety**: End-to-end type safety from API to client
2. **Code Generation**: Automatic client code generation
3. **Documentation**: Integrated OpenAPI documentation
4. **Request Validation**: Automatic validation with Zod schemas

## Future Considerations

1. **GraphQL Integration**: Potential addition of GraphQL endpoint through tRPC adapters
2. **Edge Deployment**: Moving computation closer to users with edge functions
3. **Advanced Agent Capabilities**: Implementing agent-to-agent communication and workflow orchestration
4. **Fine-Tuning Integration**: Allowing organizations to fine-tune their own models
5. **Federated Organizations**: Enabling cross-organization collaboration and agent sharing
