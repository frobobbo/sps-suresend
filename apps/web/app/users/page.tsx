'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { users as usersApi, domains as domainsApi, type User, type Domain } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronDown, ChevronRight, Globe, Plus, Trash2, X } from 'lucide-react';

export default function UsersPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
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
    if (!isLoading && !user) { router.replace('/login'); return; }
    if (!isLoading && user?.role !== 'admin') { router.replace('/dashboard'); return; }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    usersApi.list().then(setUserList);
    domainsApi.list().then(setAllDomains);
  }, [user]);

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
    await domainsApi.delegate(grantDomainId, { userId: grantFor });
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

  if (isLoading || !user) return null;

  const grantingToUser = userList.find((u) => u.id === grantFor);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--sp-navy)]">Users</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-1" /> Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
            </DialogHeader>
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

      {/* Grant domain access dialog (triggered from expanded user rows) */}
      <Dialog
        open={!!grantFor}
        onOpenChange={(o) => { if (!o) { setGrantFor(null); setGrantDomainId(''); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant domain access</DialogTitle>
          </DialogHeader>
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
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
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
                  <TableRow
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpanded(isExpanded ? null : u.id)}
                  >
                    <TableCell className="py-2 pl-3 pr-0">
                      {totalDomains > 0 ? (
                        isExpanded
                          ? <ChevronDown size={14} className="text-slate-400" />
                          : <ChevronRight size={14} className="text-slate-400" />
                      ) : (
                        <span className="w-3.5 block" />
                      )}
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
                      <Select
                        value={u.role}
                        onValueChange={(v) => handleRoleChange(u.id, v as 'admin' | 'user')}
                        disabled={u.id === user.id}
                      >
                        <SelectTrigger className="w-24 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={u.tier ?? 'free'}
                        onValueChange={(v) => handleTierChange(u.id, v as 'free' | 'plus' | 'pro')}
                      >
                        <SelectTrigger className="w-24 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">
                            <span className="text-slate-500">Free</span>
                          </SelectItem>
                          <SelectItem value="plus">
                            <span className="text-sky-600">Plus</span>
                          </SelectItem>
                          <SelectItem value="pro">
                            <span className="text-violet-600">Pro</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {u.id !== user.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(u.id)}
                        >
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
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-14 shrink-0">
                                Owns
                              </span>
                              {owned.map((d) => (
                                <span
                                  key={d.id}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200"
                                >
                                  <Globe size={10} />
                                  {d.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {delegated.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-14 shrink-0">
                                Access
                              </span>
                              {delegated.map((d) => (
                                <span
                                  key={d.id}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                                >
                                  <Globe size={10} />
                                  {d.name}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRevokeDomain(d.id, u.id); }}
                                    className="ml-0.5 hover:text-red-500 transition-colors"
                                    title={`Revoke access to ${d.name}`}
                                  >
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-slate-400 hover:text-slate-700 px-2"
                              onClick={(e) => { e.stopPropagation(); setGrantFor(u.id); setGrantDomainId(''); }}
                            >
                              <Plus size={11} className="mr-1" /> Grant domain access
                            </Button>
                          </div>
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
