# Database Integration with Express and Drizzle ORM

## Overview

This document outlines the database integration strategy for the AI Chatbot application using Express.js as the API layer, Supabase PostgreSQL as the database, and Drizzle ORM for database access. This integration is designed to work efficiently in a serverless environment.

## Database Technology Stack

- **Database Provider**: Supabase (PostgreSQL)
- **ORM**: Drizzle ORM
- **Connection Management**: Connection pooling for serverless
- **Migration Tool**: Drizzle Kit
- **Type Generation**: TypeScript type inference from schema

## Database Integration Architecture

```
┌───────────────────────┐
│                       │
│    Express API        │
│    (Serverless)       │
│                       │
└───────────┬───────────┘
            │
            │
            ▼
┌───────────────────────┐
│                       │
│   Database Package    │
│                       │
│  ┌─────────────────┐  │
│  │                 │  │
│  │  Drizzle ORM    │  │
│  │                 │  │
│  └─────────────────┘  │
│                       │
└───────────┬───────────┘
            │
            │
            ▼
┌───────────────────────┐
│                       │
│  Supabase PostgreSQL  │
│                       │
└───────────────────────┘
```

## Connection Management for Serverless

Serverless environments require special consideration for database connections. The solution must:

1. Efficiently handle connection pooling
2. Support multiple concurrent requests
3. Minimize connection overhead during cold starts
4. Close connections appropriately when functions terminate

### Implementation

```javascript
// packages/database/src/index.js
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { schema } = require('./schema');

// Connection pooling configuration
const connectionString = process.env.SUPABASE_CONNECTION_STRING;

// For serverless environments, configure a lower connection limit
const poolConfig = {
  max: 10, // Maximum connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  prepare: false // Disable prepared statements in serverless
};

// Create a postgres connection pool
const client = postgres(connectionString, poolConfig);

// Initialize Drizzle with the postgres client
const db = drizzle(client, { schema });

// Function to close connections when done
async function closeConnection() {
  try {
    await client.end();
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

module.exports = { db, closeConnection };
```

## Database Schema Definition with Drizzle

The schema definitions are maintained in a shared package to ensure consistency across the application.

```typescript
// packages/database/src/schema/index.ts
import { pgTable, uuid, text, timestamp, jsonb, boolean, integer } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Conversations table
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

// Messages table
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

// Export additional tables...
// export const agents = pgTable(...)
// export const artifacts = pgTable(...)

// Export inferred types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
```

## Express Middleware for Database Connection

In serverless environments, it's important to manage database connections efficiently. This middleware ensures connections are properly handled for each request:

```javascript
// apps/api/src/middleware/database.js
const { db, closeConnection } = require('@/packages/database');

function databaseMiddleware(req, res, next) {
  // Attach the database instance to the request
  req.db = db;

  // Close database connection after response is sent
  res.on('finish', () => {
    // In serverless environments, connections should be closed after each request
    if (process.env.NODE_ENV === 'production') {
      closeConnection().catch((err) => {
        console.error('Error closing DB connection:', err);
      });
    }
  });

  next();
}

module.exports = { databaseMiddleware };
```

## Database Access Layer

Create a repository pattern to abstract database operations:

```javascript
// packages/database/src/repositories/conversationRepository.js
const { and, eq, desc } = require('drizzle-orm');
const { db } = require('../index');
const { conversations, messages } = require('../schema');

class ConversationRepository {
  // Create a new conversation
  async create(data) {
    const result = await db.insert(conversations).values(data).returning();
    return result[0];
  }

  // Find conversation by ID and user ID (for security)
  async findByIdAndUser(id, userId) {
    return db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.userId, userId))
    });
  }

  // Get conversations for a user
  async findByUser(userId, limit = 20, offset = 0) {
    return db.query.conversations.findMany({
      where: eq(conversations.userId, userId),
      orderBy: [desc(conversations.updatedAt)],
      limit,
      offset
    });
  }

  // Update a conversation
  async update(id, data) {
    const result = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();

    return result[0];
  }

  // Delete a conversation
  async delete(id) {
    return db.delete(conversations).where(eq(conversations.id, id));
  }

  // Get messages for a conversation
  async getMessages(conversationId) {
    return db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.createdAt)]
    });
  }
}

module.exports = new ConversationRepository();
```

## Integration in Express Controllers

Here's how to integrate the database repositories with Express controllers:

```javascript
// apps/api/src/controllers/conversation.js
const conversationRepository = require('@/packages/database/repositories/conversationRepository');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

// Get all user conversations
async function getConversations(req, res) {
  const userId = req.user.id;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    // Try to get from cache first
    const cacheKey = `user:${userId}:conversations:${limit}:${offset}`;
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // Get from database if not in cache
    const conversations = await conversationRepository.findByUser(userId, limit, offset);

    // Store in cache for 2 minutes
    await redis.set(cacheKey, JSON.stringify(conversations), { ex: 120 });

    return res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}

// Get single conversation
async function getConversation(req, res) {
  const conversationId = req.params.id;
  const userId = req.user.id;

  try {
    const conversation = await conversationRepository.findByIdAndUser(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    return res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return res.status(500).json({ error: 'Failed to fetch conversation' });
  }
}

// Create new conversation
async function createConversation(req, res) {
  const { title, systemPrompt } = req.body;
  const userId = req.user.id;

  try {
    const newConversation = await conversationRepository.create({
      userId,
      title: title || 'New Conversation',
      systemPrompt,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Invalidate cache
    const cacheKey = `user:${userId}:conversations:*`;
    await redis.del(cacheKey);

    return res.status(201).json(newConversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
}

// More controller functions...

module.exports = {
  getConversations,
  getConversation,
  createConversation
  // Additional functions
};
```

## Database Migrations with Drizzle Kit

Drizzle Kit provides tools for generating and running database migrations:

```javascript
// packages/database/drizzle.config.js
require('dotenv').config({ path: '../../.env' });

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: './src/schema.ts',
  out: './migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.SUPABASE_CONNECTION_STRING
  },
  verbose: true,
  strict: true
};
```

### Migration Commands

Add these commands to the package.json:

```json
// packages/database/package.json
{
  "scripts": {
    "generate": "drizzle-kit generate:pg",
    "migrate": "node -r dotenv/config ./src/scripts/migrate.js",
    "studio": "drizzle-kit studio"
  }
}
```

### Migration Script

```javascript
// packages/database/src/scripts/migrate.js
const { migrate } = require('drizzle-orm/postgres-js/migrator');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');

async function runMigrations() {
  const connectionString = process.env.SUPABASE_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error('SUPABASE_CONNECTION_STRING environment variable is not set');
  }

  // Create a postgres connection
  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log('Running migrations...');

  try {
    // This will run all the migrations in the migrations folder
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

runMigrations();
```

## Data Seeding for Development

Create seed scripts for development environments:

```javascript
// packages/database/src/scripts/seed.js
const { db, closeConnection } = require('../index');
const { users, conversations, messages } = require('../schema');

async function seed() {
  try {
    console.log('Seeding database...');

    // Clear existing data (development only)
    await db.delete(messages);
    await db.delete(conversations);
    await db.delete(users);

    // Create a test user
    const [user] = await db
      .insert(users)
      .values({
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    console.log(`Created test user with ID: ${user.id}`);

    // Create a test conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        userId: user.id,
        title: 'Test Conversation',
        systemPrompt: 'You are a helpful assistant.',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    console.log(`Created test conversation with ID: ${conversation.id}`);

    // Add some messages
    await db.insert(messages).values([
      {
        conversationId: conversation.id,
        role: 'system',
        content: 'You are a helpful assistant.',
        createdAt: new Date()
      },
      {
        conversationId: conversation.id,
        role: 'user',
        content: 'Hello, how are you?',
        createdAt: new Date(Date.now() - 1000)
      },
      {
        conversationId: conversation.id,
        role: 'assistant',
        content: "I'm doing well, thank you! How can I assist you today?",
        createdAt: new Date()
      }
    ]);

    console.log('Added messages to conversation');
    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await closeConnection();
  }
}

seed();
```

## Optimizing for Serverless Environment

### Connection Pooling Strategy

Serverless environments require special consideration for database connections:

1. **Pool Management**: Use a lightweight connection pool with low limits
2. **Connection Reuse**: Keep connections alive between function invocations when possible
3. **Efficient Termination**: Close connections when functions are about to be terminated

```javascript
// packages/database/src/serverless-pool.js
const postgres = require('postgres');
let connectionPool = null;

// Initialize or reuse connection pool
function getConnectionPool() {
  if (connectionPool) {
    return connectionPool;
  }

  const connectionString = process.env.SUPABASE_CONNECTION_STRING;

  // Configure pool with serverless-friendly settings
  connectionPool = postgres(connectionString, {
    max: 10, // Maximum connections
    idle_timeout: 20, // Close idle connections after 20 seconds
    connect_timeout: 10, // Connection timeout
    prepare: false, // Disable prepared statements in serverless
    // Close connections gracefully on serverless platform shutdown
    onclose: async () => {
      connectionPool = null;
    }
  });

  return connectionPool;
}

// Function to explicitly end the pool
async function closeConnectionPool() {
  if (connectionPool) {
    await connectionPool.end();
    connectionPool = null;
  }
}

module.exports = {
  getConnectionPool,
  closeConnectionPool
};
```

### Implementing Soft Shutdown in Express

For Lambda and serverless environments, properly handle shutdown events:

```javascript
// apps/api/src/app.js
const express = require('express');
const { closeConnectionPool } = require('@/packages/database/serverless-pool');
const app = express();

// ... app configuration and routes ...

// Handle graceful shutdown for serverless environments
if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL) {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing connections');
    await closeConnectionPool();
    console.log('Connections closed');
  });
}

module.exports = app;
```

## Transaction Management

Drizzle ORM supports transactions for operations that require atomicity:

```javascript
// Example of using transactions
// packages/database/src/repositories/messageRepository.js
const { db } = require('../index');
const { messages, conversations } = require('../schema');
const { eq } = require('drizzle-orm');

class MessageRepository {
  // Create a message and update conversation in a transaction
  async createMessageAndUpdateConversation(messageData, conversationId) {
    return await db.transaction(async (tx) => {
      // Insert message
      const [message] = await tx.insert(messages).values(messageData).returning();

      // Update conversation's lastMessageAt
      await tx
        .update(conversations)
        .set({
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversationId));

      return message;
    });
  }
}

module.exports = new MessageRepository();
```

## Query Optimization

Optimize database queries for performance:

```javascript
// Query optimization examples
// packages/database/src/repositories/optimizedRepository.js
const { db } = require('../index');
const { conversations, messages, users } = require('../schema');
const { eq, desc, sql } = require('drizzle-orm');

class OptimizedRepository {
  // Use selective columns to reduce data transfer
  async getConversationSummaries(userId) {
    return db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        // Get the latest message content using a subquery
        lastMessage: sql`(
        SELECT content FROM ${messages} 
        WHERE ${messages.conversationId} = ${conversations.id} 
        ORDER BY ${messages.createdAt} DESC 
        LIMIT 1
      )`
      })
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(20);
  }

  // Use pagination for large result sets
  async getPaginatedMessages(conversationId, page = 1, pageSize = 50) {
    const offset = (page - 1) * pageSize;

    return db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [desc(messages.createdAt)],
      limit: pageSize,
      offset
    });
  }

  // Use joins for related data
  async getConversationWithDetails(conversationId) {
    return db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });
  }
}

module.exports = new OptimizedRepository();
```

## Caching Strategy

Implement caching to reduce database load:

```javascript
// packages/database/src/repositories/cachedRepository.js
const { Redis } = require('@upstash/redis');
const { db } = require('../index');
const { eq } = require('drizzle-orm');
const { conversations } = require('../schema');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

class CachedRepository {
  // Get a conversation with caching
  async getConversation(id) {
    // Try cache first
    const cacheKey = `conversation:${id}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database if not in cache
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)]
        }
      }
    });

    if (conversation) {
      // Cache for 5 minutes
      await redis.set(cacheKey, JSON.stringify(conversation), { ex: 300 });
    }

    return conversation;
  }

  // Invalidate cache when data changes
  async invalidateCache(conversationId) {
    const cacheKey = `conversation:${conversationId}`;
    await redis.del(cacheKey);
  }

  // Update data and manage cache
  async updateConversation(id, data) {
    // Update in database
    const result = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();

    // Invalidate cache
    await this.invalidateCache(id);

    return result[0];
  }
}

module.exports = new CachedRepository();
```

## Error Handling and Logging

Implement robust error handling for database operations:

```javascript
// packages/database/src/utils/errorHandler.js
const { logger } = require('@/packages/logger');

// Database error codes
const DB_ERROR_CODES = {
  23505: 'Unique constraint violation',
  23503: 'Foreign key constraint violation',
  '42P01': 'Table does not exist',
  42703: 'Column does not exist'
};

function handleDatabaseError(error, context = 'Database operation') {
  // Generate a unique error ID
  const errorId = Math.random().toString(36).substring(2, 10);

  // Determine if this is a known database error
  let errorType = 'Unknown database error';
  let errorMessage = error.message;

  if (error.code && DB_ERROR_CODES[error.code]) {
    errorType = DB_ERROR_CODES[error.code];
  }

  // Log the error with context
  logger.error({
    message: `${context} failed: ${errorMessage}`,
    errorId,
    errorType,
    code: error.code,
    stack: error.stack
  });

  // Return a formatted error that's safe to return to clients
  return {
    error: errorType,
    message: process.env.NODE_ENV === 'development' ? errorMessage : 'Database operation failed',
    errorId
  };
}

module.exports = { handleDatabaseError };
```

## Conclusion

This database integration approach provides a robust foundation for the Express.js API in a serverless environment. By using Drizzle ORM with Supabase PostgreSQL, the application achieves:

1. **Type-safety**: Strong typing with TypeScript integration
2. **Performance**: Optimized queries and connection pooling
3. **Scalability**: Efficient resource usage in serverless environments
4. **Maintainability**: Clean repository pattern for database access
5. **Reliability**: Transaction support and error handling

The architecture is designed to work efficiently with Express.js in a serverless context, addressing the specific challenges of connection management and resource optimization in that environment.
