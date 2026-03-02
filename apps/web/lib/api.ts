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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
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

  me: () => apiFetch<{ id: string; email: string; role: string }>('/auth/me'),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = {
  list: () => apiFetch<User[]>('/users'),

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

  delegate: (domainId: string, userId: string) =>
    apiFetch(`/domains/${domainId}/access`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  revokeAccess: (domainId: string, userId: string) =>
    apiFetch<void>(`/domains/${domainId}/access/${userId}`, { method: 'DELETE' }),
};

// ─── Reputation ───────────────────────────────────────────────────────────────

export const reputation = {
  list: (domainId: string) =>
    apiFetch<ReputationCheck[]>(`/domains/${domainId}/reputation`),

  runCheck: (domainId: string) =>
    apiFetch<ReputationCheck>(`/domains/${domainId}/reputation/check`, {
      method: 'POST',
    }),
};

// ─── Types (mirrored from shared for client use) ──────────────────────────────

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
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
  createdAt: string;
}

export interface ReputationCheck {
  id: string;
  domainId: string;
  score: number;
  status: 'clean' | 'warning' | 'blacklisted';
  details: {
    mx: { pass: boolean; records: string[] };
    spf: { pass: boolean; record: string | null };
    dmarc: { pass: boolean; record: string | null };
    dkim: { pass: boolean; selector: string | null };
    https: { pass: boolean; statusCode: number | null };
    blacklists: { list: string; listed: boolean; blocked?: boolean }[];
  };
  checkedAt: string;
}
