// Relative URL — requests go through the Next.js proxy at app/api/[...path]/route.ts
// which forwards them to the backend using the API_INTERNAL_URL runtime env var.
const API_BASE = '/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('suresend_token');
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const raw = res.status === 204 ? '' : await res.text();
  const body = raw ? JSON.parse(raw) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, (body as { message?: string } | undefined)?.message ?? 'Request failed');
  }
  return body as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  register: (email: string, password: string) =>
    apiFetch<{ id: string; email: string; role: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    apiFetch<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => apiFetch<{ id: string; email: string; role: string; tier: 'free' | 'plus' | 'pro' }>('/auth/me'),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = {
  list: () => apiFetch<User[]>('/users'),

  lookup: (email: string) =>
    apiFetch<User | null>('/users/lookup', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  create: (email: string, password: string, role: 'admin' | 'user') =>
    apiFetch<User>('/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    }),

  updateRole: (id: string, role: 'admin' | 'user') =>
    apiFetch<User>(`/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  updateTier: (id: string, tier: 'free' | 'plus' | 'pro') =>
    apiFetch<User>(`/users/${id}/tier`, {
      method: 'PATCH',
      body: JSON.stringify({ tier }),
    }),

  remove: (id: string) =>
    apiFetch<void>(`/users/${id}`, { method: 'DELETE' }),
};

// ─── Domains ──────────────────────────────────────────────────────────────────

export const domains = {
  list: () => apiFetch<Domain[]>('/domains'),

  create: (name: string) =>
    apiFetch<Domain>('/domains', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  get: (id: string) => apiFetch<Domain>(`/domains/${id}`),

  remove: (id: string) =>
    apiFetch<void>(`/domains/${id}`, { method: 'DELETE' }),

  delegate: (domainId: string, body: { userId?: string; email?: string }) =>
    apiFetch(`/domains/${domainId}/access`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  revokeAccess: (domainId: string, userId: string) =>
    apiFetch<void>(`/domains/${domainId}/access/${userId}`, { method: 'DELETE' }),

  connectCloudflare: (domainId: string, token: string) =>
    apiFetch<{ cloudflareConnected: boolean }>(`/domains/${domainId}/cloudflare`, {
      method: 'PUT',
      body: JSON.stringify({ token }),
    }),

  disconnectCloudflare: (domainId: string) =>
    apiFetch<void>(`/domains/${domainId}/cloudflare`, { method: 'DELETE' }),

  verification: (domainId: string) =>
    apiFetch<{ host: string; value: string; verifiedAt: string | null }>(`/domains/${domainId}/verification`),

  verify: (domainId: string) =>
    apiFetch<{ verified: boolean; verifiedAt: string | null }>(`/domains/${domainId}/verify`, {
      method: 'POST',
    }),

  updateMonitoring: (
    domainId: string,
    body: { scanIntervalMinutes: number | null; alertsEnabled: boolean },
  ) =>
    apiFetch<{ scanIntervalMinutes: number | null; alertsEnabled: boolean }>(`/domains/${domainId}/monitoring`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  fixCheck: (domainId: string, check: string, payload?: unknown) =>
    apiFetch<{ record: string; action: string }>(`/domains/${domainId}/fix/${check}`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface EmailSettings {
  apiKey: string | null;
  domain: string | null;
  from: string | null;
  source: 'database' | 'env' | 'none';
  configured: boolean;
}

export const settings = {
  getEmail: () => apiFetch<EmailSettings>('/settings/email'),

  setEmail: (body: { apiKey?: string; domain?: string; from?: string }) =>
    apiFetch<{ ok: boolean }>('/settings/email', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};

// ─── Reputation ───────────────────────────────────────────────────────────────

export const reputation = {
  list: (domainId: string) =>
    apiFetch<ReputationCheck[]>(`/domains/${domainId}/reputation`),

  runCheck: (domainId: string) =>
    apiFetch<ScanJob>(`/domains/${domainId}/reputation/check`, {
      method: 'POST',
    }),

  latestJob: (domainId: string) =>
    apiFetch<ScanJob | null>(`/domains/${domainId}/reputation/jobs/latest`),
};

// ─── Types (mirrored from shared for client use) ──────────────────────────────

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  tier: 'free' | 'plus' | 'pro';
  createdAt: string;
}

export interface DomainAccess {
  id: string;
  userId: string;
  user?: { email: string };
  createdAt: string;
}

export interface Domain {
  id: string;
  name: string;
  ownerId: string;
  delegatedAccess: DomainAccess[];
  cloudflareConnected?: boolean;
  verificationToken?: string;
  verifiedAt: string | null;
  scanIntervalMinutes: number | null;
  alertsEnabled: boolean;
  lastScheduledScanAt: string | null;
  createdAt: string;
}

export interface ScanJob {
  id: string;
  domainId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  trigger: 'manual' | 'scheduled';
  requestedByUserId: string | null;
  runAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  resultCheckId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationCheck {
  id: string;
  domainId: string;
  score: number;
  emailScore: number;
  webScore: number;
  status: 'clean' | 'warning' | 'critical';
  details: {
    mx: { pass: boolean; records: string[]; mailProvider?: 'google' | 'microsoft' };
    spf: { pass: boolean; record: string | null; policy?: 'hard_fail' | 'soft_fail' | 'permissive' | 'pass_all'; lookups?: number };
    dmarc: { pass: boolean; record: string | null; policy?: 'reject' | 'quarantine' | 'none'; hasRua?: boolean; hasRuf?: boolean; pct?: number };
    dkim: { pass: boolean; selector: string | null };
    https: { pass: boolean; statusCode: number | null };
    blacklists: { list: string; listed: boolean; blocked?: boolean }[];
    httpsRedirect?: { pass: boolean };
    ssl?: { pass: boolean; daysUntilExpiry: number | null; expiresAt: string | null };
    securityHeaders?: { hsts: boolean; xContentTypeOptions: boolean; xFrameOptions: boolean; csp: boolean; referrerPolicy: boolean; permissionsPolicy: boolean };
    tlsVersion?: { protocol: string | null; pass: boolean };
    mtaSts?: {
      pass: boolean;
      policy?: string;
      reason?: 'missing_txt' | 'policy_unreachable' | 'policy_invalid' | 'mode_not_enforce';
    };
    tlsRpt?: { pass: boolean; record: string | null };
    bimi?: { pass: boolean; record: string | null };
    caa?: { pass: boolean; records: string[] };
    nsCount?: { pass: boolean; count: number };
    ptr?: { pass: boolean; hostname: string | null };
    dbl?: { listed: boolean };
    domainExpiry?: { pass: boolean; daysUntilExpiry: number | null; expiresAt: string | null };
    dnssec?: { pass: boolean };
    wwwRedirect?: { pass: boolean; exists: boolean };
    observatory?: { pass: boolean; grade: string | null; score: number | null; pending: boolean };
    safeBrowsing?: { pass: boolean; threats: string[] };
  };
  checkedAt: string;
}
