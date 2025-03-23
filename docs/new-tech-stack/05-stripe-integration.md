# Stripe Integration for Payments

## Overview

This document outlines the implementation of Stripe payments in the AI Chatbot application. The integration will handle subscriptions, usage-based billing, and one-time purchases, enabling monetization of premium features and agent usage.

## Payment Use Cases

The Stripe integration will support the following payment scenarios:

1. **Subscription Plans**: Tiered access to features based on monthly/annual subscription
2. **Usage-Based Billing**: Pay-as-you-go for AI usage beyond subscription limits
3. **Agent Marketplace**: Purchasing or licensing agents created by other users
4. **One-Time Purchases**: Premium agent templates or add-ons

## Subscription Tiers

| Tier       | Price  | Features                  | AI Usage Limits | Agents Limit     |
| ---------- | ------ | ------------------------- | --------------- | ---------------- |
| Free       | $0/mo  | Basic chat, limited tools | 50 msgs/day     | 1 personal agent |
| Pro        | $15/mo | All tools, priority queue | 500 msgs/day    | 5 agents         |
| Business   | $49/mo | Team features, analytics  | 2000 msgs/day   | 25 agents        |
| Enterprise | Custom | Custom integrations, SLA  | Unlimited       | Unlimited        |

## Architecture

The payment system will be implemented as a separate package in the monorepo:

```
packages/payments/
├── src/
│   ├── api/             # API handlers for Stripe webhooks
│   ├── client/          # Client-side components for checkout
│   ├── server/          # Server-side Stripe integration
│   ├── hooks/           # React hooks for subscription state
│   └── types/           # TypeScript interfaces
└── package.json
```

### Integration with Supabase and Drizzle

The payment system will use the Supabase database with Drizzle ORM for storing subscription data:

```typescript
// packages/database/src/schema/subscriptions.ts
import { pgTable, text, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  status: text('status').notNull(), // 'active', 'canceled', 'past_due'
  priceId: text('price_id'),
  productId: text('product_id'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  agentLimit: integer('agent_limit').notNull(),
  messageLimit: integer('message_limit').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  type: text('type').notNull(), // 'message', 'agent', 'tool'
  quantity: integer('quantity').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  stripeUsageRecordId: text('stripe_usage_record_id')
});
```

## Server-Side Implementation

### Stripe Setup

```typescript
// packages/payments/src/server/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

export const productIds = {
  free: process.env.STRIPE_PRODUCT_FREE!,
  pro: process.env.STRIPE_PRODUCT_PRO!,
  business: process.env.STRIPE_PRODUCT_BUSINESS!,
  enterprise: process.env.STRIPE_PRODUCT_ENTERPRISE!
};

export const priceIds = {
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  proYearly: process.env.STRIPE_PRICE_PRO_YEARLY!,
  businessMonthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY!,
  businessYearly: process.env.STRIPE_PRICE_BUSINESS_YEARLY!
};
```

### Customer Management

```typescript
// packages/payments/src/server/customers.ts
import { stripe } from './stripe';
import { db } from '@/packages/database';
import { users, subscriptions } from '@/packages/database/schema';
import { eq } from 'drizzle-orm';

export async function getOrCreateCustomer(userId: string) {
  // First check if user has a customer ID already
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Check if there's a subscription with a customer ID
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId)
  });

  if (subscription?.stripeCustomerId) {
    return subscription.stripeCustomerId;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: {
      userId
    }
  });

  // Create free subscription record if none exists
  if (!subscription) {
    await db.insert(subscriptions).values({
      userId,
      status: 'active',
      stripeCustomerId: customer.id,
      agentLimit: 1,
      messageLimit: 50
    });
  } else {
    // Update existing subscription with customer ID
    await db
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id })
      .where(eq(subscriptions.userId, userId));
  }

  return customer.id;
}
```

### Subscription Management

```typescript
// packages/payments/src/server/subscriptions.ts
import { stripe, priceIds } from './stripe';
import { getOrCreateCustomer } from './customers';
import { db } from '@/packages/database';
import { subscriptions } from '@/packages/database/schema';
import { eq } from 'drizzle-orm';

export async function createCheckoutSession(userId: string, priceId: string, returnUrl: string) {
  const customerId = await getOrCreateCustomer(userId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    mode: 'subscription',
    success_url: `${returnUrl}?success=true`,
    cancel_url: `${returnUrl}?canceled=true`,
    metadata: {
      userId
    }
  });

  return session;
}

export async function createBillingPortalSession(userId: string, returnUrl: string) {
  const customerId = await getOrCreateCustomer(userId);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });

  return session;
}

export async function cancelSubscription(userId: string) {
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId)
  });

  if (!subscription?.stripeSubscriptionId) {
    throw new Error('No active subscription found');
  }

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true
  });

  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true })
    .where(eq(subscriptions.userId, userId));

  return true;
}
```

### Usage Tracking

```typescript
// packages/payments/src/server/usage.ts
import { stripe } from './stripe';
import { db } from '@/packages/database';
import { usageRecords, subscriptions } from '@/packages/database/schema';
import { eq } from 'drizzle-orm';

export async function trackUsage(
  userId: string,
  type: 'message' | 'agent' | 'tool',
  quantity: number = 1
) {
  // Record usage in database
  await db.insert(usageRecords).values({
    userId,
    type,
    quantity
  });

  // Get subscription with Stripe subscription item ID
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId)
  });

  // Only report usage to Stripe for paid plans with metered billing
  if (subscription?.stripeSubscriptionId) {
    // In a real implementation, you would retrieve the subscription from Stripe
    // to get the subscription item ID for the metered component
    // This is a simplified example
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    const subscriptionItem = stripeSubscription.items.data[0];

    // Report usage to Stripe for metered billing
    const usageRecord = await stripe.subscriptionItems.createUsageRecord(subscriptionItem.id, {
      quantity,
      timestamp: 'now',
      action: 'increment'
    });

    // Update database record with Stripe usage record ID
    await db
      .update(usageRecords)
      .set({ stripeUsageRecordId: usageRecord.id })
      .where(eq(usageRecords.userId, userId))
      .limit(1);
  }

  return true;
}
```

## Webhook Implementation

```typescript
// apps/api/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/packages/payments/server/stripe';
import { db } from '@/packages/database';
import { subscriptions } from '@/packages/database/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get('stripe-signature') as string;

  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const subscription = event.data.object;
        const userId = subscription.metadata.userId;

        if (!userId) {
          console.error('No userId found in subscription metadata');
          break;
        }

        // Get plan information
        const product = await stripe.products.retrieve(
          subscription.items.data[0].price.product as string
        );

        // Determine limits based on product metadata
        const agentLimit = parseInt(product.metadata.agentLimit || '1');
        const messageLimit = parseInt(product.metadata.messageLimit || '50');

        // Update subscription in database
        await db
          .update(subscriptions)
          .set({
            status: subscription.status,
            priceId: subscription.items.data[0].price.id,
            productId: product.id,
            stripeSubscriptionId: subscription.id,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            agentLimit,
            messageLimit,
            updatedAt: new Date()
          })
          .where(eq(subscriptions.userId, userId));

        break;

      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object;
        const deletedUserId = deletedSubscription.metadata.userId;

        if (!deletedUserId) {
          console.error('No userId found in subscription metadata');
          break;
        }

        // Update subscription in database to free plan
        await db
          .update(subscriptions)
          .set({
            status: 'canceled',
            stripeSubscriptionId: null,
            cancelAtPeriodEnd: false,
            agentLimit: 1,
            messageLimit: 50,
            updatedAt: new Date()
          })
          .where(eq(subscriptions.userId, deletedUserId));

        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
```

## Client-Side Components

### Checkout Button Component

```tsx
// packages/payments/src/client/checkout-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/packages/ui';
import { createCheckoutSession } from '../actions';

export function CheckoutButton({
  priceId,
  label,
  variant = 'default'
}: {
  priceId: string;
  label: string;
  variant?: 'default' | 'outline' | 'secondary';
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = async () => {
    try {
      setIsLoading(true);

      const { url } = await createCheckoutSession(priceId, window.location.origin);

      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button variant={variant} onClick={handleCheckout} disabled={isLoading}>
      {isLoading ? 'Loading...' : label}
    </Button>
  );
}
```

### Pricing Table Component

```tsx
// packages/payments/src/client/pricing-table.tsx
'use client';

import { useSubscription } from '../hooks/use-subscription';
import { CheckoutButton } from './checkout-button';
import { ManageSubscriptionButton } from './manage-subscription-button';

const plans = [
  {
    name: 'Free',
    price: '$0',
    priceDetail: 'forever',
    description: 'Basic features for personal use',
    features: [
      'Basic chat functionality',
      'Limited tools access',
      '50 messages per day',
      '1 personal agent'
    ],
    priceId: null
  },
  {
    name: 'Pro',
    price: '$15',
    priceDetail: 'per month',
    description: 'Advanced features for power users',
    features: [
      'Full chat functionality',
      'All tools access',
      'Priority processing',
      '500 messages per day',
      '5 custom agents'
    ],
    priceId: 'price_pro_monthly'
  },
  {
    name: 'Business',
    price: '$49',
    priceDetail: 'per month',
    description: 'Enhanced features for teams',
    features: [
      'Everything in Pro',
      'Team collaboration',
      'Analytics dashboard',
      '2000 messages per day',
      '25 custom agents'
    ],
    priceId: 'price_business_monthly'
  }
];

export function PricingTable() {
  const { subscription, isLoading } = useSubscription();

  if (isLoading) {
    return <div>Loading subscription details...</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
      {plans.map((plan) => (
        <div key={plan.name} className="flex flex-col rounded-lg border p-6 shadow-sm">
          <div className="mb-4 text-center">
            <h3 className="text-lg font-bold">{plan.name}</h3>
            <div className="mt-2 flex items-baseline justify-center">
              <span className="text-3xl font-bold">{plan.price}</span>
              <span className="ml-1 text-sm text-gray-500">{plan.priceDetail}</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
          </div>

          <ul className="mb-6 flex-1 space-y-2 text-sm">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-center">
                <svg
                  className="mr-2 h-4 w-4 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-auto">
            {!plan.priceId ? (
              subscription?.productId ? (
                <Button variant="outline" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Current Plan
                </Button>
              )
            ) : subscription?.priceId === plan.priceId ? (
              <ManageSubscriptionButton variant="outline" />
            ) : (
              <CheckoutButton priceId={plan.priceId} label={`Subscribe to ${plan.name}`} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Usage Display Component

```tsx
// packages/payments/src/client/usage-display.tsx
'use client';

import { useSubscription } from '../hooks/use-subscription';
import { useUsage } from '../hooks/use-usage';
import { Progress } from '@/packages/ui';

export function UsageDisplay() {
  const { subscription } = useSubscription();
  const { messageUsage, agentUsage, isLoading } = useUsage();

  if (isLoading || !subscription) {
    return <div>Loading usage details...</div>;
  }

  const messagePercent = Math.min(
    100,
    Math.round((messageUsage / subscription.messageLimit) * 100)
  );

  const agentPercent = Math.min(100, Math.round((agentUsage / subscription.agentLimit) * 100));

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h3 className="font-bold">Your Usage</h3>

      <div>
        <div className="mb-1 flex justify-between">
          <span>Messages</span>
          <span>
            {messageUsage} / {subscription.messageLimit} per day
          </span>
        </div>
        <Progress value={messagePercent} />
      </div>

      <div>
        <div className="mb-1 flex justify-between">
          <span>Agents</span>
          <span>
            {agentUsage} / {subscription.agentLimit}
          </span>
        </div>
        <Progress value={agentPercent} />
      </div>
    </div>
  );
}
```

## Server Actions for Client Integration

```typescript
// packages/payments/src/actions.ts
'use server';

import { getServerSession } from '@/auth';
import {
  createCheckoutSession as createCheckoutSessionServer,
  createBillingPortalSession as createBillingPortalSessionServer
} from './server/subscriptions';

export async function createCheckoutSession(priceId: string, returnUrl: string) {
  const session = await getServerSession();

  if (!session?.user?.id) {
    throw new Error('User not authenticated');
  }

  const checkoutSession = await createCheckoutSessionServer(session.user.id, priceId, returnUrl);

  return { url: checkoutSession.url };
}

export async function createBillingPortalSession(returnUrl: string) {
  const session = await getServerSession();

  if (!session?.user?.id) {
    throw new Error('User not authenticated');
  }

  const portalSession = await createBillingPortalSessionServer(session.user.id, returnUrl);

  return { url: portalSession.url };
}
```

## React Hooks

```typescript
// packages/payments/src/hooks/use-subscription.ts
'use client';

import { useEffect, useState } from 'react';
import { getSubscription } from '../client/api';
import type { Subscription } from '../types';

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSubscription() {
      try {
        setIsLoading(true);
        const data = await getSubscription();
        setSubscription(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch subscription'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchSubscription();
  }, []);

  return { subscription, isLoading, error };
}
```

```typescript
// packages/payments/src/hooks/use-usage.ts
'use client';

import { useEffect, useState } from 'react';
import { getUsage } from '../client/api';

export function useUsage() {
  const [messageUsage, setMessageUsage] = useState(0);
  const [agentUsage, setAgentUsage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      try {
        setIsLoading(true);
        const { messages, agents } = await getUsage();
        setMessageUsage(messages);
        setAgentUsage(agents);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch usage'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchUsage();

    // Poll for usage updates every 5 minutes
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return { messageUsage, agentUsage, isLoading, error };
}
```

## API Routes for Client-Side Data

```typescript
// apps/api/app/api/subscription/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/auth';
import { db } from '@/packages/database';
import { subscriptions } from '@/packages/database/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, session.user.id)
  });

  if (!subscription) {
    // Return free tier defaults if no subscription record exists
    return NextResponse.json({
      status: 'free',
      agentLimit: 1,
      messageLimit: 50
    });
  }

  return NextResponse.json(subscription);
}
```

```typescript
// apps/api/app/api/usage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/auth';
import { db } from '@/packages/database';
import { usageRecords, agentInstances } from '@/packages/database/schema';
import { eq, and, gte, count } from 'drizzle-orm';

export async function GET() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get today's start timestamp
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get message usage for today
  const messageUsage = await db
    .select({ count: count() })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, session.user.id),
        eq(usageRecords.type, 'message'),
        gte(usageRecords.timestamp, today)
      )
    );

  // Get agent count
  const agentCount = await db
    .select({ count: count() })
    .from(agentInstances)
    .where(eq(agentInstances.userId, session.user.id));

  return NextResponse.json({
    messages: messageUsage[0]?.count || 0,
    agents: agentCount[0]?.count || 0
  });
}
```

## Environment Variables

```
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRODUCT_FREE=prod_...
STRIPE_PRODUCT_PRO=prod_...
STRIPE_PRODUCT_BUSINESS=prod_...
STRIPE_PRODUCT_ENTERPRISE=prod_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_YEARLY=price_...
```

## Usage in API Routes

```typescript
// apps/api/app/api/chat/route.ts
import { trackUsage } from '@/packages/payments/server/usage';
import { getUserSubscription } from '@/packages/payments/server/subscriptions';

export async function POST(req: NextRequest) {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check usage limits
  const subscription = await getUserSubscription(session.user.id);
  const usage = await getCurrentUsage(session.user.id);

  if (usage.messages >= subscription.messageLimit) {
    return NextResponse.json({ error: 'Daily message limit reached' }, { status: 403 });
  }

  // Track message usage
  await trackUsage(session.user.id, 'message');

  // Process chat request
  // ...
}
```

## Implementing Agent Marketplace

For the agent marketplace where users can purchase agents created by others:

```typescript
// packages/payments/src/server/marketplace.ts
import { stripe } from './stripe';
import { db } from '@/packages/database';
import { getOrCreateCustomer } from './customers';

export async function createAgentPurchaseSession(
  userId: string,
  agentId: string,
  price: number,
  returnUrl: string
) {
  const customerId = await getOrCreateCustomer(userId);

  // Get agent details
  const agent = await db.query.agentDefinitions.findFirst({
    where: eq(agentDefinitions.id, agentId)
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Create a one-time checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: agent.name,
            description: agent.description
          },
          unit_amount: price * 100 // convert to cents
        },
        quantity: 1
      }
    ],
    mode: 'payment',
    success_url: `${returnUrl}?success=true&agentId=${agentId}`,
    cancel_url: `${returnUrl}?canceled=true`,
    metadata: {
      userId,
      agentId
    }
  });

  return session;
}
```

## Security Considerations

1. **Payment Card Industry (PCI) Compliance**: Using Stripe Checkout to avoid handling card data directly
2. **Webhook Signature Verification**: Validating all webhook events come from Stripe
3. **Authorization Checks**: Ensuring users can only access their own subscription data
4. **Rate Limiting**: Preventing abuse with rate limits on payment-related endpoints
5. **Audit Logging**: Tracking all payment events for debugging and compliance

## Future Enhancements

1. **Volume Discounts**: Implementing tiered pricing for high-volume customers
2. **Proration**: Handling plan changes mid-billing cycle
3. **Multi-Currency Support**: Supporting payments in different currencies
4. **Team Billing**: Managing team subscriptions with seat-based pricing
5. **Usage Analytics**: Providing detailed usage analytics to customers
6. **Revenue Sharing**: Implementing revenue sharing for marketplace creators
