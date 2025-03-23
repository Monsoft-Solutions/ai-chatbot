# Express API Architecture for Serverless Deployment

## Overview

This document outlines the architecture for building the AI Chatbot's backend API using Express.js, designed specifically for serverless deployment. This approach combines the familiarity and flexibility of Express with the scalability and cost-efficiency of serverless infrastructure.

## Technology Stack

- **API Framework**: Express.js
- **Deployment Model**: Serverless (AWS Lambda or Vercel Serverless Functions)
- **Runtime**: Node.js 18+
- **API Gateway**: AWS API Gateway or Vercel Edge Network
- **Database**: Supabase (PostgreSQL)
- **ORM**: Drizzle ORM
- **Authentication**: Supabase Auth with JWT validation
- **Caching**: Upstash Redis
- **Queue**: Upstash QStash
- **Workflow Engine**: Upstash Workflow

## Serverless Express Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                         Client Applications                         │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                        API Gateway / Edge Network                   │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                      Serverless Express Adapter                     │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Express Application                         │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │             │    │             │    │                         │  │
│  │ Middleware  │───▶│   Routes    │───▶│     Controllers         │  │
│  │             │    │             │    │                         │  │
│  └─────────────┘    └─────────────┘    └─────────────┬───────────┘  │
│                                                      │              │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │
                                                       ▼
┌────────────────────────────────────────┐    ┌─────────────────────┐
│                                        │    │                     │
│              Services                  │◄───┤      Models         │
│                                        │    │                     │
└───────────┬─────────────┬─────────────┘    └─────────────────────┘
            │             │             │
            │             │             │
            ▼             ▼             ▼
┌───────────────┐ ┌─────────────┐ ┌─────────────┐
│               │ │             │ │             │
│   Supabase    │ │   Upstash   │ │ External AI │
│   Database    │ │Services (Redis,│ │   APIs     │
│               │ │QStash, Workflow│ │             │
└───────────────┘ └─────────────┘ └─────────────┘
```

## Project Structure

```
/
├── apps/
│   ├── web/                      # Frontend application (React + Vite)
│   └── api/                      # Express API
│       ├── src/
│       │   ├── config/           # Configuration files
│       │   ├── controllers/      # Request handlers
│       │   ├── middleware/       # Express middleware
│       │   ├── routes/           # API route definitions
│       │   ├── services/         # Business logic
│       │   ├── utils/            # Utility functions
│       │   ├── serverless.js     # Serverless entry point
│       │   └── app.js            # Express app definition
│       ├── serverless.yml        # Serverless config (if using AWS)
│       └── vercel.json           # Vercel configuration
├── packages/
│   ├── database/                 # Shared database models and queries
│   ├── ai-core/                  # AI models and providers
│   ├── agents/                   # Agent system components
│   └── config/                   # Shared configuration
├── turbo.json                    # Turborepo configuration
└── package.json                  # Root package.json
```

## Express App Configuration

```javascript
// apps/api/src/app.js
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const routes = require('./routes');

const app = express();

// Security and performance middleware
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(requestLogger);

// Routes
app.use('/api', routes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling (must be last)
app.use(errorHandler);

module.exports = app;
```

## Serverless Integration

### For AWS Lambda (using Serverless Framework)

```javascript
// apps/api/src/serverless.js
const serverless = require('serverless-http');
const app = require('./app');

module.exports.handler = serverless(app);
```

```yaml
# apps/api/serverless.yml
service: ai-chatbot-api

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  memorySize: 1024
  timeout: 30
  environment:
    NODE_ENV: ${opt:stage, 'dev'}
    SUPABASE_URL: ${env:SUPABASE_URL}
    SUPABASE_SERVICE_ROLE_KEY: ${env:SUPABASE_SERVICE_ROLE_KEY}
    UPSTASH_REDIS_URL: ${env:UPSTASH_REDIS_URL}
    UPSTASH_REDIS_TOKEN: ${env:UPSTASH_REDIS_TOKEN}

functions:
  api:
    handler: src/serverless.handler
    events:
      - http:
          path: /{proxy+}
          method: any
          cors: true
```

### For Vercel Serverless Functions

```javascript
// apps/api/api/index.js
const app = require('../src/app');

module.exports = app;
```

```json
// apps/api/vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

## Middleware Implementation

### Authentication Middleware

```javascript
// apps/api/src/middleware/auth.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// Optional middleware for routes that can be accessed with or without auth
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser(token);
    if (user) {
      req.user = user;
    }
  } catch (error) {
    // Continue even if token validation fails
    console.warn('Optional auth token validation failed:', error);
  }

  next();
}

module.exports = { authenticate, optionalAuth };
```

### Rate Limiting Middleware

```javascript
// apps/api/src/middleware/rateLimit.js
const { Ratelimit } = require('@upstash/ratelimit');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

// Different limiters for different endpoints
const createRateLimiter = (requests, duration, prefix) => {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, duration),
    analytics: true,
    prefix: `ratelimit:${prefix}`
  });
};

// Chat API rate limiter (20 requests per minute)
const chatLimiter = createRateLimiter(20, '1m', 'chat');

// Agent API rate limiter (5 requests per minute)
const agentLimiter = createRateLimiter(5, '1m', 'agent');

// General API rate limiter (100 requests per minute)
const generalLimiter = createRateLimiter(100, '1m', 'general');

// Middleware factory to apply appropriate rate limiter
const rateLimit = (limiterType = 'general') => {
  const limiter =
    {
      chat: chatLimiter,
      agent: agentLimiter,
      general: generalLimiter
    }[limiterType] || generalLimiter;

  return async (req, res, next) => {
    // Use IP as identifier if user is not authenticated
    const identifier = req.user?.id || req.ip;

    const { success, limit, reset, remaining } = await limiter.limit(identifier);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', reset);

    if (!success) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded',
        reset: new Date(reset).toISOString()
      });
    }

    next();
  };
};

module.exports = { rateLimit };
```

## API Routes Structure

```javascript
// apps/api/src/routes/index.js
const express = require('express');
const chatRoutes = require('./chat');
const agentRoutes = require('./agents');
const artifactRoutes = require('./artifacts');
const userRoutes = require('./users');
const stripeRoutes = require('./stripe');

const router = express.Router();

router.use('/chat', chatRoutes);
router.use('/agents', agentRoutes);
router.use('/artifacts', artifactRoutes);
router.use('/users', userRoutes);
router.use('/stripe', stripeRoutes);

module.exports = router;
```

### Example Chat API Routes

```javascript
// apps/api/src/routes/chat.js
const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const chatController = require('../controllers/chat');

const router = express.Router();

// Create a new conversation
router.post('/conversations', authenticate, rateLimit('chat'), chatController.createConversation);

// Get user's conversations
router.get('/conversations', authenticate, chatController.getConversations);

// Get conversation by ID
router.get('/conversations/:id', authenticate, chatController.getConversation);

// Delete conversation
router.delete('/conversations/:id', authenticate, chatController.deleteConversation);

// Send message to conversation (streaming)
router.post(
  '/conversations/:id/messages',
  authenticate,
  rateLimit('chat'),
  chatController.sendMessage
);

// Get conversation history
router.get('/conversations/:id/messages', authenticate, chatController.getMessages);

module.exports = router;
```

## Controller Implementation

```javascript
// apps/api/src/controllers/chat.js
const { db } = require('@/packages/database');
const { conversations, messages } = require('@/packages/database/schema');
const { eq } = require('drizzle-orm');
const { Redis } = require('@upstash/redis');
const { OpenAI } = require('openai');
const { ChatProcessor } = require('@/packages/ai-core');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const chatProcessor = new ChatProcessor({ openai });

// Create a new conversation
async function createConversation(req, res) {
  try {
    const { title, systemPrompt } = req.body;
    const userId = req.user.id;

    const newConversation = await db
      .insert(conversations)
      .values({
        userId,
        title: title || 'New Conversation',
        systemPrompt,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    return res.status(201).json(newConversation[0]);
  } catch (error) {
    console.error('Error creating conversation:', error);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
}

// Get user's conversations
async function getConversations(req, res) {
  try {
    const userId = req.user.id;

    // Attempt to get from cache first
    const cacheKey = `user:${userId}:conversations`;
    const cachedConversations = await redis.get(cacheKey);

    if (cachedConversations) {
      return res.json(JSON.parse(cachedConversations));
    }

    // Fetch from database if not in cache
    const userConversations = await db.query.conversations.findMany({
      where: eq(conversations.userId, userId),
      orderBy: (conversations, { desc }) => [desc(conversations.updatedAt)]
    });

    // Store in cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(userConversations), { ex: 300 });

    return res.json(userConversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}

// Send message to conversation with streaming response
async function sendMessage(req, res) {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user.id;
    const { content, attachments } = req.body;

    // Verify conversation belongs to user
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId)
    });

    if (!conversation || conversation.userId !== userId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Insert user message
    const userMessage = await db
      .insert(messages)
      .values({
        conversationId,
        role: 'user',
        content,
        attachments: attachments || null,
        createdAt: new Date()
      })
      .returning();

    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Process conversation and stream response
    const messageHistory = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: (messages, { asc }) => [asc(messages.createdAt)]
    });

    // Create formatted messages for AI
    const formattedMessages = messageHistory.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));

    if (conversation.systemPrompt) {
      formattedMessages.unshift({
        role: 'system',
        content: conversation.systemPrompt
      });
    }

    // Create placeholder for assistant message
    const assistantMessage = await db
      .insert(messages)
      .values({
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: new Date()
      })
      .returning();

    const assistantMessageId = assistantMessage[0].id;
    let fullResponse = '';

    // Stream response from AI
    try {
      const stream = await chatProcessor.streamResponse(formattedMessages);

      stream.on('data', (chunk) => {
        fullResponse += chunk.toString();
        res.write(`data: ${JSON.stringify({ text: chunk.toString() })}\n\n`);
      });

      stream.on('end', async () => {
        // Update the assistant message with the complete response
        await db
          .update(messages)
          .set({ content: fullResponse })
          .where(eq(messages.id, assistantMessageId));

        res.write(`data: [DONE]\n\n`);
        res.end();
      });

      stream.on('error', (error) => {
        console.error('Stream error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Stream processing failed' })}\n\n`);
        res.end();
      });
    } catch (error) {
      // Update message with error info
      await db
        .update(messages)
        .set({ content: 'Sorry, an error occurred while processing your request.' })
        .where(eq(messages.id, assistantMessageId));

      res.write(`data: ${JSON.stringify({ error: 'Failed to process chat' })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}

// More controller functions...
// getConversation, deleteConversation, getMessages

module.exports = {
  createConversation,
  getConversations,
  getConversation: (req, res) => {}, // Implementation omitted for brevity
  deleteConversation: (req, res) => {}, // Implementation omitted for brevity
  sendMessage,
  getMessages: (req, res) => {} // Implementation omitted for brevity
};
```

## Long-Running Tasks with Upstash QStash

For operations that may exceed serverless function time limits:

```javascript
// apps/api/src/services/qstash.js
const { Client } = require('@upstash/qstash');

const qstash = new Client({
  token: process.env.UPSTASH_QSTASH_TOKEN
});

async function scheduleAgentTask(agentId, task, payload) {
  try {
    // Endpoint that will process this task, must be publicly accessible
    const endpoint = `${process.env.API_BASE_URL}/api/webhooks/agent-tasks`;

    // Schedule task with QStash
    const response = await qstash.publishJSON({
      url: endpoint,
      body: {
        agentId,
        task,
        payload,
        timestamp: new Date().toISOString()
      },
      // Optional delay in seconds
      delay: 0,
      // Optional retry configuration
      retries: 3,
      // Optional callback URL for task completion notification
      callback: `${process.env.API_BASE_URL}/api/webhooks/task-completed`
    });

    return {
      success: true,
      messageId: response.messageId
    };
  } catch (error) {
    console.error('Failed to schedule agent task:', error);
    throw new Error('Task scheduling failed');
  }
}

module.exports = {
  scheduleAgentTask
};
```

## Webhook Handler for QStash Tasks

```javascript
// apps/api/src/controllers/webhooks.js
const { verifySignature } = require('@upstash/qstash/dist/verify');
const { AgentExecutor } = require('@/packages/agents');

async function handleAgentTask(req, res) {
  // Verify the request is from QStash
  const signature = req.headers['upstash-signature'];

  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }

  try {
    // Verify the signature
    const isValid = await verifySignature({
      signature,
      body: JSON.stringify(req.body),
      currentTime: Date.now(),
      secret: process.env.UPSTASH_QSTASH_CURRENT_SIGNING_KEY
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the task
    const { agentId, task, payload } = req.body;

    // Immediately acknowledge receipt to QStash
    res.status(200).json({ received: true });

    // Process task asynchronously
    const agentExecutor = new AgentExecutor(agentId);
    const result = await agentExecutor.executeTask(task, payload);

    // Store result in database or notify through appropriate channels
    // This happens after response is sent, so process can take longer than the serverless function timeout
  } catch (error) {
    console.error('Error processing agent task:', error);
    // If we haven't sent a response yet
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to process task' });
    }
  }
}

module.exports = {
  handleAgentTask
};
```

## Upstash Workflow Integration

For complex agent workflows that span multiple steps:

```javascript
// apps/api/src/services/workflow.js
const { Workflow } = require('@upstash/workflow');

// Create a reusable agent workflow template
async function createAgentWorkflow(agentId, goal) {
  const workflow = new Workflow({
    id: `agent-workflow-${agentId}-${Date.now()}`,
    remote: true
  });

  // Define workflow steps
  workflow
    .step('initialize', async (ctx) => {
      // Initialize the agent and set up the task
      return { status: 'initialized', agentId, goal };
    })
    .step('research', async (ctx, prevStepResult) => {
      // Perform research based on the goal
      // This would call your agent's research capabilities
      return { status: 'research_complete', findings: 'Sample research results' };
    })
    .step('analyze', async (ctx, prevStepResult) => {
      // Analyze the research findings
      return {
        status: 'analysis_complete',
        analysis: 'Sample analysis based on ' + prevStepResult.findings
      };
    })
    .step('execute', async (ctx, prevStepResult) => {
      // Execute actions based on the analysis
      return {
        status: 'execution_complete',
        result: 'Executed actions based on ' + prevStepResult.analysis
      };
    })
    .step('summarize', async (ctx, prevStepResult) => {
      // Create a summary of the entire process
      return {
        status: 'complete',
        summary: 'Completed workflow for goal: ' + goal,
        result: prevStepResult.result
      };
    });

  // Save the workflow definition
  await workflow.save();

  return workflow.id;
}

// Execute a workflow with initial data
async function executeWorkflow(workflowId, initialData) {
  try {
    const result = await Workflow.executeRemote({
      workflowId,
      initialData,
      skipIntermediate: false // Set to true if you don't need intermediate results
    });

    return result;
  } catch (error) {
    console.error('Workflow execution failed:', error);
    throw new Error('Failed to execute workflow');
  }
}

module.exports = {
  createAgentWorkflow,
  executeWorkflow
};
```

## Performance Optimization Techniques

1. **Response Compression**

   The application uses the `compression` middleware to reduce payload sizes.

2. **Caching Strategies**

   - Cache expensive database queries using Redis
   - Cache AI model responses for common queries
   - Implement ETags for HTTP caching

3. **Connection Pooling**

   Optimize database connections with Drizzle's connection pooling.

4. **Cold Start Mitigation**

   - Keep functions warm with scheduled pings
   - Minimize dependencies in each function
   - Use bundling to reduce package size

5. **Function Splitting**

   Separate long-running processes into smaller functions connected by QStash.

## Deployment Considerations

### Function Memory and Timeout Settings

Different API routes have different resource requirements:

```json
// apps/api/vercel.json
{
  "functions": {
    "api/index.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

### Environment Variables Management

```javascript
// apps/api/src/config/env.js
const { z } = require('zod');

// Define schema for environment variables
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Upstash
  UPSTASH_REDIS_URL: z.string().url(),
  UPSTASH_REDIS_TOKEN: z.string().min(1),
  UPSTASH_QSTASH_TOKEN: z.string().min(1),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),

  // API
  API_BASE_URL: z.string().url()
});

// Parse and validate environment variables
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('Invalid environment variables:', error.errors);
    throw new Error('Invalid environment configuration');
  }
}

module.exports = { env: validateEnv() };
```

## Monitoring and Logging

```javascript
// apps/api/src/middleware/requestLogger.js
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()]
});

// Request logging middleware
function requestLogger(req, res, next) {
  const start = Date.now();

  // Log request
  logger.info({
    type: 'request',
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.info({
      type: 'response',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
}

module.exports = { requestLogger, logger };
```

## Conclusion

This Express API architecture provides a robust foundation for the AI Chatbot backend, specifically designed for serverless deployment. The architecture offers the familiarity and flexibility of Express while leveraging the scalability and cost benefits of serverless infrastructure.

Key advantages of this architecture include:

1. **Familiar Development Model**: Uses standard Express.js patterns and middleware
2. **Efficient Resource Usage**: Only pay for actual usage with serverless
3. **Horizontal Scaling**: Automatic scaling based on traffic
4. **Simplified Deployment**: Streamlined deployment to serverless platforms
5. **Microservices Friendly**: Natural fit for decomposing into smaller functions
6. **Integration Flexibility**: Easy integration with other cloud services

The combination of Express with serverless deployment creates an optimal balance between developer productivity and operational efficiency for the AI Chatbot application.
