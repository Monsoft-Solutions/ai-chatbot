# AI Integration with Express.js

## Overview

This document outlines the integration of AI capabilities into the Express.js API for the AI Chatbot application. The integration focuses on implementing efficient, serverless-compatible AI processing while maintaining robust streaming capabilities and error handling.

## AI Technology Stack

- **AI Provider**: OpenAI API and Anthropic API
- **Streaming Support**: Server-Sent Events (SSE)
- **Caching**: Upstash Redis for response caching
- **Rate Limiting**: Custom AI-specific rate limiting
- **Error Handling**: Graceful fallbacks and retry mechanisms

## AI Integration Architecture

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
│   AI Service Layer    │
│                       │
│  ┌─────────────────┐  │
│  │                 │  │
│  │ Provider        │  │
│  │ Abstraction     │  │
│  │                 │  │
│  └─────────────────┘  │
│                       │
└───────────┬───────────┘
            │
            │
            ▼
┌──────────────────────────────────────┐
│                                      │
│     External AI APIs                 │
│                                      │
│  ┌─────────────┐    ┌─────────────┐  │
│  │             │    │             │  │
│  │  OpenAI     │    │  Anthropic  │  │
│  │             │    │             │  │
│  └─────────────┘    └─────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

## AI Service Implementation

### Provider Abstraction Layer

```javascript
// packages/ai-core/src/providers/index.js
const { OpenAIProvider } = require('./openai');
const { AnthropicProvider } = require('./anthropic');

class AIProviderFactory {
  static getProvider(type = 'openai', options = {}) {
    switch (type.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(options);
      case 'anthropic':
        return new AnthropicProvider(options);
      default:
        throw new Error(`Unsupported AI provider: ${type}`);
    }
  }
}

module.exports = { AIProviderFactory };
```

### OpenAI Provider

```javascript
// packages/ai-core/src/providers/openai.js
const { OpenAI } = require('openai');
const { streamToResponse } = require('../utils/streaming');

class OpenAIProvider {
  constructor(options = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY
    });
    this.defaultModel = options.model || 'gpt-4o';
  }

  async generateCompletion(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature || 0.7;

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: options.maxTokens || 1000,
        top_p: options.topP || 1,
        frequency_penalty: options.frequencyPenalty || 0,
        presence_penalty: options.presencePenalty || 0
      });

      return {
        text: response.choices[0].message.content,
        model: response.model,
        usage: response.usage,
        provider: 'openai'
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async generateCompletionStream(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature || 0.7;

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: options.maxTokens || 1000,
        top_p: options.topP || 1,
        frequency_penalty: options.frequencyPenalty || 0,
        presence_penalty: options.presencePenalty || 0,
        stream: true
      });

      return stream;
    } catch (error) {
      console.error('OpenAI API streaming error:', error);
      throw new Error(`OpenAI API streaming error: ${error.message}`);
    }
  }

  // Method to pipe streaming response directly to Express response
  async streamToResponse(messages, res, options = {}) {
    try {
      const stream = await this.generateCompletionStream(messages, options);
      return streamToResponse(stream, res, 'openai');
    } catch (error) {
      console.error('Failed to stream OpenAI response:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}

module.exports = { OpenAIProvider };
```

### Anthropic Provider

```javascript
// packages/ai-core/src/providers/anthropic.js
const Anthropic = require('@anthropic-ai/sdk');
const { streamToResponse } = require('../utils/streaming');

class AnthropicProvider {
  constructor(options = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.defaultModel = options.model || 'claude-3-opus-20240229';
  }

  // Convert standard chat format to Anthropic format
  _formatMessages(messages) {
    return messages.map((msg) => {
      if (msg.role === 'user') {
        return { role: 'user', content: msg.content };
      } else if (msg.role === 'assistant') {
        return { role: 'assistant', content: msg.content };
      } else if (msg.role === 'system') {
        return { role: 'system', content: msg.content };
      }
      return msg; // Pass through any other formats
    });
  }

  async generateCompletion(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const formattedMessages = this._formatMessages(messages);

    try {
      const response = await this.client.messages.create({
        model,
        messages: formattedMessages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1
      });

      return {
        text: response.content[0].text,
        model: response.model,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens
        },
        provider: 'anthropic'
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  async generateCompletionStream(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const formattedMessages = this._formatMessages(messages);

    try {
      const stream = await this.client.messages.create({
        model,
        messages: formattedMessages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1,
        stream: true
      });

      return stream;
    } catch (error) {
      console.error('Anthropic API streaming error:', error);
      throw new Error(`Anthropic API streaming error: ${error.message}`);
    }
  }

  // Method to pipe streaming response directly to Express response
  async streamToResponse(messages, res, options = {}) {
    try {
      const stream = await this.generateCompletionStream(messages, options);
      return streamToResponse(stream, res, 'anthropic');
    } catch (error) {
      console.error('Failed to stream Anthropic response:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}

module.exports = { AnthropicProvider };
```

### Streaming Utility

```javascript
// packages/ai-core/src/utils/streaming.js
const { EventEmitter } = require('events');

// Process streaming responses based on provider
function streamToResponse(stream, res, provider = 'openai') {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Full response for storage after streaming completes
  let fullResponse = '';

  if (provider === 'openai') {
    // Process OpenAI streaming format
    stream.on('chunk', (chunk) => {
      if (chunk.choices?.[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    });

    stream.on('end', () => {
      res.write(`data: [DONE]\n\n`);
      res.end();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
  } else if (provider === 'anthropic') {
    // Process Anthropic streaming format
    stream.on('text', (text) => {
      fullResponse += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('end', () => {
      res.write(`data: [DONE]\n\n`);
      res.end();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
  }

  // Handle client disconnect
  req.on('close', () => {
    if (stream.controller && typeof stream.controller.abort === 'function') {
      stream.controller.abort();
    }
  });

  return { fullResponse };
}

module.exports = { streamToResponse };
```

## Express Integration

### Chat Controller

```javascript
// apps/api/src/controllers/chat.js
const { AIProviderFactory } = require('@/packages/ai-core');
const { Redis } = require('@upstash/redis');
const conversationRepository = require('@/packages/database/repositories/conversationRepository');
const messageRepository = require('@/packages/database/repositories/messageRepository');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

// Handle streaming chat requests
async function handleChatStream(req, res) {
  const { conversationId } = req.params;
  const { message, provider = 'openai', options = {} } = req.body;
  const userId = req.user.id;

  try {
    // Verify user has access to this conversation
    const conversation = await conversationRepository.findByIdAndUser(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Save user message to database
    const userMessage = await messageRepository.create({
      conversationId,
      role: 'user',
      content: message,
      createdAt: new Date()
    });

    // Get message history
    const messageHistory = await messageRepository.getByConversationId(conversationId);
    const formattedMessages = messageHistory.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));

    // Add system prompt if present
    if (conversation.systemPrompt) {
      formattedMessages.unshift({
        role: 'system',
        content: conversation.systemPrompt
      });
    }

    // Create placeholder for assistant message
    const assistantMessage = await messageRepository.create({
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date()
    });

    // Get AI provider
    const aiProvider = AIProviderFactory.getProvider(provider, options);

    // Setup stream handler to capture full response
    const responseHandler = aiProvider.streamToResponse(formattedMessages, res, options);

    // Update the message when streaming is complete
    res.on('finish', async () => {
      try {
        // If we have the full response, update the message in the database
        if (responseHandler && responseHandler.fullResponse) {
          await messageRepository.update(assistantMessage.id, {
            content: responseHandler.fullResponse
          });

          // Update conversation last activity time
          await conversationRepository.update(conversationId, {
            updatedAt: new Date()
          });
        }
      } catch (error) {
        console.error('Error updating message after stream:', error);
      }
    });
  } catch (error) {
    console.error('Error handling chat stream:', error);

    // If headers already sent, we need to write to the stream
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'An error occurred during processing' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to process chat request' });
    }
  }
}

// Handle non-streaming chat requests
async function handleChatCompletion(req, res) {
  const { conversationId } = req.params;
  const { message, provider = 'openai', options = {} } = req.body;
  const userId = req.user.id;

  try {
    // Verify user has access to this conversation
    const conversation = await conversationRepository.findByIdAndUser(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Save user message to database
    await messageRepository.create({
      conversationId,
      role: 'user',
      content: message,
      createdAt: new Date()
    });

    // Get message history
    const messageHistory = await messageRepository.getByConversationId(conversationId);
    const formattedMessages = messageHistory.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));

    // Add system prompt if present
    if (conversation.systemPrompt) {
      formattedMessages.unshift({
        role: 'system',
        content: conversation.systemPrompt
      });
    }

    // Get AI provider
    const aiProvider = AIProviderFactory.getProvider(provider, options);

    // Generate completion
    const completion = await aiProvider.generateCompletion(formattedMessages, options);

    // Save assistant response
    const assistantMessage = await messageRepository.create({
      conversationId,
      role: 'assistant',
      content: completion.text,
      createdAt: new Date()
    });

    // Update conversation last activity time
    await conversationRepository.update(conversationId, {
      updatedAt: new Date()
    });

    // Return response
    return res.json({
      message: assistantMessage,
      model: completion.model,
      provider: completion.provider
    });
  } catch (error) {
    console.error('Error handling chat completion:', error);
    return res.status(500).json({ error: 'Failed to process chat request' });
  }
}

module.exports = {
  handleChatStream,
  handleChatCompletion
};
```

### AI Router

```javascript
// apps/api/src/routes/chat.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { handleChatStream, handleChatCompletion } = require('../controllers/chat');

const router = express.Router();

// Stream chat completion route
router.post(
  '/conversations/:conversationId/stream',
  authenticate,
  rateLimit('chat'),
  handleChatStream
);

// Standard chat completion route
router.post(
  '/conversations/:conversationId/completion',
  authenticate,
  rateLimit('chat'),
  handleChatCompletion
);

module.exports = router;
```

## AI Caching Strategy

Implement caching for AI responses to reduce costs and improve performance:

```javascript
// packages/ai-core/src/utils/cache.js
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

// Generate cache key from messages and options
function generateCacheKey(messages, options = {}, provider = 'openai') {
  // Create a deterministic string representation
  const data = JSON.stringify({
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content
    })),
    options: {
      model: options.model,
      temperature: options.temperature || 0.7,
      topP: options.topP || 1
    },
    provider
  });

  // Generate hash
  return crypto.createHash('md5').update(data).digest('hex');
}

// Check cache before making API call
async function getCachedCompletion(messages, options = {}, provider = 'openai') {
  // Only cache deterministic responses (low temperature)
  if ((options.temperature || 0.7) > 0.1) {
    return null;
  }

  const cacheKey = generateCacheKey(messages, options, provider);
  return redis.get(cacheKey);
}

// Store completion in cache
async function cacheCompletion(messages, completion, options = {}, provider = 'openai') {
  // Only cache deterministic responses (low temperature)
  if ((options.temperature || 0.7) > 0.1) {
    return;
  }

  const cacheKey = generateCacheKey(messages, options, provider);

  // Cache for 24 hours
  await redis.set(cacheKey, JSON.stringify(completion), { ex: 86400 });
}

module.exports = {
  getCachedCompletion,
  cacheCompletion
};
```

## Enhanced AI Provider with Caching

```javascript
// packages/ai-core/src/providers/enhanced-openai.js
const { OpenAIProvider } = require('./openai');
const { getCachedCompletion, cacheCompletion } = require('../utils/cache');

class EnhancedOpenAIProvider extends OpenAIProvider {
  constructor(options = {}) {
    super(options);
    this.enableCache = options.enableCache !== false;
  }

  async generateCompletion(messages, options = {}) {
    // Check cache if enabled
    if (this.enableCache) {
      const cachedResult = await getCachedCompletion(messages, options, 'openai');
      if (cachedResult) {
        return JSON.parse(cachedResult);
      }
    }

    // Get completion from API
    const completion = await super.generateCompletion(messages, options);

    // Cache result if enabled
    if (this.enableCache) {
      await cacheCompletion(messages, completion, options, 'openai');
    }

    return completion;
  }
}

module.exports = { EnhancedOpenAIProvider };
```

## Rate Limiting for AI Requests

```javascript
// apps/api/src/middleware/aiRateLimiter.js
const { Ratelimit } = require('@upstash/ratelimit');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

// Model-specific rate limits
const MODEL_LIMITS = {
  'gpt-4': { requests: 10, per: '1m' }, // 10 requests per minute for GPT-4
  'gpt-3.5-turbo': { requests: 20, per: '1m' }, // 20 requests per minute for GPT-3.5
  'claude-3-opus': { requests: 10, per: '1m' }, // 10 requests per minute for Claude-3
  default: { requests: 20, per: '1m' } // Default limit
};

// Create rate limiters for different models
const rateLimiters = {};

// Initialize rate limiter for a specific model
function getRateLimiter(model) {
  if (!rateLimiters[model]) {
    const limit = MODEL_LIMITS[model] || MODEL_LIMITS.default;
    rateLimiters[model] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit.requests, limit.per),
      analytics: true,
      prefix: `ratelimit:ai:${model}`
    });
  }

  return rateLimiters[model];
}

// AI-specific rate limiting middleware
function aiRateLimiter(req, res, next) {
  const userId = req.user?.id || req.ip;
  const model = req.body.options?.model || 'default';

  const limiter = getRateLimiter(model);

  // Apply rate limit
  limiter
    .limit(userId)
    .then((result) => {
      const { success, limit, reset, remaining } = result;

      // Set headers
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', reset);

      if (!success) {
        return res.status(429).json({
          error: 'AI request rate limit exceeded',
          model,
          reset: new Date(reset).toISOString()
        });
      }

      next();
    })
    .catch((error) => {
      console.error('Rate limiting error:', error);
      // Proceed on error rather than blocking request
      next();
    });
}

module.exports = { aiRateLimiter };
```

## Error Handling and Fallbacks

```javascript
// packages/ai-core/src/utils/errorHandler.js
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

// Retry mechanism for AI API calls
async function withRetry(fn, retries = MAX_RETRIES, delay = RETRY_DELAY) {
  try {
    return await fn();
  } catch (error) {
    // Check if we should retry
    if (isRetryableError(error) && retries > 0) {
      console.log(`Retrying AI request, ${retries} attempts remaining`);
      await sleep(delay);
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Check if an error is retryable
function isRetryableError(error) {
  // Retry on rate limit or server errors
  return (
    error.status === 429 || // Rate limit
    error.status === 500 || // Server error
    error.status === 503 || // Service unavailable
    error.code === 'ECONNRESET' || // Connection reset
    error.code === 'ETIMEDOUT' || // Timeout
    error.message.includes('timeout') ||
    error.message.includes('rate limit')
  );
}

// Sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Provider fallback mechanism
async function withProviderFallback(primaryFn, fallbackFn) {
  try {
    return await withRetry(primaryFn);
  } catch (primaryError) {
    console.error('Primary AI provider failed, trying fallback:', primaryError);
    try {
      return await withRetry(fallbackFn);
    } catch (fallbackError) {
      console.error('Fallback AI provider also failed:', fallbackError);
      throw new Error('All AI providers failed to process the request');
    }
  }
}

module.exports = {
  withRetry,
  withProviderFallback,
  isRetryableError
};
```

## Monitoring AI Performance

```javascript
// packages/ai-core/src/utils/monitoring.js
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

// Track AI request metrics
async function trackAIMetrics(provider, model, duration, tokens, success) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Increment request count
  await redis.hincrby(`ai:metrics:${date}:count`, `${provider}:${model}`, 1);

  // Track success/failure
  await redis.hincrby(
    `ai:metrics:${date}:${success ? 'success' : 'error'}`,
    `${provider}:${model}`,
    1
  );

  // Track token usage
  if (tokens) {
    await redis.hincrby(`ai:metrics:${date}:tokens`, `${provider}:${model}`, tokens);
  }

  // Track average duration
  const currentDuration = await redis.hget(`ai:metrics:${date}:duration`, `${provider}:${model}`);
  const currentCount = await redis.hget(`ai:metrics:${date}:count`, `${provider}:${model}`);

  if (currentDuration && currentCount) {
    const newAvgDuration =
      (parseFloat(currentDuration) * (parseInt(currentCount) - 1) + duration) /
      parseInt(currentCount);

    await redis.hset(
      `ai:metrics:${date}:duration`,
      `${provider}:${model}`,
      newAvgDuration.toFixed(2)
    );
  } else {
    await redis.hset(`ai:metrics:${date}:duration`, `${provider}:${model}`, duration.toFixed(2));
  }
}

module.exports = { trackAIMetrics };
```

## Conclusion

This AI integration approach for Express.js provides a robust foundation for incorporating AI capabilities into the serverless API. The architecture:

1. **Abstracts AI Providers**: Makes it easy to switch between different AI services
2. **Optimizes Performance**: Implements caching and rate limiting
3. **Handles Streaming**: Provides efficient streaming with Express.js
4. **Ensures Reliability**: Includes retry and fallback mechanisms
5. **Facilitates Monitoring**: Tracks performance and usage metrics

The implementation is specifically designed for serverless environments, ensuring that API requests are processed efficiently while maintaining the advanced features necessary for a robust AI chatbot application.
