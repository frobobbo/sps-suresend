'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { domains as domainsApi, reputation as repApi, users as usersApi, type Domain, type ReputationCheck, type User } from '@/lib/api';
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
import { Plus, Trash2, X } from 'lucide-react';

function statusBadge(status?: string) {
  if (!status) return <Badge variant="outline" className="text-slate-400">Unchecked</Badge>;
  const cls = status === 'clean'
    ? 'bg-emerald-100 text-emerald-700 border-0'
    : status === 'warning'
    ? 'bg-amber-100 text-amber-700 border-0'
    : 'bg-red-100 text-red-700 border-0';
  return <Badge className={cls}>{status}</Badge>;
}

export default function DomainsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [domainList, setDomainList] = useState<Domain[]>([]);
  const [latestRep, setLatestRep] = useState<Record<string, ReputationCheck | undefined>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    domainsApi.list().then((list) => {
      setDomainList(list);
      Promise.all(
        list.map((d) => repApi.list(d.id).then((checks) => [d.id, checks[0]] as const)),
      ).then((entries) =>
        setLatestRep(Object.fromEntries(entries.filter(([, c]) => c !== undefined))),
      );
    });
    // Load all users for delegation (GET /users is now open to all authenticated users)
    usersApi.list().then(setAllUsers);
  }, [user]);

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const created = await domainsApi.create(newDomain.trim());
      setDomainList((prev) => [created, ...prev]);
      setAddOpen(false);
      setNewDomain('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelegate(domainId: string) {
    if (!targetUserId) return;
    await domainsApi.delegate(domainId, targetUserId);
    const updated = await domainsApi.list();
    setDomainList(updated);
    setDelegateOpen(null);
    setTargetUserId('');
  }

  async function handleRevoke(domainId: string, userId: string) {
    await domainsApi.revokeAccess(domainId, userId);
    setDomainList((prev) =>
      prev.map((d) =>
        d.id === domainId
          ? { ...d, delegatedAccess: d.delegatedAccess.filter((a) => a.userId !== userId) }
          : d,
      ),
    );
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete domain "${name}"?`)) return;
    await domainsApi.remove(id);
    setDomainList((prev) => prev.filter((d) => d.id !== id));
  }

  if (isLoading || !user) return null;

  const canManage = (d: Domain) => user.role === 'admin' || d.ownerId === user.id;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--sp-navy)]">Domains</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-1" /> Add Domain</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Domain</DialogTitle></DialogHeader>
            <form onSubmit={handleAddDomain} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Domain name</Label>
                <Input
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  required
                />
              </div>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Adding…' : 'Add domain'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Domain</TableHead>
              <TableHead>Reputation</TableHead>
              <TableHead>Delegated Access</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {domainList.map((d) => {
              const grantable = allUsers.filter(
                (u) => u.id !== d.ownerId && !d.delegatedAccess?.some((a) => a.userId === u.id),
              );
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/domains/${d.id}`} className="font-medium text-[var(--sp-blue)] hover:underline">
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell>{statusBadge(latestRep[d.id]?.status)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Delegated user chips */}
                      {d.delegatedAccess?.map((a) => (
                        <span
                          key={a.userId}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                        >
                          {a.user?.email ?? a.userId}
                          {canManage(d) && (
                            <button
                              onClick={() => handleRevoke(d.id, a.userId)}
                              className="ml-0.5 hover:text-red-500 transition-colors"
                              title={`Revoke access for ${a.user?.email}`}
                            >
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      ))}

                      {/* Grant button — only shown to owner/admin when there are users to grant */}
                      {canManage(d) && grantable.length > 0 && (
                        <Dialog
                          open={delegateOpen === d.id}
                          onOpenChange={(o) => { setDelegateOpen(o ? d.id : null); setTargetUserId(''); }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-400 hover:text-slate-700">
                              <Plus size={11} className="mr-1" />
                              {d.delegatedAccess?.length ? 'Add' : 'Grant access'}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Grant access — {d.name}</DialogTitle></DialogHeader>
                            <div className="space-y-4 mt-2">
                              <Select value={targetUserId} onValueChange={setTargetUserId}>
                                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                                <SelectContent>
                                  {grantable.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button className="w-full" onClick={() => handleDelegate(d.id)} disabled={!targetUserId}>
                                Grant access
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {!d.delegatedAccess?.length && !canManage(d) && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {canManage(d) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(d.id, d.name)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
