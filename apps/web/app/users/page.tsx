'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { users as usersApi, type User } from '@/lib/api';
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
import { Plus, Trash2 } from 'lucide-react';

export default function UsersPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [userList, setUserList] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
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
    if (user?.role === 'admin') usersApi.list().then(setUserList);
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const created = await usersApi.create(email, password, role);
      setUserList((prev) => [created, ...prev]);
      setOpen(false);
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

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    await usersApi.remove(id);
    setUserList((prev) => prev.filter((u) => u.id !== id));
  }

  if (isLoading || !user) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--sp-navy)]">Users</h1>
        <Dialog open={open} onOpenChange={setOpen}>
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {userList.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.email}</TableCell>
              <TableCell>
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
              <TableCell className="text-slate-500 text-sm">
                {new Date(u.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
