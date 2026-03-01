import { z } from 'zod';

export const subscriptionTierSchema = z.enum(['starter', 'growth', 'pro']);

export const healthStatusSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(80),
  domain: z.string().min(3).max(255),
  tier: subscriptionTierSchema,
});

export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;
