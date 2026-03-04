'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  users as usersApi, domains as domainsApi, settings as settingsApi,
  type User, type Domain, type EmailSettings,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2, ChevronDown, ChevronRight, Globe, Link2, Link2Off,
  Loader2, Mail, Plus, Settings2, Trash2, Users, X,
} from 'lucide-react';

type Tab = 'users' | 'cloudflare' | 'email';

// ── Shared layout ─────────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
        active
          ? 'bg-white text-[var(--sp-navy)] shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

// ── Users tab (ported from /users) ───────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [userList, setUserList] = useState<User[]>([]);
  const [allDomains, setAllDomains] = useState<Domain[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [grantDomainId, setGrantDomainId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    usersApi.list().then(setUserList);
    domainsApi.list().then(setAllDomains);
  }, []);

  function userDomains(uid: string) {
    const owned = allDomains.filter((d) => d.ownerId === uid);
    const delegated = allDomains.filter(
      (d) => d.ownerId !== uid && d.delegatedAccess?.some((a) => a.userId === uid),
    );
    return { owned, delegated };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const created = await usersApi.create(email, password, role);
      setUserList((prev) => [created, ...prev]);
      setAddOpen(false);
      setEmail(''); setPassword(''); setRole('user');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(id: string, newRole: 'admin' | 'user') {
    const updated = await usersApi.updateRole(id, newRole);
    setUserList((prev) => prev.map((u) => (u.id === id ? updated : u)));
  }

  async function handleTierChange(id: string, newTier: 'free' | 'plus' | 'pro') {
    const updated = await usersApi.updateTier(id, newTier);
    setUserList((prev) => prev.map((u) => (u.id === id ? updated : u)));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    await usersApi.remove(id);
    setUserList((prev) => prev.filter((u) => u.id !== id));
  }

  async function handleGrantDomain() {
    if (!grantFor || !grantDomainId) return;
    await domainsApi.delegate(grantDomainId, grantFor);
    const updated = await domainsApi.list();
    setAllDomains(updated);
    setGrantFor(null);
    setGrantDomainId('');
  }

  async function handleRevokeDomain(domainId: string, userId: string) {
    await domainsApi.revokeAccess(domainId, userId);
    setAllDomains((prev) =>
      prev.map((d) =>
        d.id === domainId
          ? { ...d, delegatedAccess: d.delegatedAccess.filter((a) => a.userId !== userId) }
          : d,
      ),
    );
  }

  const grantingToUser = userList.find((u) => u.id === grantFor);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{userList.length} user{userList.length !== 1 ? 's' : ''}</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus size={14} className="mr-1" /> Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'user')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Creating…' : 'Create user'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Grant domain dialog */}
      <Dialog open={!!grantFor} onOpenChange={(o) => { if (!o) { setGrantFor(null); setGrantDomainId(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Grant domain access</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 mt-1">
            Grant <strong>{grantingToUser?.email}</strong> access to a domain.
          </p>
          <div className="space-y-4 mt-2">
            <Select value={grantDomainId} onValueChange={setGrantDomainId}>
              <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
              <SelectContent>
                {allDomains
                  .filter((d) => {
                    if (!grantFor) return false;
                    if (d.ownerId === grantFor) return false;
                    if (d.delegatedAccess?.some((a) => a.userId === grantFor)) return false;
                    return true;
                  })
                  .map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={handleGrantDomain} disabled={!grantDomainId}>
              Grant access
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-8" />
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {userList.map((u) => {
              const { owned, delegated } = userDomains(u.id);
              const totalDomains = owned.length + delegated.length;
              const isExpanded = expanded === u.id;
              return (
                <Fragment key={u.id}>
                  <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(isExpanded ? null : u.id)}>
                    <TableCell className="py-2 pl-3 pr-0">
                      {totalDomains > 0
                        ? isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />
                        : <span className="w-3.5 block" />}
                    </TableCell>
                    <TableCell className="font-medium">
                      {u.email}
                      {totalDomains > 0 && (
                        <Badge variant="outline" className="ml-2 text-xs font-normal text-slate-400">
                          {totalDomains} domain{totalDomains !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v as 'admin' | 'user')} disabled={u.id === currentUserId}>
                        <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={u.tier ?? 'free'} onValueChange={(v) => handleTierChange(u.id, v as 'free' | 'plus' | 'pro')}>
                        <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free"><span className="text-slate-500">Free</span></SelectItem>
                          <SelectItem value="plus"><span className="text-sky-600">Plus</span></SelectItem>
                          <SelectItem value="pro"><span className="text-violet-600">Pro</span></SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {u.id !== currentUserId && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(u.id)}>
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                      <TableCell />
                      <TableCell colSpan={4} className="py-3">
                        <div className="space-y-2.5">
                          {owned.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-14 shrink-0">Owns</span>
                              {owned.map((d) => (
                                <span key={d.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                                  <Globe size={10} />{d.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {delegated.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-14 shrink-0">Access</span>
                              {delegated.map((d) => (
                                <span key={d.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  <Globe size={10} />{d.name}
                                  <button onClick={(e) => { e.stopPropagation(); handleRevokeDomain(d.id, u.id); }} className="ml-0.5 hover:text-red-500 transition-colors">
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 text-xs text-slate-400 hover:text-slate-700 px-2"
                            onClick={(e) => { e.stopPropagation(); setGrantFor(u.id); setGrantDomainId(''); }}>
                            <Plus size={11} className="mr-1" /> Grant domain access
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Cloudflare tab ────────────────────────────────────────────────────────────

function CloudflareTab({ currentUser }: { currentUser: { id: string; role: string } }) {
  const [domainList, setDomainList] = useState<Domain[]>([]);
  const [cfOpen, setCfOpen] = useState<string | null>(null);
  const [cfToken, setCfToken] = useState('');
  const [cfSaving, setCfSaving] = useState(false);
  const [cfError, setCfError] = useState('');

  useEffect(() => {
    domainsApi.list().then(setDomainList);
  }, []);

  async function handleConnect(domainId: string, e: React.FormEvent) {
    e.preventDefault();
    setCfError('');
    setCfSaving(true);
    try {
      await domainsApi.connectCloudflare(domainId, cfToken.trim());
      setDomainList((prev) => prev.map((d) => d.id === domainId ? { ...d, cloudflareConnected: true } : d));
      setCfOpen(null);
      setCfToken('');
    } catch (err: any) {
      setCfError(err.message ?? 'Connection failed');
    } finally {
      setCfSaving(false);
    }
  }

  async function handleDisconnect(domainId: string) {
    if (!confirm('Disconnect Cloudflare from this domain?')) return;
    await domainsApi.disconnectCloudflare(domainId);
    setDomainList((prev) => prev.map((d) => d.id === domainId ? { ...d, cloudflareConnected: false } : d));
  }

  const canManageDomain = (d: Domain) => currentUser.role === 'admin' || d.ownerId === currentUser.id;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Connect a scoped Cloudflare API token to each domain to enable one-click DNS fixes.
        Each token needs <strong>Zone → DNS → Edit</strong> permission for that zone.
      </p>

      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Domain</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Cloudflare</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {domainList.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-sm text-slate-500">
                  {d.ownerId === currentUser.id ? 'You' : d.ownerId.slice(0, 8) + '…'}
                </TableCell>
                <TableCell>
                  {d.cloudflareConnected
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><Link2 size={11} />Connected</Badge>
                    : <Badge variant="outline" className="text-slate-400 gap-1"><Link2Off size={11} />Not connected</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  {canManageDomain(d) && (
                    d.cloudflareConnected ? (
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 text-xs"
                        onClick={() => handleDisconnect(d.id)}>
                        Disconnect
                      </Button>
                    ) : (
                      <Dialog open={cfOpen === d.id} onOpenChange={(o) => { if (!o) { setCfOpen(null); setCfToken(''); setCfError(''); } }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setCfOpen(d.id)}>
                            <Link2 size={12} /> Connect
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Connect Cloudflare — {d.name}</DialogTitle></DialogHeader>
                          <p className="text-sm text-slate-500 mt-1">
                            Provide a scoped API token with <strong>Zone → DNS → Edit</strong> permission for <strong>{d.name}</strong>.
                          </p>
                          <form onSubmit={(e) => handleConnect(d.id, e)} className="space-y-4 mt-2">
                            <div className="space-y-2">
                              <Label>API Token</Label>
                              <Input type="password" placeholder="Cloudflare API token"
                                value={cfToken} onChange={(e) => setCfToken(e.target.value)}
                                required autoComplete="off" />
                            </div>
                            {cfError && <Alert variant="destructive"><AlertDescription>{cfError}</AlertDescription></Alert>}
                            <Button type="submit" className="w-full" disabled={cfSaving || !cfToken.trim()}>
                              {cfSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
                              {cfSaving ? 'Validating…' : 'Connect'}
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Email tab ─────────────────────────────────────────────────────────────────

function EmailTab() {
  const [current, setCurrent] = useState<EmailSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [domain, setDomain] = useState('');
  const [from, setFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    settingsApi.getEmail().then((cfg) => {
      setCurrent(cfg);
      setDomain(cfg.domain ?? '');
      setFrom(cfg.from ?? '');
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      const body: { apiKey?: string; domain?: string; from?: string } = {
        domain: domain.trim() || undefined,
        from: from.trim() || undefined,
      };
      // Only send apiKey if user typed one (empty = keep existing)
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      await settingsApi.setEmail(body);
      const updated = await settingsApi.getEmail();
      setCurrent(updated);
      setApiKey('');
      setSaved(true);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!confirm('Remove Mailgun configuration? Email reports will stop until reconfigured.')) return;
    await settingsApi.setEmail({ apiKey: '', domain: '', from: '' });
    setCurrent(await settingsApi.getEmail());
    setDomain(''); setFrom(''); setApiKey('');
  }

  return (
    <div className="max-w-lg space-y-6">
      {current && (
        <div className={`rounded-lg p-4 flex items-start gap-3 ${current.configured ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
          {current.configured
            ? <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            : <Mail size={16} className="text-slate-400 mt-0.5 shrink-0" />}
          <div>
            <p className={`text-sm font-medium ${current.configured ? 'text-emerald-700' : 'text-slate-600'}`}>
              {current.configured ? 'Mailgun configured' : 'Mailgun not configured'}
            </p>
            {current.configured && (
              <p className="text-xs text-emerald-600 mt-0.5">
                Sending from <strong>{current.domain}</strong>
                {current.source === 'env' && ' (via environment variable)'}
              </p>
            )}
            {!current.configured && (
              <p className="text-xs text-slate-500 mt-0.5">
                Email reports are disabled. Fill in the form below to enable them.
              </p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={current?.apiKey ? `Current: ${current.apiKey} — leave blank to keep` : 'key-xxxxxxxxxxxxxxxx'}
            autoComplete="off"
          />
          <p className="text-xs text-slate-400">Leave blank to keep the existing key.</p>
        </div>

        <div className="space-y-2">
          <Label>Mailgun Domain</Label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="mg.yourdomain.com"
          />
        </div>

        <div className="space-y-2">
          <Label>From Address <span className="text-slate-400 font-normal">(optional)</span></Label>
          <Input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder={`SureSend <noreply@${domain || 'mg.yourdomain.com'}>`}
          />
          <p className="text-xs text-slate-400">Defaults to <code>noreply@&lt;domain&gt;</code> if left blank.</p>
        </div>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {saved && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
            <AlertDescription><CheckCircle2 size={14} className="inline mr-2" />Settings saved.</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
            Save
          </Button>
          {current?.configured && (
            <Button type="button" variant="outline" className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('users');

  useEffect(() => {
    if (!isLoading && !user) { router.replace('/login'); return; }
    if (!isLoading && user?.role !== 'admin') { router.replace('/dashboard'); return; }
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings2 size={22} className="text-[var(--sp-navy)]" />
        <h1 className="text-2xl font-bold text-[var(--sp-navy)]">Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={Users} label="Users" />
        <TabButton active={tab === 'cloudflare'} onClick={() => setTab('cloudflare')} icon={Link2} label="Cloudflare" />
        <TabButton active={tab === 'email'} onClick={() => setTab('email')} icon={Mail} label="Email" />
      </div>

      {/* Tab content */}
      {tab === 'users' && <UsersTab currentUserId={user.id} />}
      {tab === 'cloudflare' && <CloudflareTab currentUser={user} />}
      {tab === 'email' && <EmailTab />}
    </div>
  );
}
