# Serverless Deployment Architecture for Express.js

## Overview

This document outlines the serverless deployment architecture for the Express.js API powering the AI Chatbot application. The architecture leverages serverless functions to achieve scalability, cost-efficiency, and simplified operations.

## Deployment Technology Stack

- **Serverless Platform**: Vercel or AWS Lambda
- **API Gateway**: Vercel Edge Network or AWS API Gateway
- **Express Adapter**: Serverless-http (for AWS) or built-in Vercel adapter
- **Environment Variables**: Vercel/AWS Parameter Store with encryption
- **CI/CD Pipeline**: GitHub Actions
- **Monitoring**: Datadog or New Relic
- **Logging**: Serverless platform native + custom solution

## Architecture Overview

```
┌─────────────────────┐
│                     │
│    Client Apps      │
│                     │
└──────────┬──────────┘
           │
           │ HTTPS
           ▼
┌─────────────────────┐
│                     │
│   Edge Network /    │
│   API Gateway       │
│                     │
└──────────┬──────────┘
           │
           │
           ▼
┌─────────────────────┐
│                     │
│   Serverless        │
│   Express App       │
│                     │
└──────────┬──────────┘
           │
           │
           ▼
┌─────────────────────────────────────────┐
│                                         │
│   External Services                     │
│                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │         │ │         │ │         │   │
│  │ Supabase│ │ Upstash │ │  OpenAI │   │
│  │         │ │         │ │         │   │
│  └─────────┘ └─────────┘ └─────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

## Serverless Configuration

### Vercel Deployment

#### Project Configuration

Create a `vercel.json` file in the project root:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/api/src/server.js",
      "use": "@vercel/node",
      "config": {
        "includeFiles": ["packages/**", "apps/api/**"]
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "apps/api/src/server.js"
    }
  ],
  "functions": {
    "apps/api/src/server.js": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

#### Express Server Setup

```javascript
// apps/api/src/server.js
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const agentRoutes = require('./routes/agent');

// Create Express app
const app = express();

// Apply middlewares
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

// Apply routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/agent', agentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// For Vercel, export the app directly
module.exports = app;
```

### AWS Lambda Deployment

#### Serverless Framework Configuration

Create a `serverless.yml` file:

```yaml
service: ai-chatbot-api

provider:
  name: aws
  runtime: nodejs18.x
  stage: ${opt:stage, 'dev'}
  region: ${opt:region, 'us-east-1'}
  memorySize: 1024
  timeout: 29 # Lambda max is 29 seconds for API Gateway
  environment:
    NODE_ENV: ${opt:stage, 'dev'}
    SUPABASE_URL: ${ssm:/ai-chatbot/${opt:stage}/SUPABASE_URL}
    SUPABASE_KEY: ${ssm:/ai-chatbot/${opt:stage}/SUPABASE_KEY~true}
    OPENAI_API_KEY: ${ssm:/ai-chatbot/${opt:stage}/OPENAI_API_KEY~true}
    UPSTASH_REDIS_URL: ${ssm:/ai-chatbot/${opt:stage}/UPSTASH_REDIS_URL}
    UPSTASH_REDIS_TOKEN: ${ssm:/ai-chatbot/${opt:stage}/UPSTASH_REDIS_TOKEN~true}
  iamRoleStatements:
    - Effect: Allow
      Action:
        - ssm:GetParameter
        - ssm:GetParameters
      Resource: 'arn:aws:ssm:${self:provider.region}:*:parameter/ai-chatbot/${opt:stage}/*'

functions:
  api:
    handler: apps/api/lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: any
          cors: true

plugins:
  - serverless-offline
  - serverless-dotenv-plugin

package:
  patterns:
    - '!node_modules/.cache/**'
    - '!.git/**'
    - '!.github/**'
    - '!test/**'
    - 'packages/**'
    - 'apps/api/**'
```

#### Lambda Handler

```javascript
// apps/api/lambda.js
const serverless = require('serverless-http');
const app = require('./src/server');

// Create handler
const handler = serverless(app);

// Lambda handler
module.exports.handler = async (event, context) => {
  // Keep the connection alive for database connections
  context.callbackWaitsForEmptyEventLoop = false;
  return await handler(event, context);
};
```

## Deployment Strategies

### CI/CD Pipeline with GitHub Actions

#### Vercel Deployment Workflow

```yaml
# .github/workflows/deploy-vercel.yml
name: Deploy to Vercel

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./
```

#### AWS Deployment Workflow

```yaml
# .github/workflows/deploy-aws.yml
name: Deploy to AWS Lambda

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Serverless Deploy
        uses: serverless/github-action@v3
        with:
          args: deploy --stage prod
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Environment Management

### Environment Variables Structure

Organize environment variables by environment:

```
dev/
  SUPABASE_URL=https://dev-instance.supabase.co
  SUPABASE_KEY=dev-key
  OPENAI_API_KEY=dev-key
  UPSTASH_REDIS_URL=https://dev-redis.upstash.io
  UPSTASH_REDIS_TOKEN=dev-token

staging/
  SUPABASE_URL=https://staging-instance.supabase.co
  SUPABASE_KEY=staging-key
  OPENAI_API_KEY=staging-key
  UPSTASH_REDIS_URL=https://staging-redis.upstash.io
  UPSTASH_REDIS_TOKEN=staging-token

prod/
  SUPABASE_URL=https://prod-instance.supabase.co
  SUPABASE_KEY=prod-key
  OPENAI_API_KEY=prod-key
  UPSTASH_REDIS_URL=https://prod-redis.upstash.io
  UPSTASH_REDIS_TOKEN=prod-token
```

## Monitoring and Logging

### Custom Logging Middleware

```javascript
// apps/api/src/middleware/logging.js
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ai-chatbot-api' },
  transports: [new winston.transports.Console()]
});

// Logging middleware
function loggingMiddleware(req, res, next) {
  // Generate request ID
  const requestId = uuidv4();
  req.requestId = requestId;

  // Log request
  const startTime = Date.now();

  // Capture original end method to intercept response
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    // Calculate duration
    const duration = Date.now() - startTime;

    // Log details
    logger.info({
      type: 'request',
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      userId: req.user?.id || 'anonymous'
    });

    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };

  // Continue
  next();
}

// Error logging middleware
function errorLoggingMiddleware(err, req, res, next) {
  logger.error({
    type: 'error',
    requestId: req.requestId,
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl || req.url,
    userId: req.user?.id || 'anonymous'
  });

  next(err);
}

module.exports = {
  logger,
  loggingMiddleware,
  errorLoggingMiddleware
};
```

### Health Monitoring Endpoint

```javascript
// apps/api/src/routes/health.js
const express = require('express');
const { getClient } = require('@/packages/database');
const { Redis } = require('@upstash/redis');

const router = express.Router();

// Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

// Basic health check
router.get('/health', async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Detailed health check
router.get('/health/details', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'unknown' },
      redis: { status: 'unknown' }
    }
  };

  try {
    // Check database
    const db = getClient();
    await db.execute('SELECT 1');
    health.services.database = { status: 'ok' };
  } catch (error) {
    health.services.database = {
      status: 'error',
      message: error.message
    };
  }

  try {
    // Check Redis
    await redis.ping();
    health.services.redis = { status: 'ok' };
  } catch (error) {
    health.services.redis = {
      status: 'error',
      message: error.message
    };
  }

  // Determine overall status
  const hasErrors = Object.values(health.services).some((service) => service.status !== 'ok');

  health.status = hasErrors ? 'degraded' : 'ok';

  // Send response with appropriate status code
  res.status(hasErrors ? 503 : 200).json(health);
});

module.exports = router;
```

## Scaling and Performance Optimization

### Function Configuration

Optimize function configuration for different endpoints:

```javascript
// vercel.json
{
  "functions": {
    "apps/api/src/server.js": {
      "memory": 1024,
      "maxDuration": 60
    },
    "apps/api/api/chat/stream.js": {
      "memory": 2048,
      "maxDuration": 60
    },
    "apps/api/api/agent/run.js": {
      "memory": 3072,
      "maxDuration": 300
    }
  }
}
```

### Cold Start Optimization

#### Function Initialization

```javascript
// apps/api/src/server.js
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

// Global/shared connections and resources
let app;
let dbClient;
let redisClient;

// Initialize app only once
function getApp() {
  if (!app) {
    console.log('Initializing Express app');
    app = express();

    // Apply middlewares
    app.use(helmet());
    app.use(compression());
    // ... other middleware

    // Initialize database connection
    dbClient = require('@/packages/database').getClient();

    // Initialize Redis connection
    redisClient = new (require('@upstash/redis').Redis)({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });

    // Apply routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/chat', require('./routes/chat'));
    app.use('/api/agent', require('./routes/agent'));

    // Error handler
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({ error: 'Something went wrong!' });
    });
  }

  return app;
}

// For Vercel, export the app directly
module.exports = getApp();
```

## Function Splitting Strategy

Implement function splitting for different API endpoints:

### Separate Lambda Functions

```
/api
  /auth
    /login.js
    /register.js
  /chat
    /create.js
    /messages.js
    /stream.js
  /agent
    /list.js
    /create.js
    /run.js
```

Each function has a dedicated API endpoint:

```javascript
// api/chat/stream.js
const serverless = require('serverless-http');
const express = require('express');
const { authenticate } = require('../../src/middleware/auth');
const { rateLimit } = require('../../src/middleware/rateLimit');
const { handleChatStream } = require('../../src/controllers/chat');

// Create mini-app for this endpoint
const app = express();

// Apply relevant middleware
app.use(express.json());
app.use(authenticate);
app.use(rateLimit('chat'));

// Define route
app.post('/api/chat/conversations/:conversationId/stream', handleChatStream);

// Export handler
module.exports = serverless(app);
```

## Multi-Region Deployment

### AWS Multi-Region Setup

```yaml
# serverless.yml
custom:
  regions:
    - us-east-1
    - eu-west-1
    - ap-southeast-1

provider:
  name: aws
  runtime: nodejs18.x
  stage: ${opt:stage, 'dev'}
  region: ${opt:region, 'us-east-1'}
  # ... other settings

resources:
  Conditions:
    IsPrimaryRegion: !Equals [!Ref AWS::Region, us-east-1]
```

## Conclusion

This serverless deployment architecture for Express.js provides a scalable and cost-effective solution for the AI Chatbot application. Key benefits include:

1. **Automatic Scaling**: Scales to handle varying load without manual intervention
2. **Pay-per-Use**: Cost optimized for actual usage
3. **Low Maintenance**: Reduced operational overhead with serverless management
4. **Global Deployment**: Easy multi-region deployment for lower latency
5. **Separation of Concerns**: Function splitting for optimal resource allocation

The architecture is designed to handle the specific needs of AI-powered applications, including streaming responses, long-running agent tasks, and efficient resource utilization.
