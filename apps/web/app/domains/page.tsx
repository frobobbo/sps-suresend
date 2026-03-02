'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { domains as domainsApi, users as usersApi, type Domain, type User } from '@/lib/api';
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
import { Plus, Trash2, UserPlus } from 'lucide-react';

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
    domainsApi.list().then(setDomainList);
    if (user.role === 'admin') usersApi.list().then(setAllUsers);
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

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete domain "${name}"?`)) return;
    await domainsApi.remove(id);
    setDomainList((prev) => prev.filter((d) => d.id !== id));
  }

  if (isLoading || !user) return null;

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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Domain</TableHead>
            <TableHead>Reputation</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {domainList.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                <Link href={`/domains/${d.id}`} className="font-medium text-[var(--sp-blue)] hover:underline">
                  {d.name}
                </Link>
              </TableCell>
              <TableCell>{statusBadge(undefined)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {d.delegatedAccess?.length ?? 0} delegated
                  </span>
                  {(user.role === 'admin' || d.ownerId === user.id) && allUsers.length > 0 && (
                    <Dialog
                      open={delegateOpen === d.id}
                      onOpenChange={(o) => setDelegateOpen(o ? d.id : null)}
                    >
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                          <UserPlus size={12} className="mr-1" /> Grant
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Delegate access to {d.name}</DialogTitle></DialogHeader>
                        <div className="space-y-4 mt-2">
                          <Select value={targetUserId} onValueChange={setTargetUserId}>
                            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                            <SelectContent>
                              {allUsers
                                .filter((u) => u.id !== d.ownerId)
                                .map((u) => (
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
                </div>
              </TableCell>
              <TableCell className="text-slate-500 text-sm">
                {new Date(d.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                {(user.role === 'admin' || d.ownerId === user.id) && (
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
