# Database Schema Design for AI Chatbot

## Overview

This document outlines the database schema design for the AI Chatbot application using Supabase (PostgreSQL) with Drizzle ORM. The schema is designed to support multi-organization structure, user management, conversations, messages, agents, and workflow steps.

## Schema Design Principles

1. **Type Safety**: All schema definitions use Drizzle ORM with TypeScript for full type safety
2. **Relational Integrity**: Foreign key constraints maintain data consistency
3. **Indexing Strategy**: Optimized indexes for query performance
4. **Scalability**: Schema designed for horizontal scaling with appropriate partition keys
5. **Audit Trail**: Timestamps and audit fields for data tracking

## Core Schema Definitions

### Organizations and Users

```typescript
import { pgTable, uuid, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Organizations table
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Organization relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(organizationUsers),
  subscriptions: many(subscriptions),
  agents: many(agents)
}));

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// User relations
export const usersRelations = relations(users, ({ many }) => ({
  organizations: many(organizationUsers),
  conversations: many(conversations)
}));

// Organization users junction table
export const organizationUsers = pgTable('organization_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').notNull(), // 'owner', 'admin', 'member'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Organization users relations
export const organizationUsersRelations = relations(organizationUsers, ({ one }) => ({
  user: one(users, {
    fields: [organizationUsers.userId],
    references: [users.id]
  }),
  organization: one(organizations, {
    fields: [organizationUsers.organizationId],
    references: [organizations.id]
  })
}));

// Subscriptions table
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').notNull(), // 'free', 'pro', 'enterprise'
  status: text('status').notNull(), // 'active', 'inactive', 'canceled'
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Subscription relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id]
  })
}));
```

### Conversations and Messages

```typescript
// Conversations table
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  systemPrompt: text('system_prompt'),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Conversation relations
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id]
  }),
  organization: one(organizations, {
    fields: [conversations.organizationId],
    references: [organizations.id]
  }),
  agent: one(agents, {
    fields: [conversations.agentId],
    references: [agents.id]
  }),
  messages: many(messages)
}));

// Messages table
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').notNull(), // 'user', 'assistant', 'system', 'tool'
  content: text('content').notNull(),
  toolCallId: text('tool_call_id'), // ID of the tool call (if this is a tool response)
  toolName: text('tool_name'), // Name of the tool called
  toolArgs: jsonb('tool_args'), // Arguments passed to the tool
  toolResult: jsonb('tool_result'), // Result returned from the tool
  parts: jsonb('parts'), // For multi-part messages (e.g., with images)
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Message relations
export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id]
  }),
  workflowStep: many(workflowSteps)
}));
```

### Agents and Tools

```typescript
// Agents table
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  createdById: uuid('created_by_id')
    .references(() => users.id)
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Agent relations
export const agentsRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agents.organizationId],
    references: [organizations.id]
  }),
  createdBy: one(users, {
    fields: [agents.createdById],
    references: [users.id]
  }),
  tools: many(agentTools),
  conversations: many(conversations)
}));

// Tools table
export const tools = pgTable('tools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(), // 'search', 'calculation', 'external_api', etc.
  parameters: jsonb('parameters').notNull(),
  implementation: text('implementation').notNull(), // Function name or API endpoint
  organizationId: uuid('organization_id').references(() => organizations.id),
  isSystem: boolean('is_system').default(false).notNull(), // System tools vs custom tools
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Tool relations
export const toolsRelations = relations(tools, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tools.organizationId],
    references: [organizations.id]
  }),
  agents: many(agentTools)
}));

// Agent tools junction table
export const agentTools = pgTable('agent_tools', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .references(() => agents.id, { onDelete: 'cascade' })
    .notNull(),
  toolId: uuid('tool_id')
    .references(() => tools.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Agent tools relations
export const agentToolsRelations = relations(agentTools, ({ one }) => ({
  agent: one(agents, {
    fields: [agentTools.agentId],
    references: [agents.id]
  }),
  tool: one(tools, {
    fields: [agentTools.toolId],
    references: [tools.id]
  })
}));
```

### Workflow Steps Table

```typescript
// Workflow steps table (for tracking agent execution)
export const workflowSteps = pgTable('workflow_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .references(() => agents.id)
    .notNull(),
  stepType: text('step_type').notNull(), // 'thinking', 'tool_execution', 'response'
  stepIndex: integer('step_index').notNull(), // Order in the workflow
  toolId: uuid('tool_id').references(() => tools.id),
  toolInput: jsonb('tool_input'),
  toolOutput: jsonb('tool_output'),
  status: text('status').notNull(), // 'pending', 'running', 'completed', 'failed'
  error: text('error'),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
  duration: integer('duration') // In milliseconds
});

// Workflow steps relations
export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
  conversation: one(conversations, {
    fields: [workflowSteps.conversationId],
    references: [conversations.id]
  }),
  message: one(messages, {
    fields: [workflowSteps.messageId],
    references: [messages.id]
  }),
  agent: one(agents, {
    fields: [workflowSteps.agentId],
    references: [agents.id]
  }),
  tool: one(tools, {
    fields: [workflowSteps.toolId],
    references: [tools.id]
  })
}));
```

## Workflow Steps Structure

The workflow steps table is designed to track the execution of agent workflows with detailed step information.

| Column         | Type      | Description                                                    |
| -------------- | --------- | -------------------------------------------------------------- |
| id             | UUID      | Primary key                                                    |
| conversationId | UUID      | Reference to conversation                                      |
| messageId      | UUID      | Reference to message (optional)                                |
| agentId        | UUID      | Reference to the agent executing the step                      |
| stepType       | text      | Type of step ('thinking', 'tool_execution', 'response')        |
| stepIndex      | integer   | Order of the step in the workflow                              |
| toolId         | UUID      | Reference to the tool (for tool execution steps)               |
| toolInput      | jsonb     | Input parameters for tool execution                            |
| toolOutput     | jsonb     | Output from tool execution                                     |
| status         | text      | Execution status ('pending', 'running', 'completed', 'failed') |
| error          | text      | Error message (if failed)                                      |
| startedAt      | timestamp | When the step started                                          |
| completedAt    | timestamp | When the step completed                                        |
| duration       | integer   | Execution time in milliseconds                                 |

## Indexing Strategy

```sql
-- Organization indexes
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- User indexes
CREATE INDEX idx_users_email ON users(email);

-- Organization users indexes
CREATE INDEX idx_organization_users_user_id ON organization_users(user_id);
CREATE INDEX idx_organization_users_organization_id ON organization_users(organization_id);
CREATE UNIQUE INDEX idx_unique_user_organization ON organization_users(user_id, organization_id);

-- Conversation indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_organization_id ON conversations(organization_id);
CREATE INDEX idx_conversations_agent_id ON conversations(agent_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

-- Message indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Agent indexes
CREATE INDEX idx_agents_organization_id ON agents(organization_id);
CREATE INDEX idx_agents_created_by_id ON agents(created_by_id);
CREATE INDEX idx_agents_is_public ON agents(is_public);

-- Workflow steps indexes
CREATE INDEX idx_workflow_steps_conversation_id ON workflow_steps(conversation_id);
CREATE INDEX idx_workflow_steps_agent_id ON workflow_steps(agent_id);
CREATE INDEX idx_workflow_steps_status ON workflow_steps(status);
```

## Schema Visualization

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Organizations  │      │      Users      │      │  Subscriptions  │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ id              │◄─┐   │ id              │◄─┐   │ id              │
│ name            │  │   │ email           │  │   │ organization_id ├─┐
│ slug            │  │   │ name            │  │   │ plan            │ │
│ logo_url        │  │   │ avatar_url      │  │   │ status          │ │
│ settings        │  │   │ created_at      │  │   │ created_at      │ │
│ created_at      │  │   │ updated_at      │  │   │ updated_at      │ │
│ updated_at      │  │   └─────────────────┘  │   └─────────────────┘ │
└─────────────────┘  │                        │                       │
         ▲           │   ┌─────────────────┐  │                       │
         └───────────┼───│Organization Users│◄─┘                       │
                     │   ├─────────────────┤                          │
                     └───┤ id              │                          │
                         │ user_id         │                          │
                         │ organization_id ├──────────────────────────┘
                         │ role            │
                         │ created_at      │
                         │ updated_at      │
                         └─────────────────┘

┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Conversations  │      │    Messages     │      │ Workflow Steps  │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ id              │◄─┐   │ id              │◄─┐   │ id              │
│ title           │  │   │ conversation_id ├─┐│   │ conversation_id ├─┐
│ user_id         │  │   │ role            │ ││   │ message_id      ├─┼─┐
│ organization_id │  │   │ content         │ ││   │ agent_id        ├─┼─┼─┐
│ system_prompt   │  │   │ tool_call_id    │ ││   │ step_type       │ │ │ │
│ agent_id        ├─┐│   │ tool_name       │ ││   │ step_index      │ │ │ │
│ metadata        │ ││   │ tool_args       │ ││   │ tool_id         ├─┼─┼─┼─┐
│ created_at      │ ││   │ tool_result     │ ││   │ tool_input      │ │ │ │ │
│ updated_at      │ ││   │ parts           │ ││   │ tool_output     │ │ │ │ │
└─────────────────┘ ││   │ created_at      │ ││   │ status          │ │ │ │ │
                    ││   └─────────────────┘ ││   │ error           │ │ │ │ │
                    ││                       ││   │ started_at      │ │ │ │ │
┌─────────────────┐ ││                       ││   │ completed_at    │ │ │ │ │
│     Agents      │ ││                       ││   │ duration        │ │ │ │ │
├─────────────────┤ ││                       ││   └─────────────────┘ │ │ │ │
│ id              │◄┘│                       ││         │             │ │ │ │
│ organization_id │  │                       ││         └─────────────┘ │ │ │
│ created_by_id   │  │                       ││                         │ │ │
│ name            │  │                       ││                         │ │ │
│ description     │  │                       ││                         │ │ │
│ system_prompt   │  │                       ││                         │ │ │
│ is_public       │  │                       ││                         │ │ │
│ metadata        │  │                       ││                         │ │ │
│ created_at      │  │                       ││                         │ │ │
│ updated_at      │  │                       ││                         │ │ │
└─────────────────┘  │                       ││                         │ │ │
         ▲           │                       ││                         │ │ │
         │           │                       ││                         │ │ │
┌─────────────────┐  │                       ││                         │ │ │
│   Agent Tools   │  │                       ││                         │ │ │
├─────────────────┤  │                       ││                         │ │ │
│ id              │  │                       ││                         │ │ │
│ agent_id        ├──┘                       ││                         │ │ │
│ tool_id         ├──┐                       ││                         │ │ │
│ created_at      │  │                       ││                         │ │ │
└─────────────────┘  │                       ││                         │ │ │
                     │                       ││                         │ │ │
                     │                       ││                         │ │ │
┌─────────────────┐  │                       ││                         │ │ │
│      Tools      │  │                       ││                         │ │ │
├─────────────────┤  │                       ││                         │ │ │
│ id              │◄─┘                       ││                         │ │ │
│ name            │                          ││                         │ │ │
│ description     │                          ││                         │ │ │
│ category        │                          ││                         │ │ │
│ parameters      │                          ││                         │ │ │
│ implementation  │                          ││                         │ │ │
│ organization_id │                          ││                         │ │ │
│ is_system       │                          ││                         │ │ │
│ created_at      │                          ││                         │ │ │
│ updated_at      │                          ││                         │ │ │
└─────────────────┘                          ││                         │ │ │
         │                                   ││                         │ │ │
         └───────────────────────────────────┼┼─────────────────────────┘ │ │
                                             ││                           │ │ │
                                             │└───────────────────────────┘ │ │
                                             │                              │ │ │
                                             └──────────────────────────────┘ │ │
```

## Example Usage

### Creating a New Organization with Owner

```typescript
import { db } from './database';
import { organizations, users, organizationUsers } from './schema';

async function createOrganization(name: string, ownerEmail: string, ownerName: string) {
  return await db.transaction(async (tx) => {
    // Create organization
    const [organization] = await tx
      .insert(organizations)
      .values({
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-')
      })
      .returning();

    // Create or find user
    let user = await tx.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, ownerEmail)
    });

    if (!user) {
      const [newUser] = await tx
        .insert(users)
        .values({
          email: ownerEmail,
          name: ownerName
        })
        .returning();
      user = newUser;
    }

    // Add user as organization owner
    await tx.insert(organizationUsers).values({
      userId: user.id,
      organizationId: organization.id,
      role: 'owner'
    });

    return { organization, user };
  });
}
```

### Recording Agent Workflow Steps

```typescript
import { db } from './database';
import { workflowSteps } from './schema';

async function recordWorkflowStep(
  conversationId: string,
  agentId: string,
  stepType: 'thinking' | 'tool_execution' | 'response',
  stepIndex: number,
  data: {
    messageId?: string;
    toolId?: string;
    toolInput?: Record<string, unknown>;
  }
) {
  const startedAt = new Date();

  // Insert workflow step
  const [step] = await db
    .insert(workflowSteps)
    .values({
      conversationId,
      messageId: data.messageId,
      agentId,
      stepType,
      stepIndex,
      toolId: data.toolId,
      toolInput: data.toolInput,
      status: 'running',
      startedAt
    })
    .returning();

  return step;
}

async function completeWorkflowStep(
  stepId: string,
  status: 'completed' | 'failed',
  data: {
    toolOutput?: Record<string, unknown>;
    error?: string;
  }
) {
  const completedAt = new Date();

  // Update workflow step
  const [updatedStep] = await db
    .update(workflowSteps)
    .set({
      status,
      toolOutput: data.toolOutput,
      error: data.error,
      completedAt,
      duration: completedAt.getTime() - new Date(step.startedAt).getTime()
    })
    .where(eq(workflowSteps.id, stepId))
    .returning();

  return updatedStep;
}
```

## Migration Strategy

The database schema will be migrated using Drizzle Kit, with proper versioning and rollback capabilities:

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || ''
  },
  verbose: true,
  strict: true
} satisfies Config;
```

### Migration Process

1. **Generate Migration**: `npx drizzle-kit generate:pg`
2. **Review Migration**: Ensure changes are as expected
3. **Apply Migration**: Execute migration in production with proper backups
4. **Validate**: Verify data integrity after migration

## Conclusion

This database schema provides a robust foundation for the AI Chatbot application, supporting:

1. **Multi-Organization Structure**: Organizations with users and role-based permissions
2. **Subscription Management**: Integration with Stripe for billing
3. **Conversations and Messages**: Core chat functionality
4. **Agent System**: Flexible agent definitions with tool integration
5. **Workflow Tracking**: Detailed step-by-step workflow execution records

The schema is designed for type safety, performance, and scalability in a serverless environment, while maintaining the flexibility needed for future enhancements.
