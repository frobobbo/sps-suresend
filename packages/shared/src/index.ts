import { z } from 'zod';

// ─── Existing ────────────────────────────────────────────────────────────────

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

// ─── Users & Auth ─────────────────────────────────────────────────────────────

export const userRoleSchema = z.enum(['admin', 'user']);

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
  createdAt: z.string().datetime(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: userRoleSchema.optional().default('user'),
});

export const updateUserRoleSchema = z.object({
  role: userRoleSchema,
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type RegisterPayload = z.infer<typeof registerSchema>;
export type LoginPayload = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type CreateUserPayload = z.infer<typeof createUserSchema>;
export type UpdateUserRolePayload = z.infer<typeof updateUserRoleSchema>;

// ─── Domains ──────────────────────────────────────────────────────────────────

export const createDomainSchema = z.object({
  name: z.string().min(3).max(255),
});

export const domainSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export const delegateAccessSchema = z.object({
  userId: z.string().uuid(),
});

export type CreateDomainPayload = z.infer<typeof createDomainSchema>;
export type Domain = z.infer<typeof domainSchema>;
export type DelegateAccessPayload = z.infer<typeof delegateAccessSchema>;

// ─── Reputation ───────────────────────────────────────────────────────────────

export const reputationStatusSchema = z.enum(['clean', 'warning', 'blacklisted']);

export const reputationCheckSchema = z.object({
  id: z.string().uuid(),
  domainId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  status: reputationStatusSchema,
  details: z.object({
    mx: z.object({ pass: z.boolean(), records: z.array(z.string()) }),
    spf: z.object({ pass: z.boolean(), record: z.string().nullable() }),
    dmarc: z.object({ pass: z.boolean(), record: z.string().nullable() }),
    dkim: z.object({ pass: z.boolean(), selector: z.string().nullable() }),
    https: z.object({ pass: z.boolean(), statusCode: z.number().nullable() }),
    blacklists: z.array(
      z.object({ list: z.string(), listed: z.boolean() }),
    ),
  }),
  checkedAt: z.string().datetime(),
});

export type ReputationStatus = z.infer<typeof reputationStatusSchema>;
export type ReputationCheck = z.infer<typeof reputationCheckSchema>;
