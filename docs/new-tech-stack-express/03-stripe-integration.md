# Stripe Integration

## Overview

This document outlines the integration of Stripe into the AI Chatbot application for subscription management and payment processing. The integration supports organization-based billing with different subscription tiers.

## Technology Stack

- **Payment Provider**: Stripe
- **API Integration**: tRPC procedures for Stripe operations
- **Webhooks**: Stripe webhook handling for event processing
- **Subscription Management**: Organization-level subscriptions
- **Usage Tracking**: Usage-based billing for AI operations

## Integration Architecture

```
┌───────────────────────┐
│                       │
│    Client Apps        │
│                       │
└───────────┬───────────┘
            │
            │
            ▼
┌───────────────────────┐
│                       │
│   tRPC API Layer      │
│                       │
│  ┌─────────────────┐  │
│  │                 │  │
│  │  Stripe Router  │  │
│  │                 │  │
│  └─────────────────┘  │
│                       │
└───────────┬───────────┘
            │
            │
            ▼
┌──────────────────────────────────────┐
│                                      │
│     Stripe Service                   │
│                                      │
│  ┌─────────────┐    ┌─────────────┐  │
│  │             │    │             │  │
│  │ Subscription│    │  Payment    │  │
│  │  Manager    │    │  Gateway    │  │
│  │             │    │             │  │
│  └─────────────┘    └─────────────┘  │
│                                      │
└──────────┬───────────────┬───────────┘
           │               │
           │               │
           ▼               ▼
┌─────────────────┐ ┌─────────────────┐
│                 │ │                 │
│ Stripe API      │ │  Database       │
│                 │ │                 │
└─────────────────┘ └─────────────────┘
```

## Subscription Plans

The AI Chatbot offers tiered subscription plans:

| Plan       | Price     | Features                                                                                                                                     |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Free       | $0/month  | - Basic chat access<br>- 50 messages/month<br>- 1 user per organization<br>- No agent access                                                 |
| Pro        | $19/month | - Unlimited messages<br>- Up to 5 users per organization<br>- Basic agent capabilities<br>- Standard API limits                              |
| Team       | $49/month | - Unlimited messages<br>- Up to 20 users per organization<br>- Advanced agent capabilities<br>- Custom agent creation<br>- Higher API limits |
| Enterprise | Custom    | - Unlimited messages<br>- Unlimited users<br>- All agent capabilities<br>- Custom tools integration<br>- Dedicated support                   |

## Implementation

### Stripe Client Setup

```typescript
// src/lib/stripe/client.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
  typescript: true
});
```

### Subscription Management

```typescript
// src/services/subscription.service.ts
import { stripe } from '../lib/stripe/client';
import { db } from '../db';
import { subscriptions, organizations } from '../db/schema';
import { eq } from 'drizzle-orm';

export class SubscriptionService {
  async createSubscription(organizationId: string, priceId: string, paymentMethodId: string) {
    // Get organization and existing subscription
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      with: {
        subscriptions: true
      }
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Get or create Stripe customer
    let customerId = org.subscriptions?.[0]?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: {
          organizationId
        }
      });
      customerId = customer.id;
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription'
      },
      expand: ['latest_invoice.payment_intent']
    });

    // Update database with subscription info
    const [updatedSubscription] = await db
      .insert(subscriptions)
      .values({
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        plan: this.getPlanFromPriceId(priceId),
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
      })
      .onConflictDoUpdate({
        target: [subscriptions.organizationId],
        set: {
          stripeSubscriptionId: subscription.id,
          plan: this.getPlanFromPriceId(priceId),
          status: subscription.status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          updatedAt: new Date()
        }
      })
      .returning();

    return {
      subscription: updatedSubscription,
      clientSecret: subscription.latest_invoice?.payment_intent?.client_secret
    };
  }

  private getPlanFromPriceId(priceId: string): 'free' | 'pro' | 'team' | 'enterprise' {
    const priceToPlan: Record<string, 'free' | 'pro' | 'team' | 'enterprise'> = {
      price_free: 'free',
      price_pro_monthly: 'pro',
      price_team_monthly: 'team',
      price_enterprise: 'enterprise'
    };

    return priceToPlan[priceId] || 'free';
  }

  async cancelSubscription(organizationId: string) {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.organizationId, organizationId)
    });

    if (!subscription?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    // Cancel at period end
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    // Update database
    await db
      .update(subscriptions)
      .set({
        status: 'canceled',
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, subscription.id));

    return { success: true };
  }

  async getActiveSubscription(organizationId: string) {
    return db.query.subscriptions.findFirst({
      where: (subs, { eq, and }) =>
        and(eq(subs.organizationId, organizationId), eq(subs.status, 'active'))
    });
  }
}
```

### tRPC Router for Stripe

```typescript
// src/trpc/routers/stripe.router.ts
import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { SubscriptionService } from '../../services/subscription.service';
import { TRPCError } from '@trpc/server';

const subscriptionService = new SubscriptionService();

export const stripeRouter = router({
  createSubscription: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        priceId: z.string(),
        paymentMethodId: z.string()
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if user has permissions to manage organization subscriptions
      const canManage = await ctx.auth.canManageOrganization(ctx.user.id, input.organizationId);

      if (!canManage) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage this organization'
        });
      }

      return subscriptionService.createSubscription(
        input.organizationId,
        input.priceId,
        input.paymentMethodId
      );
    }),

  cancelSubscription: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid()
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if user has permissions to manage organization subscriptions
      const canManage = await ctx.auth.canManageOrganization(ctx.user.id, input.organizationId);

      if (!canManage) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage this organization'
        });
      }

      return subscriptionService.cancelSubscription(input.organizationId);
    }),

  getActiveSubscription: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid()
      })
    )
    .query(async ({ input, ctx }) => {
      // Check if user belongs to the organization
      const isMember = await ctx.auth.isOrganizationMember(ctx.user.id, input.organizationId);

      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this organization'
        });
      }

      return subscriptionService.getActiveSubscription(input.organizationId);
    })
});
```

## Webhook Handling

Stripe webhooks are used to receive event notifications from Stripe:

```typescript
// src/pages/api/webhooks/stripe.ts
import { buffer } from 'micro';
import Stripe from 'stripe';
import { stripe } from '../../../lib/stripe/client';
import { db } from '../../../db';
import { subscriptions } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const config = {
  api: {
    bodyParser: false
  }
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
}

async function handleInvoicePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;

  if (subscriptionId) {
    await db
      .update(subscriptions)
      .set({
        status: 'active',
        updatedAt: new Date()
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;

  if (subscriptionId) {
    await db
      .update(subscriptions)
      .set({
        status: 'past_due',
        updatedAt: new Date()
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
  }
}

async function handleSubscriptionUpdated(subscription) {
  await db
    .update(subscriptions)
    .set({
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date()
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
}

async function handleSubscriptionDeleted(subscription) {
  await db
    .update(subscriptions)
    .set({
      status: 'canceled',
      updatedAt: new Date()
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
}
```

## Usage-Based Billing

For metered usage (e.g., additional API calls, agent usage):

```typescript
// src/services/usage.service.ts
import { stripe } from '../lib/stripe/client';
import { db } from '../db';
import { subscriptions } from '../db/schema';
import { eq } from 'drizzle-orm';

export class UsageService {
  async recordAgentUsage(organizationId: string, agentId: string, toolUsageCount: number) {
    const subscription = await db.query.subscriptions.findFirst({
      where: (subs, { eq, and }) =>
        and(eq(subs.organizationId, organizationId), eq(subs.status, 'active'))
    });

    if (!subscription?.stripeSubscriptionId) {
      // Free tier or no subscription - implement usage limits here
      return;
    }

    // For metered billing, report usage to Stripe
    if (subscription.plan === 'team' || subscription.plan === 'enterprise') {
      // Get subscription items
      const items = await stripe.subscriptionItems.list({
        subscription: subscription.stripeSubscriptionId
      });

      // Find the usage-based item (assuming one metered item per subscription)
      const usageItem = items.data.find((item) => {
        // Identify the metered price by its ID or metadata
        return item.price.recurring?.usage_type === 'metered';
      });

      if (usageItem) {
        // Report usage for the current billing period
        await stripe.subscriptionItems.createUsageRecord(usageItem.id, {
          quantity: toolUsageCount,
          timestamp: 'now',
          action: 'increment'
        });
      }
    }
  }
}
```

## Client-Side Integration

The client uses the tRPC client to interact with the Stripe API:

```typescript
// src/components/SubscriptionForm.tsx
import { useState } from 'react';
import { trpc } from '../utils/trpc';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Load Stripe outside of component render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

const SubscriptionForm = ({ organizationId, priceId, onSuccess }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const stripe = useStripe();
  const elements = useElements();

  const createSubscription = trpc.stripe.createSubscription.useMutation({
    onSuccess: (data) => {
      if (data.clientSecret) {
        confirmPayment(data.clientSecret);
      } else {
        onSuccess();
      }
    },
    onError: (error) => {
      setError(error.message);
      setLoading(false);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    // Create payment method
    const cardElement = elements.getElement(CardElement);

    if (!cardElement) {
      setError('Card element not found');
      setLoading(false);
      return;
    }

    const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
    });

    if (paymentMethodError) {
      setError(paymentMethodError.message || 'Payment method error');
      setLoading(false);
      return;
    }

    // Create subscription with payment method
    createSubscription.mutate({
      organizationId,
      priceId,
      paymentMethodId: paymentMethod.id,
    });
  };

  const confirmPayment = async (clientSecret: string) => {
    if (!stripe) {
      setError('Stripe not loaded');
      setLoading(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmCardPayment(clientSecret);

    if (confirmError) {
      setError(confirmError.message || 'Payment confirmation error');
    } else {
      onSuccess();
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
          }}
        />
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <button
        type="submit"
        disabled={!stripe || loading}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-blue-300"
      >
        {loading ? 'Processing...' : 'Subscribe'}
      </button>
    </form>
  );
};

// Wrap with Stripe Elements
export const SubscriptionFormWithStripe = ({ organizationId, priceId, onSuccess }) => (
  <Elements stripe={stripePromise}>
    <SubscriptionForm
      organizationId={organizationId}
      priceId={priceId}
      onSuccess={onSuccess}
    />
  </Elements>
);
```

## Subscription Enforcement

```typescript
// src/middleware/subscription.middleware.ts
import { TRPCError } from '@trpc/server';
import { SubscriptionService } from '../services/subscription.service';

const subscriptionService = new SubscriptionService();

export const requireSubscription = (minimumPlan: 'free' | 'pro' | 'team' | 'enterprise') => {
  return async ({ ctx, next, input, path }) => {
    const organizationId = input.organizationId || ctx.user.defaultOrganizationId;

    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Organization ID is required'
      });
    }

    const subscription = await subscriptionService.getActiveSubscription(organizationId);

    if (!subscription) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'No active subscription found'
      });
    }

    const planHierarchy = {
      free: 0,
      pro: 1,
      team: 2,
      enterprise: 3
    };

    if (planHierarchy[subscription.plan] < planHierarchy[minimumPlan]) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `This feature requires at least the ${minimumPlan} plan`
      });
    }

    return next();
  };
};
```

## Conclusion

This Stripe integration provides a comprehensive subscription management system for the AI Chatbot application, supporting:

1. **Organization-Based Billing**: Subscriptions tied to organizations, not individual users
2. **Tiered Plans**: Different subscription levels with varying features and limits
3. **Usage-Based Billing**: Tracking and charging for metered usage of AI and agent features
4. **Webhook Processing**: Event-driven updates to subscription status
5. **Subscription Enforcement**: Middleware to restrict access based on subscription level

The integration leverages tRPC for type-safe API endpoints and focuses on a seamless user experience while maintaining robust subscription management capabilities.
