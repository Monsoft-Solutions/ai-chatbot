# Code Duplication in Tool Handling

## Overview

The application's tool handling logic in the Message component contains significant code duplication, particularly when rendering different tools based on their names and states. This duplication violates the DRY principle, making maintenance difficult and error-prone. This document outlines a comprehensive refactoring strategy to implement a more extensible and maintainable pattern for tool handling.

## Location in Code

`components/message.tsx` - Lines 109-140 and 142-163

## Current Code Snippet

```typescript
if (state === 'call') {
  const { args } = toolInvocation;

  return (
    <div
      key={toolCallId}
      className={cx({
        skeleton: ['getWeather'].includes(toolName)
      })}
    >
      {toolName === 'getWeather' ? (
        <Weather />
      ) : toolName === 'createDocument' ? (
        <DocumentPreview isReadonly={isReadonly} args={args} />
      ) : toolName === 'updateDocument' ? (
        <DocumentToolCall type="update" args={args} isReadonly={isReadonly} />
      ) : toolName === 'requestSuggestions' ? (
        <DocumentToolCall
          type="request-suggestions"
          args={args}
          isReadonly={isReadonly}
        />
      ) : null}
    </div>
  );
}

// Similar code for state === 'result'
```

## Issue/Reason for Improvement

The current implementation has several critical issues:

1. **Duplicated Conditional Logic**: Nearly identical conditional chains appear for both 'call' and 'result' states
2. **Poor Extensibility**: Adding a new tool requires modifying the component in multiple places
3. **Maintenance Issues**: Changes to tool rendering must be made in multiple locations
4. **Lack of Type Safety**: No type checking ensures that appropriate props are passed to each tool component
5. **No Clear Structure**: The relationship between tools and their renderers is implicit rather than explicitly defined

## Detailed Analysis

### Code Duplication Pattern

The component uses cascading ternary operators to conditionally render different tool components based on the tool name. This pattern is duplicated for both the 'call' and 'result' states, with only slight variations in the props passed to each component.

### Extensibility Issues

Adding a new tool requires:

1. Adding a new condition to each state block
2. Remembering the correct props for each state
3. Ensuring consistency between the two implementations

### Maintainability Challenges

- Fixing a bug in tool rendering may require changes in multiple places
- It's easy to introduce inconsistencies between the 'call' and 'result' rendering
- There's no central place to define tool rendering behavior

## Suggested Enhancement

Implement a registry-based approach with a factory pattern to create a more extensible and maintainable tool handling system:

1. Create a tool registry that maps tool names to their renderer components
2. Implement a factory component that handles the common rendering logic
3. Use a strategy pattern to handle different states within each tool component
4. Ensure type safety through proper interfaces and generics

## Implementation Steps

### 1. Define Tool Handler Interfaces

```typescript
// types/tools.ts
import type { ReactNode } from 'react';

// Base interface for tool invocations
export interface ToolInvocation {
  toolName: string;
  toolCallId: string;
  state: 'call' | 'result';
  args?: any;
  result?: any;
}

// Interface for tool renderers
export interface ToolRenderer<TArgs = any, TResult = any> {
  Call: React.FC<ToolCallProps<TArgs>>;
  Result: React.FC<ToolResultProps<TResult>>;
}

// Props for the call state
export interface ToolCallProps<T = any> {
  args: T;
  isReadonly: boolean;
  toolCallId: string;
}

// Props for the result state
export interface ToolResultProps<T = any> {
  result: T;
  isReadonly: boolean;
  toolCallId: string;
}
```

### 2. Implement Tool Registry

```typescript
// components/messages/tools/registry.ts
import type { ToolRenderer } from '@/types/tools';
import { WeatherToolRenderer } from './weather/WeatherToolRenderer';
import { DocumentToolRenderer } from './document/DocumentToolRenderer';
import { SearchToolRenderer } from './search/SearchToolRenderer';

// Map tool names to their renderer implementations
export const toolRegistry: Record<string, ToolRenderer> = {
  getWeather: WeatherToolRenderer,
  createDocument: DocumentToolRenderer,
  updateDocument: DocumentToolRenderer,
  requestSuggestions: DocumentToolRenderer,
  search_the_web: SearchToolRenderer
};

// Helper to check if a tool is registered
export const isToolRegistered = (toolName: string): boolean => {
  return toolName in toolRegistry;
};

// Helper to get a tool renderer
export const getToolRenderer = (toolName: string): ToolRenderer | null => {
  return isToolRegistered(toolName) ? toolRegistry[toolName] : null;
};
```

### 3. Create Individual Tool Renderers

```typescript
// components/messages/tools/weather/WeatherToolRenderer.tsx
import { Weather } from '@/components/weather';
import type { ToolCallProps, ToolResultProps, ToolRenderer } from '@/types/tools';

// Tool call component
const WeatherToolCall: React.FC<ToolCallProps> = () => {
  return <Weather />;
};

// Tool result component
const WeatherToolResult: React.FC<ToolResultProps<any>> = ({ result }) => {
  return <Weather weatherAtLocation={result} />;
};

// Export the complete renderer
export const WeatherToolRenderer: ToolRenderer = {
  Call: WeatherToolCall,
  Result: WeatherToolResult
};
```

### 4. Implement Tool Factory Component

```typescript
// components/messages/tools/ToolFactory.tsx
import { isToolRegistered, getToolRenderer } from './registry';
import type { ToolInvocation } from '@/types/tools';

interface ToolFactoryProps {
  toolInvocation: ToolInvocation;
  isReadonly: boolean;
}

export const ToolFactory: React.FC<ToolFactoryProps> = ({
  toolInvocation,
  isReadonly
}) => {
  const { toolName, state, toolCallId, args, result } = toolInvocation;

  // Check if tool is registered
  if (!isToolRegistered(toolName)) {
    console.warn(`Tool "${toolName}" is not registered`);
    return null;
  }

  // Get the renderer
  const renderer = getToolRenderer(toolName);
  if (!renderer) return null;

  // Render based on state
  if (state === 'call') {
    return (
      <renderer.Call
        args={args}
        isReadonly={isReadonly}
        toolCallId={toolCallId}
      />
    );
  }

  if (state === 'result') {
    return (
      <renderer.Result
        result={result}
        isReadonly={isReadonly}
        toolCallId={toolCallId}
      />
    );
  }

  return null;
};
```

### 5. Update Message Component

```typescript
// Simplified message.tsx part
if (part.type === 'tool-invocation') {
  const { toolInvocation } = part;
  return (
    <div key={toolInvocation.toolCallId}>
      <ToolFactory
        toolInvocation={toolInvocation}
        isReadonly={isReadonly}
      />
    </div>
  );
}
```

### 6. Add Type-Safe Tool-Specific Components

```typescript
// Example of a type-safe document tool renderer
// components/messages/tools/document/DocumentToolRenderer.tsx
import { DocumentPreview } from '@/components/document-preview';
import { DocumentToolCall, DocumentToolResult } from '@/components/document';
import type { ToolCallProps, ToolResultProps, ToolRenderer } from '@/types/tools';

type DocumentCallArgs = {
  content: string;
  title: string;
  type?: 'update' | 'request-suggestions';
};

type DocumentResult = {
  id: string;
  content: string;
  suggestions?: Array<string>;
};

const DocumentToolCallComponent: React.FC<ToolCallProps<DocumentCallArgs>> = ({
  args,
  isReadonly,
  toolCallId
}) => {
  if (args.type === 'update') {
    return (
      <DocumentToolCall
        type="update"
        args={args}
        isReadonly={isReadonly}
      />
    );
  }

  if (args.type === 'request-suggestions') {
    return (
      <DocumentToolCall
        type="request-suggestions"
        args={args}
        isReadonly={isReadonly}
      />
    );
  }

  return <DocumentPreview isReadonly={isReadonly} args={args} />;
};

const DocumentToolResultComponent: React.FC<ToolResultProps<DocumentResult>> = ({
  result,
  isReadonly
}) => {
  if ('suggestions' in result) {
    return (
      <DocumentToolResult
        type="request-suggestions"
        result={result}
        isReadonly={isReadonly}
      />
    );
  }

  return <DocumentToolResult type="update" result={result} isReadonly={isReadonly} />;
};

export const DocumentToolRenderer: ToolRenderer<DocumentCallArgs, DocumentResult> = {
  Call: DocumentToolCallComponent,
  Result: DocumentToolResultComponent
};
```

## Expected Impact

- **Reduced Code Duplication**: A single point of truth for tool rendering logic
- **Improved Extensibility**: Adding new tools only requires registering a new renderer
- **Better Maintainability**: Centralized logic for handling tool states
- **Enhanced Type Safety**: Proper interfaces ensure correct props are passed
- **Clear Structure**: Explicit relationship between tools and their renderers

## Testing Strategy

1. Unit tests for each tool renderer component
2. Integration tests for the ToolFactory component
3. Component tests for the updated Message component
4. Full message flow tests with different tool types

## Risks and Mitigation

- **Initial Refactoring Effort**: Implement changes gradually, tool by tool
- **Potential Regressions**: Ensure comprehensive test coverage before and after changes
- **Learning Curve**: Document the new pattern and provide examples for the team

## Priority

Medium - This refactoring will significantly improve maintainability and make adding new tools easier, but may not be as critical as some higher-priority items.
