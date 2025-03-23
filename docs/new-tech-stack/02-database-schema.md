# Database Schema Design: Supabase with Drizzle ORM

## Overview

This document outlines the database schema design for the AI Chatbot application using Supabase as the database provider and Drizzle ORM for type-safe database access. The schema is designed to support all existing functionality while extending to accommodate the new agent creation capabilities.

## Database Technology Stack

- **Database Provider**: Supabase (PostgreSQL)
- **ORM**: Drizzle ORM
- **Migration Tool**: Drizzle Kit
- **Type Generation**: TypeScript type generation from schema

## Schema Design Principles

1. **Type Safety**: Leverage TypeScript and Drizzle for fully type-safe database operations
2. **Normalization**: Proper data normalization to avoid redundancy
3. **Relationships**: Well-defined relationships between entities
4. **Indexing**: Strategic indexing for performance optimization
5. **Extensibility**: Design for future enhancements

## Core Schema Definitions

### Users Table

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Conversations Table

```typescript
import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  title: text('title').notNull(),
  systemPrompt: text('system_prompt'),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
```

### Messages Table

```typescript
import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { conversations } from './conversations';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  role: text('role').notNull(), // 'user', 'assistant', 'system'
  content: text('content').notNull(),
  parts: jsonb('parts').$type<any[]>(),
  attachments: jsonb('attachments').$type<any[]>(),
  reasoning: text('reasoning'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
```

### Artifacts Table

```typescript
import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';
import { messages } from './messages';

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  messageId: uuid('message_id').references(() => messages.id),
  type: text('type').notNull(), // 'code', 'text', 'sheet', 'image'
  title: text('title').notNull(),
  content: text('content'),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
```

## Agent-Related Schema

### Agent Definitions Table

```typescript
import { pgTable, text, timestamp, uuid, jsonb, boolean } from 'drizzle-orm/pg-core';
import { users } from './users';

export const agentDefinitions = pgTable('agent_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  tools: jsonb('tools').$type<string[]>(), // Tool IDs this agent can use
  capabilities: jsonb('capabilities').$type<Record<string, any>>(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type AgentDefinition = typeof agentDefinitions.$inferSelect;
export type NewAgentDefinition = typeof agentDefinitions.$inferInsert;
```

### Agent Instances Table

```typescript
import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';
import { agentDefinitions } from './agentDefinitions';

export const agentInstances = pgTable('agent_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  definitionId: uuid('definition_id')
    .references(() => agentDefinitions.id)
    .notNull(),
  name: text('name').notNull(),
  configuration: jsonb('configuration').$type<Record<string, any>>(),
  status: text('status').notNull().default('active'), // 'active', 'paused', 'archived'
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type AgentInstance = typeof agentInstances.$inferSelect;
export type NewAgentInstance = typeof agentInstances.$inferInsert;
```

### Agent Tools Table

```typescript
import { pgTable, text, timestamp, uuid, jsonb, boolean } from 'drizzle-orm/pg-core';

export const agentTools = pgTable('agent_tools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  schema: jsonb('schema').$type<Record<string, any>>().notNull(), // JSON Schema for tool parameters
  isSystem: boolean('is_system').default(false).notNull(), // Is this a system tool or custom?
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type AgentTool = typeof agentTools.$inferSelect;
export type NewAgentTool = typeof agentTools.$inferInsert;
```

### Workflows Table

```typescript
import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users';
import { agentInstances } from './agentInstances';

export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  agentInstanceId: uuid('agent_instance_id').references(() => agentInstances.id),
  workflowId: text('workflow_id').notNull(), // Upstash Workflow ID
  status: text('status').notNull(), // 'pending', 'running', 'completed', 'failed'
  goal: text('goal').notNull(),
  steps: jsonb('steps').$type<Record<string, any>[]>(),
  result: jsonb('result').$type<Record<string, any>>(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
```

## Subscription and Payment Schema

### Subscriptions Table

```typescript
import { pgTable, text, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  stripeCurrentPeriodEnd: timestamp('stripe_current_period_end'),
  plan: text('plan').notNull(), // 'free', 'pro', 'enterprise'
  status: text('status').notNull(), // 'active', 'canceled', 'past_due'
  isActive: boolean('is_active').default(false).notNull(),
  agentLimit: integer('agent_limit').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
```

## Database Relationships Diagram

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│              │     │               │     │              │
│    Users     │◄────┤ Conversations │◄────┤   Messages   │
│              │     │               │     │              │
└──────┬───────┘     └───────────────┘     └──────┬───────┘
       │                                          │
       │                                          │
       ▼                                          ▼
┌──────────────┐                          ┌──────────────┐
│              │                          │              │
│   Artifacts  │                          │    Workflows │
│              │                          │              │
└──────────────┘                          └──────┬───────┘
       ▲                                          │
       │                                          │
       │       ┌────────────────┐                 │
       │       │                │                 │
       └───────┤ AgentInstances │◄────────────────┘
               │                │
               └────────┬───────┘
                        │
                        │
                        ▼
               ┌────────────────┐     ┌──────────────┐
               │                │     │              │
               │AgentDefinitions│◄────┤  AgentTools  │
               │                │     │              │
               └────────────────┘     └──────────────┘
```

## Migration Strategy

The migration to the new database schema will follow these steps:

1. **Schema Definition**:

   - Define all tables using Drizzle syntax
   - Generate TypeScript types from schema

2. **Migration Planning**:

   - Use Drizzle Kit to generate migration scripts
   - Test migrations in development environment

3. **Data Migration**:

   - Export data from existing Postgres database
   - Transform data to match new schema
   - Import data into Supabase

4. **Validation**:
   - Verify data integrity after migration
   - Run automated tests against new database

## Database Access Layer

The database access layer will be implemented as a separate package in the monorepo:

```
packages/database/
├── src/
│   ├── schema/           # Schema definition files
│   ├── queries/          # Reusable query functions
│   ├── migrations/       # Generated migration files
│   └── index.ts          # Main export file
└── package.json
```

## Example Database Usage

```typescript
// Example query
import { db } from '@/packages/database';
import { conversations, messages, eq } from '@/packages/database/schema';

export async function getConversationMessages(conversationId: string) {
  return db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    with: {
      messages: {
        orderBy: (messages, { asc }) => [asc(messages.createdAt)]
      }
    }
  });
}
```
