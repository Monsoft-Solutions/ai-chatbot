# User Interface Design

## Overview

This document outlines the user interface design for the AI Chatbot application rebuild. The UI design focuses on providing a clean, intuitive, and responsive interface that supports both simple AI interactions and complex agent workflows.

## Design Principles

The UI design follows these key principles:

1. **Simplicity**: Clear, uncluttered interfaces that focus on content
2. **Consistency**: Uniform patterns and components throughout the application
3. **Accessibility**: WCAG 2.1 AA compliance for inclusive user experience
4. **Responsiveness**: Adaptive layouts for all device sizes
5. **Visual Hierarchy**: Clear organization of information by importance
6. **Progressive Disclosure**: Revealing advanced features gradually

## Design System

The application uses a comprehensive design system built with:

- **Tailwind CSS**: For utility-first styling
- **shadcn/ui**: For accessible UI components
- **Lucide Icons**: For consistent iconography
- **Custom Theme**: Supporting light and dark modes

### Color Palette

```typescript
// theme.ts
export const colors = {
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49'
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712'
  },
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6'
};
```

### Typography

```typescript
// typography.ts
export const typography = {
  fontFamily: {
    sans: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace'
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem'
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700'
  }
};
```

### Spacing and Sizing

```typescript
// spacing.ts
export const spacing = {
  px: '1px',
  0: '0',
  0.5: '0.125rem',
  1: '0.25rem',
  1.5: '0.375rem',
  2: '0.5rem',
  2.5: '0.625rem',
  3: '0.75rem',
  3.5: '0.875rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  7: '1.75rem',
  8: '2rem',
  9: '2.25rem',
  10: '2.5rem',
  11: '2.75rem',
  12: '3rem',
  14: '3.5rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  28: '7rem',
  32: '8rem',
  36: '9rem',
  40: '10rem',
  44: '11rem',
  48: '12rem',
  52: '13rem',
  56: '14rem',
  60: '15rem',
  64: '16rem',
  72: '18rem',
  80: '20rem',
  96: '24rem'
};
```

## Core Components

### Layout Components

```tsx
// packages/ui/src/layout/container.tsx
import React from 'react';
import { cn } from '../utils';

type ContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
};

const maxWidthClasses = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-full'
};

export function Container({ children, className, maxWidth = 'lg', ...props }: ContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full px-4 md:px-6', maxWidthClasses[maxWidth], className)}
      {...props}
    >
      {children}
    </div>
  );
}
```

### Chat Components

```tsx
// packages/ui/src/chat/chat-message.tsx
import React from 'react';
import { Avatar } from '../avatar';
import { cn } from '../utils';
import { MarkdownRenderer } from '../markdown/markdown-renderer';

type ChatMessageProps = {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: Date;
  };
  avatarUrl?: string;
  isLoading?: boolean;
  className?: string;
};

export function ChatMessage({
  message,
  avatarUrl,
  isLoading = false,
  className
}: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full items-start gap-4 py-4',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      {!isUser && <Avatar src={avatarUrl} fallback="AI" className="h-8 w-8 shrink-0" />}

      <div
        className={cn(
          'rounded-lg px-4 py-3',
          isUser ? 'bg-primary-100 dark:bg-primary-900' : 'bg-gray-100 dark:bg-gray-800'
        )}
      >
        <MarkdownRenderer
          content={message.content}
          className={cn('prose max-w-none dark:prose-invert', isLoading && 'animate-pulse')}
        />
      </div>

      {isUser && <Avatar fallback="You" className="h-8 w-8 shrink-0" />}
    </div>
  );
}
```

### Agent Components

```tsx
// packages/ui/src/agents/agent-card.tsx
import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../card';
import { Button } from '../button';
import { Avatar } from '../avatar';

type AgentCardProps = {
  agent: {
    id: string;
    name: string;
    description: string;
    avatarUrl?: string;
    capabilities: string[];
  };
  onSelect: (agentId: string) => void;
  isSelected?: boolean;
};

export function AgentCard({ agent, onSelect, isSelected = false }: AgentCardProps) {
  return (
    <Card className={cn('transition-all hover:shadow-md', isSelected && 'ring-primary-500 ring-2')}>
      <CardHeader className="flex flex-row items-center gap-4 space-y-0">
        <Avatar src={agent.avatarUrl} fallback={agent.name.charAt(0)} className="h-10 w-10" />
        <CardTitle className="line-clamp-1">{agent.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-2 text-sm text-gray-500">{agent.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {agent.capabilities.slice(0, 3).map((capability) => (
            <span
              key={capability}
              className="bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200 rounded-full px-2 py-1 text-xs"
            >
              {capability}
            </span>
          ))}
          {agent.capabilities.length > 3 && (
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-gray-800">
              +{agent.capabilities.length - 3} more
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => onSelect(agent.id)}
          variant={isSelected ? 'default' : 'outline'}
          className="w-full"
        >
          {isSelected ? 'Selected' : 'Select Agent'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

## Page Layouts

### Main Layout

```tsx
// apps/web/components/layout/main-layout.tsx
import React from 'react';
import { Header } from './header';
import { Footer } from './footer';
import { Sidebar } from './sidebar';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';

type MainLayoutProps = {
  children: React.ReactNode;
  showSidebar?: boolean;
};

export function MainLayout({ children, showSidebar = true }: MainLayoutProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <div className="flex min-h-screen flex-col">
        <Header />

        <div className="flex flex-1">
          {showSidebar && <Sidebar className="hidden md:block" />}

          <main className="flex-1">{children}</main>
        </div>

        <Footer />
      </div>

      <Toaster />
    </ThemeProvider>
  );
}
```

## Page Mockups

### Chat Interface

The main chat interface follows a modern messaging application layout:

```
┌─────────────────────────────────────────────────────────┐
│ Header with logo, navigation and user profile           │
├───────────┬─────────────────────────────────────────────┤
│           │                                             │
│           │  ┌─────────────────────────────────────┐   │
│           │  │ AI Assistant - 2:30 PM              │   │
│           │  │ Hello! How can I help you today?    │   │
│           │  └─────────────────────────────────────┘   │
│           │                                             │
│ Sidebar   │  ┌───────────────────────┐                 │
│ with      │  │ User - 2:31 PM        │                 │
│ chat      │  │ I need help with...   │                 │
│ history   │  └───────────────────────┘                 │
│ and       │                                             │
│ agents    │  ┌─────────────────────────────────────┐   │
│           │  │ AI Assistant - 2:32 PM              │   │
│           │  │ I'll help you with that. First...   │   │
│           │  └─────────────────────────────────────┘   │
│           │                                             │
│           │                                             │
│           │                                             │
│           │                                             │
├───────────┴─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Type a message...                             Send ▶ │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Agent Creation Interface

The agent creation interface uses a step-by-step wizard approach:

```
┌─────────────────────────────────────────────────────────┐
│ Header                                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Create a New Agent                                     │
│                                                         │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                    │
│  │  1  │──│  2  │──│  3  │──│  4  │                    │
│  └─────┘  └─────┘  └─────┘  └─────┘                    │
│  Details   Tools    Settings  Review                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │  Agent Name                                     │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ Research Assistant                       │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                 │   │
│  │  Description                                    │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ An AI assistant that helps with         │   │   │
│  │  │ academic research, finding resources,   │   │   │
│  │  │ and summarizing papers.                 │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                 │   │
│  │  Agent Type                                     │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │ Research                              ▼ │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌───────────┐                         ┌────────────┐  │
│  │   Cancel  │                         │    Next    │  │
│  └───────────┘                         └────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Dashboard Interface

The dashboard provides an overview of usage and agents:

```
┌─────────────────────────────────────────────────────────┐
│ Header                                                  │
├───────────┬─────────────────────────────────────────────┤
│           │                                             │
│           │  Dashboard                                  │
│           │                                             │
│ Sidebar   │  ┌─────────────────┐  ┌─────────────────┐  │
│           │  │                 │  │                 │  │
│           │  │  Messages       │  │  Agents         │  │
│           │  │  357 / 500      │  │  3 / 5         │  │
│           │  │  [▓▓▓▓▓▓▓▓▓▓──] │  │  [▓▓▓▓▓▓──────] │  │
│           │  │                 │  │                 │  │
│           │  └─────────────────┘  └─────────────────┘  │
│           │                                             │
│           │  Recent Conversations                       │
│           │  ┌─────────────────────────────────────┐   │
│           │  │ Project Planning - 2h ago           │   │
│           │  ├─────────────────────────────────────┤   │
│           │  │ Research on Quantum Computing - 1d  │   │
│           │  ├─────────────────────────────────────┤   │
│           │  │ Meeting Notes - 2d                  │   │
│           │  └─────────────────────────────────────┘   │
│           │                                             │
│           │  Your Agents                               │
│           │  ┌─────────────┐ ┌─────────────┐ ┌─────┐  │
│           │  │ Research    │ │ Coding      │ │  +  │  │
│           │  │ Assistant   │ │ Helper      │ │     │  │
│           │  └─────────────┘ └─────────────┘ └─────┘  │
│           │                                             │
└───────────┴─────────────────────────────────────────────┘
```

## Responsive Design Approach

The application uses a mobile-first approach with responsive breakpoints:

```typescript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      xs: '475px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px'
    }
    // ...
  }
};
```

Key responsive design patterns:

1. **Collapsible Sidebar**: Sidebar transforms into a mobile menu on small screens
2. **Stack to Grid**: Elements stack vertically on mobile, display as grid on larger screens
3. **Simplified UI**: Non-essential UI elements are hidden on mobile
4. **Touch-friendly**: Larger tap targets on mobile devices
5. **Responsive Typography**: Font sizes adjust based on screen size

## Animation and Transitions

Subtle animations enhance the user experience:

```typescript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-in-out',
        'bounce-loader': 'bounce 1s infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 }
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 }
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 }
        }
      }
    }
  }
};
```

Animation is used for:

1. **Page Transitions**: Smooth transitions between pages
2. **Loading States**: Pulsing animations during data fetching
3. **Hover Effects**: Subtle feedback on interactive elements
4. **Typing Indicators**: Animated dots during AI response generation
5. **Alerts and Notifications**: Slide-in animations for temporary messages

## Accessibility Features

The application adheres to WCAG 2.1 AA standards with:

1. **Keyboard Navigation**: Full keyboard support with visible focus states
2. **Screen Reader Support**: Semantic HTML and ARIA attributes
3. **Color Contrast**: Meeting minimum contrast requirements
4. **Reduced Motion**: Respecting user preferences for reduced motion
5. **Form Labels**: Clear visible labels for all form elements
6. **Error Handling**: Clear error messages with instructions for resolution
7. **Focus Management**: Proper focus handling for modals and dynamic content

```tsx
// packages/ui/src/accessibility/skip-link.tsx
import React from 'react';

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4 focus:text-black"
    >
      Skip to main content
    </a>
  );
}
```

## Customization Options

Users can customize their experience through:

1. **Theme Selection**: Light and dark mode
2. **Accent Color**: Choice of primary color accents
3. **Font Size**: Adjustable text size
4. **Layout Density**: Compact vs. comfortable spacing options
5. **Sidebar Visibility**: Option to collapse sidebar permanently

```tsx
// components/settings/appearance-settings.tsx
import React from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useUserSettings } from '@/hooks/use-user-settings';

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useUserSettings();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Theme</h3>
        <RadioGroup value={theme} onValueChange={setTheme} className="grid grid-cols-3 gap-4">
          <div>
            <RadioGroupItem value="light" id="theme-light" className="sr-only" />
            <Label
              htmlFor="theme-light"
              className="flex flex-col items-center space-y-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
            >
              <span>Light</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem value="dark" id="theme-dark" className="sr-only" />
            <Label
              htmlFor="theme-dark"
              className="flex flex-col items-center space-y-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
            >
              <span>Dark</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem value="system" id="theme-system" className="sr-only" />
            <Label
              htmlFor="theme-system"
              className="flex flex-col items-center space-y-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
            >
              <span>System</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Font Size Settings */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Font Size</h3>
        <RadioGroup
          value={settings.fontSize}
          onValueChange={(value) => updateSettings({ fontSize: value })}
          className="grid grid-cols-3 gap-4"
        >
          <div>
            <RadioGroupItem value="small" id="font-small" className="sr-only" />
            <Label
              htmlFor="font-small"
              className="flex flex-col items-center space-y-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
            >
              <span className="text-sm">Small</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem value="medium" id="font-medium" className="sr-only" />
            <Label
              htmlFor="font-medium"
              className="flex flex-col items-center space-y-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
            >
              <span>Medium</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem value="large" id="font-large" className="sr-only" />
            <Label
              htmlFor="font-large"
              className="flex flex-col items-center space-y-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
            >
              <span className="text-lg">Large</span>
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}
```

## Future UI Enhancements

Planned future improvements:

1. **Voice Interface**: Speech recognition and text-to-speech capabilities
2. **Drag-and-Drop Interface**: Visual agent builder with drag-and-drop components
3. **Advanced Visualizations**: Data visualization tools for complex outputs
4. **Collaborative Features**: Real-time collaboration with shared agents
5. **Internationalization**: Multi-language support
6. **Motion Graphics**: Advanced animations for enhanced UX
7. **Interactive Tutorials**: Guided tours for new users

## Conclusion

The user interface design for the AI Chatbot application provides a modern, accessible, and flexible interface that supports both simple conversations and complex agent interactions. By following established design principles and using a component-based architecture, the UI can evolve while maintaining consistency and usability.
