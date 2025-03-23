# Third-Party API Access

## Overview

This document outlines how third-party clients can integrate with the VernisAI API. The API is built using tRPC with OpenAPI support, providing both type-safe TypeScript access and standard REST endpoints for any programming language.

## API Architecture

The VernisAI API follows a modern, secure architecture:

```
┌────────────────────┐
│                    │
│  Third-Party App   │
│                    │
└──────────┬─────────┘
           │
           │ HTTPS
           ▼
┌──────────────────────┐
│                      │
│    API Gateway       │
│    Rate Limiting     │
│    Authentication    │
│                      │
└──────────┬───────────┘
           │
           │
           ▼
┌──────────────────────┐
│                      │
│    tRPC API          │
│    (OpenAPI)         │
│                      │
└──────────────────────┘
```

## Authentication

### API Keys

Third-party applications authenticate using API keys that are scoped to an organization:

1. **API Key Generation**: Organization owners can generate API keys in the Settings → API Access section
2. **Key Scopes**: Keys can be scoped to specific operations (read-only, chat-only, full-access)
3. **Key Rotation**: Regular key rotation is recommended and facilitated through the dashboard

API keys must be included in the `Authorization` header with every request:

```
Authorization: Bearer {api_key}
```

### OAuth 2.0 (Advanced Integration)

For applications that act on behalf of users, OAuth 2.0 authentication is supported:

1. **Register Application**: Create a new OAuth application in the organization settings
2. **Authorization Flow**: Implement the standard OAuth 2.0 authorization code flow
3. **Token Usage**: Use the access token in the `Authorization` header

## OpenAPI Specification

The API provides an OpenAPI specification accessible at `/api/openapi.json`. This specification can be used to automatically generate client libraries in any programming language.

```typescript
// Server-side generation of OpenAPI spec
import { generateOpenApiDocument } from 'trpc-openapi';
import { appRouter } from './router';

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'VernisAI API',
  description: 'API for the VernisAI application',
  version: '1.0.0',
  baseUrl: 'https://app.vernis.ai/api',
  docsUrl: 'https://docs.vernis.ai',
  tags: ['chat', 'agents', 'organizations', 'users']
});
```

## Rate Limiting

API requests are subject to rate limiting based on the organization's subscription tier:

| Plan       | Rate Limit    | Burst Limit |
| ---------- | ------------- | ----------- |
| Free       | 60 req/hour   | 10 req/min  |
| Pro        | 1000 req/hour | 60 req/min  |
| Team       | 5000 req/hour | 300 req/min |
| Enterprise | Custom        | Custom      |

Rate limit headers are included in all API responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 985
X-RateLimit-Reset: 2023-11-15T12:00:00Z
```

When rate limits are exceeded, the API returns a `429 Too Many Requests` status code.

## Endpoints

The API is organized into logical groups:

### Conversations

| Endpoint                                 | Description              | Method | Rate Limit |
| ---------------------------------------- | ------------------------ | ------ | ---------- |
| `/api/conversations`                     | List conversations       | GET    | Standard   |
| `/api/conversations/:id`                 | Get conversation details | GET    | Standard   |
| `/api/conversations`                     | Create conversation      | POST   | Standard   |
| `/api/conversations/:id/messages`        | List messages            | GET    | Standard   |
| `/api/conversations/:id/messages`        | Send message             | POST   | Enhanced   |
| `/api/conversations/:id/messages/stream` | Stream conversation      | SSE    | Enhanced   |

### Agents

| Endpoint                     | Description            | Method | Rate Limit |
| ---------------------------- | ---------------------- | ------ | ---------- |
| `/api/agents`                | List available agents  | GET    | Standard   |
| `/api/agents/:id`            | Get agent details      | GET    | Standard   |
| `/api/agents`                | Create agent           | POST   | Enhanced   |
| `/api/agents/:id/run`        | Run agent              | POST   | Enhanced   |
| `/api/agents/:id/run/stream` | Stream agent execution | SSE    | Enhanced   |

### Organizations

| Endpoint                       | Description              | Method | Rate Limit |
| ------------------------------ | ------------------------ | ------ | ---------- |
| `/api/organizations`           | List organizations       | GET    | Low        |
| `/api/organizations/:id`       | Get organization details | GET    | Low        |
| `/api/organizations/:id/users` | List organization users  | GET    | Low        |

### Users

| Endpoint         | Description      | Method | Rate Limit |
| ---------------- | ---------------- | ------ | ---------- |
| `/api/users/me`  | Get current user | GET    | Low        |
| `/api/users/:id` | Get user details | GET    | Low        |

## Request Examples

### Create a Conversation

```http
POST /api/conversations HTTP/1.1
Host: app.vernis.ai
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "title": "New Conversation",
  "systemPrompt": "You are a helpful assistant.",
  "organizationId": "org_123456789"
}
```

### Send a Message

```http
POST /api/conversations/conv_123456789/messages HTTP/1.1
Host: app.vernis.ai
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "content": "What is the capital of France?",
  "role": "user"
}
```

### Run an Agent

```http
POST /api/agents/agent_123456789/run HTTP/1.1
Host: app.vernis.ai
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "input": "Find information about climate change and summarize it",
  "conversationId": "conv_123456789"
}
```

## Streaming Responses

The API supports Server-Sent Events (SSE) for streaming responses from AI models and agents:

```javascript
// Browser example
const eventSource = new EventSource(
  'https://app.vernis.ai/api/conversations/conv_123/messages/stream',
  {
    headers: {
      Authorization: 'Bearer ' + apiKey
    }
  }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.content);
};

eventSource.onerror = (error) => {
  console.error('EventSource error:', error);
  eventSource.close();
};
```

## Webhook Integration

Third-party applications can subscribe to webhook events:

### Available Events

- `conversation.created`
- `conversation.updated`
- `message.created`
- `agent.run.started`
- `agent.run.completed`
- `agent.run.failed`

### Webhook Configuration

```http
POST /api/webhooks HTTP/1.1
Host: app.vernis.ai
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "url": "https://example.com/webhook",
  "events": ["conversation.created", "message.created"],
  "secret": "whsec_your_webhook_secret"
}
```

### Webhook Payload

```json
{
  "id": "evt_123456789",
  "type": "message.created",
  "created": "2023-11-15T10:30:00Z",
  "data": {
    "id": "msg_123456789",
    "conversationId": "conv_123456789",
    "role": "assistant",
    "content": "Paris is the capital of France.",
    "createdAt": "2023-11-15T10:30:00Z"
  }
}
```

### Webhook Security

Webhooks are signed with HMAC to verify authenticity:

```
X-Signature-256: sha256=computeHmac(payload, webhookSecret)
```

## Error Handling

The API uses standard HTTP status codes and structured error responses:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "You have exceeded your rate limit",
    "status": 429,
    "details": {
      "reset": "2023-11-15T10:35:00Z",
      "limit": 60,
      "remaining": 0
    }
  }
}
```

Common error codes:

- `authentication_failed`: Invalid API key or token
- `permission_denied`: Insufficient permissions
- `resource_not_found`: Requested resource does not exist
- `rate_limit_exceeded`: Request rate limit exceeded
- `validation_error`: Invalid request parameters
- `server_error`: Internal server error

## Versioning

The API follows semantic versioning through URL path versioning:

```
https://app.vernis.ai/api/v1/conversations
```

Major versions introduce breaking changes. The current stable version is v1.

## Best Practices

### Efficient Resource Usage

1. **Limit Request Size**: Keep request payloads small and efficient
2. **Use Pagination**: When fetching lists, use pagination parameters
3. **Conditional Requests**: Use `If-Modified-Since` headers for cacheable resources

### Security

1. **Store API Keys Securely**: Never expose API keys in client-side code
2. **Implement Key Rotation**: Rotate API keys regularly
3. **Use Minimal Scopes**: Request only the permissions your application needs

### Rate Limit Handling

1. **Exponential Backoff**: Implement exponential backoff when rate limited
2. **Rate Limit Headers**: Monitor rate limit headers to avoid exceeding limits
3. **Distribute Requests**: Evenly distribute requests to avoid bursts

## TypeScript SDK

For TypeScript applications, a dedicated SDK provides type-safe API access:

```typescript
// Installation: npm install @vernisai/sdk

import { createClient } from '@vernisai/sdk';

const client = createClient({
  apiKey: 'your_api_key',
  baseUrl: 'https://app.vernis.ai/api'
});

// Type-safe API access
async function sendMessage() {
  const result = await client.conversations.messages.create({
    conversationId: 'conv_123456789',
    content: 'Hello, AI!',
    role: 'user'
  });

  console.log(result.content);
}
```

## Local Development

For local development and testing:

1. **API Key Generation**: Generate development API keys in the dashboard
2. **Local Webhook Testing**: Use tools like ngrok to receive webhooks locally
3. **API Sandbox**: Test against the sandbox environment at `https://sandbox.vernis.ai`

## Support and Documentation

- **API Reference**: Full API reference at https://docs.vernis.ai/api
- **SDK Documentation**: SDK-specific documentation at https://docs.vernis.ai/sdk
- **Support**: Developer support at developers@vernis.ai
- **Status Page**: Service status at https://status.vernis.ai

## Conclusion

The VernisAI API provides a robust, secure, and developer-friendly way to integrate AI capabilities into third-party applications. By supporting both tRPC for TypeScript applications and OpenAPI/REST for any language, the API caters to a wide range of integration scenarios while maintaining high security and performance standards.
