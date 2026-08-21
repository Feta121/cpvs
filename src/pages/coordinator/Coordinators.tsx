import { useEffect, useState } from 'react';
import { UserPlus, Loader2, Copy, Check, X, Trash2, KeyRound, ShieldCheck, ShieldOff, Crown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../../context/ToastContext';
import { fetchProfilesById } from '../../utils/fetchProfiles';
import { invokeEdgeFunction } from '../../utils/invokeFunction';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import PermissionsFieldset, { DEFAULT_PERMISSIONS, PermissionsValue } from '../../components/coordinator/PermissionsFieldset';
import CoordinatorPermissionsModal from '../../components/coordinator/CoordinatorPermissionsModal';
import type { Profile, Coordinator } from '../../types/database';

type CoordinatorRow = Coordinator & { profile: Profile | null };

const emptyForm = { fullName: '', email: '', phone: '', department: '' };

export default function Coordinators() {
  const { showSuccess, showError } = useToast();
  const { profile } = useAuth();
  const { isSuper } = usePermissions();
  const [coordinators, setCoordinators] = useState<CoordinatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formPermissions, setFormPermissions] = useState<PermissionsValue>(DEFAULT_PERMISSIONS);

  const [permissionsTarget, setPermissionsTarget] = useState<CoordinatorRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CoordinatorRow | null>(null);
  const [pendingReset, setPendingReset] = useState<CoordinatorRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const [issuedCreds, setIssuedCreds] = useState<{ username: string; tempPassword: string; loginEmail: string; forName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadCoordinators();
  }, []);

  async function loadCoordinators() {
    setLoading(true);
    const { data, error } = await supabase.from('coordinators').select('*').order('created_at', { ascending: true });
    if (error) {
      showError('Unable to load coordinators. ' + error.message);
      setLoading(false);
      return;
    }

    try {
      const profileMap = await fetchProfilesById((data ?? []).map((c) => c.id));
      setCoordinators((data ?? []).map((c) => ({ ...c, profile: profileMap.get(c.id) ?? null })));
    } catch (err: any) {
      showError('Unable to load coordinator profiles. ' + (err?.message ?? ''));
      setCoordinators((data ?? []).map((c) => ({ ...c, profile: null })));
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) {
      showError('Unable to add coordinator. Full name is required.');
      return;
    }

    setSubmitting(true);
    const { data, error } = await invokeEdgeFunction('create-coordinator', { ...form, permissions: formPermissions });
    setSubmitting(false);

    if (error) {
      showError(error);
      return;
    }

    setIssuedCreds({ ...(data as any), forName: form.fullName.trim() });
    showSuccess('Coordinator successfully added.');
    setForm(emptyForm);
    setFormPermissions(DEFAULT_PERMISSIONS);
    setShowForm(false);
    loadCoordinators();
  }

  function copyCreds() {
    if (!issuedCreds) return;
    navigator.clipboard.writeText(`Login: ${issuedCreds.username}\nTemporary password: ${issuedCreds.tempPassword}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleResetPassword(c: CoordinatorRow) {
    setPendingReset(null);
    setResettingId(c.id);
    const { data, error } = await invokeEdgeFunction('reset-coordinator-password', { coordinatorId: c.id });
    setResettingId(null);

    if (error) {
      showError(error);
      return;
    }
    // CHANGED: was `c.profile?.email` (the coordinator's personal email)
    // — that's what displayed the gmail address as if it were the login,
    // even though the actual login (username@cpvs.com) still worked
    // correctly under the hood. `c.login_email` (migration 0013) is the
    // real, persisted login credential.
    setIssuedCreds({ username: c.login_email, tempPassword: (data as any).tempPassword, loginEmail: c.login_email, forName: c.profile?.full_name ?? 'Coordinator' });
    showSuccess(`Password reset for ${c.profile?.full_name ?? 'coordinator'}.`);
  }

  function handleDelete(c: CoordinatorRow) {
    setPendingDelete(c);
  }

  async function confirmDelete() {
    const c = pendingDelete;
    if (!c) return;
    setPendingDelete(null);
    setDeletingId(c.id);
    const { error } = await invokeEdgeFunction('delete-coordinator', { coordinatorId: c.id });
    setDeletingId(null);

    if (error) {
      showError(error);
      return;
    }
    showSuccess(`${c.profile?.full_name ?? 'Coordinator'} deleted.`);
    loadCoordinators();
  }

  if (loading) return <FullScreenLoader label="Loading coordinators…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Coordinators</h1>
          <p className="mt-1 text-sm text-ink-500">
            {isSuper ? 'Manage coordinator accounts and permissions.' : 'Everyone with coordinator access to CPVS.'}
          </p>
        </div>
        {/* Add/edit/delete/reset-password are Super Coordinator only — a
            regular coordinator sees this whole page as a read-only
            directory, per spec. */}
        {isSuper && (
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
            <UserPlus size={16} /> Add coordinator
          </button>
        )}
      </div>

      {issuedCreds && (
        <div className="surface-card border-l-4 border-l-vital-500 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-900">
                Credentials for {issuedCreds.forName} — share these securely.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span><strong>Login:</strong> {issuedCreds.username}</span>
                <span><strong>Temp password:</strong> {issuedCreds.tempPassword}</span>
                <button onClick={copyCreds} className="btn-secondary !py-1.5 !px-3">
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button onClick={() => setIssuedCreds(null)} className="text-ink-300 hover:text-ink-500">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {showForm && isSuper && (
        <form onSubmit={handleCreate} className="surface-card space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Full name</label>
              <input required className="input-field" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Personal email (optional)</label>
              <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Phone (optional)</label>
              <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Department (optional)</label>
              <input className="input-field" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-ink-700">Initial permissions</p>
            <PermissionsFieldset value={formPermissions} onChange={setFormPermissions} hideActiveToggle />
          </div>

          <p className="text-xs text-ink-500">
            The login username is generated automatically from the first name (e.g. "Kedir Hassen" → login "kedir482@cpvs.com"). A temporary password is generated and shown once after creation.
          </p>

          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Create coordinator account
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="surface-card overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-surface-line text-xs uppercase tracking-wide text-ink-300">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Username</th>
              <th className="px-5 py-3 font-medium">Department</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Status</th>
              {isSuper && <th className="px-5 py-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-line">
            {coordinators.map((c) => {
              const isSelf = c.id === profile?.id;
              return (
                <tr key={c.id}>
                  <td className="px-5 py-3 font-medium text-ink-900">
                    {c.profile?.full_name ?? '(profile missing)'} {isSelf && <span className="text-ink-300">(you)</span>}
                  </td>
                  <td className="px-5 py-3 text-ink-500">{c.profile?.email ?? '—'}</td>
                  <td className="px-5 py-3 text-ink-500">{c.login_email}</td>
                  <td className="px-5 py-3 text-ink-500">{c.department ?? '—'}</td>
                  <td className="px-5 py-3">
                    {c.is_super_coordinator ? (
                      <Badge tone="clinical"><Crown size={11} className="mr-1 inline" />Super Coordinator</Badge>
                    ) : (
                      <Badge tone="neutral">Coordinator</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {c.is_active ? <Badge tone="present">Active</Badge> : <Badge tone="expired">Deactivated</Badge>}
                  </td>
                  {isSuper && (
                    <td className="px-5 py-3">
                      {isSelf ? (
                        <span className="text-xs text-ink-300">Manage your own account from Settings</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setPermissionsTarget(c)}
                            title="Edit permissions"
                            className="rounded-lg border border-surface-line p-1.5 text-ink-500 hover:bg-surface-muted"
                          >
                            {c.is_active ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                          </button>
                          <button
                            onClick={() => setPendingReset(c)}
                            disabled={resettingId === c.id}
                            title="Reset password"
                            className="rounded-lg border border-surface-line p-1.5 text-ink-500 hover:bg-surface-muted"
                          >
                            {resettingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            disabled={deletingId === c.id}
                            title="Delete coordinator"
                            className="theme-danger-btn rounded-lg border border-status-expired/30 p-1.5 text-status-expired hover:bg-status-expired/5"
                          >
                            {deletingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {permissionsTarget && (
        <CoordinatorPermissionsModal
          coordinator={permissionsTarget}
          fullName={permissionsTarget.profile?.full_name ?? 'this coordinator'}
          onClose={() => setPermissionsTarget(null)}
          onSaved={() => {
            setPermissionsTarget(null);
            loadCoordinators();
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete ${pendingDelete?.profile?.full_name ?? 'this coordinator'}?`}
        message="This PERMANENTLY deletes their login and coordinator record. This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={!!pendingReset}
        title={`Reset password for ${pendingReset?.profile?.full_name ?? 'this coordinator'}?`}
        message={`This immediately invalidates their current password — they will not be able to log in until you relay the new temporary password shown after this. Username: ${pendingReset?.login_email ?? ''}`}
        confirmLabel="Reset password"
        confirmText="RESET"
        onConfirm={() => pendingReset && handleResetPassword(pendingReset)}
        onCancel={() => setPendingReset(null)}
      />
    </div>
  );
}
