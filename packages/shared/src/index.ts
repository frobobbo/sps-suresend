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
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
}).refine((value) => value.userId || value.email, {
  message: 'userId or email is required',
});

export type CreateDomainPayload = z.infer<typeof createDomainSchema>;
export type Domain = z.infer<typeof domainSchema>;
export type DelegateAccessPayload = z.infer<typeof delegateAccessSchema>;

// ─── Reputation ───────────────────────────────────────────────────────────────

export const reputationStatusSchema = z.enum(['clean', 'warning', 'critical']);

export const reputationCheckSchema = z.object({
  id: z.string().uuid(),
  domainId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  status: reputationStatusSchema,
  details: z.object({
    mx: z.object({ pass: z.boolean(), records: z.array(z.string()) }),
    spf: z.object({
      pass: z.boolean(),
      record: z.string().nullable(),
      policy: z.enum(['hard_fail', 'soft_fail', 'permissive', 'pass_all']).optional(),
    }),
    dmarc: z.object({
      pass: z.boolean(),
      record: z.string().nullable(),
      policy: z.enum(['reject', 'quarantine', 'none']).optional(),
      hasRua: z.boolean().optional(),
    }),
    dkim: z.object({ pass: z.boolean(), selector: z.string().nullable() }),
    https: z.object({ pass: z.boolean(), statusCode: z.number().nullable() }),
    blacklists: z.array(
      z.object({ list: z.string(), listed: z.boolean(), blocked: z.boolean().optional() }),
    ),
    httpsRedirect: z.object({ pass: z.boolean() }).optional(),
    ssl: z.object({
      pass: z.boolean(),
      daysUntilExpiry: z.number().nullable(),
      expiresAt: z.string().nullable(),
    }).optional(),
    securityHeaders: z.object({
      hsts: z.boolean(),
      xContentTypeOptions: z.boolean(),
      xFrameOptions: z.boolean(),
    }).optional(),
    mtaSts: z.object({ pass: z.boolean(), policy: z.string().optional() }).optional(),
    tlsRpt: z.object({ pass: z.boolean(), record: z.string().nullable() }).optional(),
    bimi: z.object({ pass: z.boolean(), record: z.string().nullable() }).optional(),
    caa: z.object({ pass: z.boolean(), records: z.array(z.string()) }).optional(),
    nsCount: z.object({ pass: z.boolean(), count: z.number() }).optional(),
    ptr: z.object({ pass: z.boolean(), hostname: z.string().nullable() }).optional(),
    dbl: z.object({ listed: z.boolean() }).optional(),
  }),
  checkedAt: z.string().datetime(),
});

export type ReputationStatus = z.infer<typeof reputationStatusSchema>;
export type ReputationCheck = z.infer<typeof reputationCheckSchema>;
