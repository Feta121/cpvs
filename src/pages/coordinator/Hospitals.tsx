import { useEffect, useState } from 'react';
import { Plus, Hospital as HospitalIcon, Loader2, Pencil, Trash2, Power, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Badge from '../../components/ui/Badge';
import MapPicker from '../../components/ui/MapPicker';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Hospital } from '../../types/database';

const emptyForm = {
  name: '',
  address: '',
  latitude: '' as string,
  longitude: '' as string,
  radius_meters: '150',
  checkin_start_time: '09:00',
  session_expires_at: '15:00',
};

export default function CoordinatorHospitals() {
  const { coordinator } = useAuth();
  const { showSuccess, showError } = useToast();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('hospitals').select('*').order('name');
    if (error) {
      showError('Unable to load hospitals. ' + error.message);
    } else {
      setHospitals(data ?? []);
    }
    setLoading(false);
  }

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEditForm(h: Hospital) {
    setEditingId(h.id);
    setForm({
      name: h.name,
      address: h.address ?? '',
      latitude: String(h.latitude),
      longitude: String(h.longitude),
      radius_meters: String(h.radius_meters),
      checkin_start_time: h.checkin_start_time.slice(0, 5),
      session_expires_at: h.session_expires_at.slice(0, 5),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleMapPick(lat: number, lng: number) {
    setForm((f) => ({ ...f, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const radius = parseInt(form.radius_meters, 10);

    if (!form.name.trim()) {
      showError('Unable to save hospital. Hospital name is required.');
      return;
    }
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      showError('Unable to save hospital. Latitude must be a decimal between -90 and 90 — click the map or enter it manually.');
      return;
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      showError('Unable to save hospital. Longitude must be a decimal between -180 and 180 — click the map or enter it manually.');
      return;
    }
    if (Number.isNaN(radius) || radius <= 0) {
      showError('Unable to save hospital. Radius must be a positive number of meters.');
      return;
    }
    if (form.checkin_start_time >= form.session_expires_at) {
      showError('Unable to save hospital. Session expiry time must be after the check-in start time.');
      return;
    }

    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      latitude: lat,
      longitude: lng,
      radius_meters: radius,
      checkin_start_time: form.checkin_start_time,
      session_expires_at: form.session_expires_at,
    };

    const { error } = editingId
      ? await supabase.from('hospitals').update(payload).eq('id', editingId)
      : await supabase.from('hospitals').insert({ ...payload, created_by: coordinator?.id, is_active: true });

    setSubmitting(false);

    if (error) {
      showError(`Unable to ${editingId ? 'update' : 'add'} hospital. ${error.message}`);
      return;
    }

    showSuccess(`Hospital ${editingId ? 'updated' : 'added'} successfully.`);
    closeForm();
    load();
  }

  async function toggleActive(h: Hospital) {
    const { error } = await supabase.from('hospitals').update({ is_active: !h.is_active }).eq('id', h.id);
    if (error) {
      showError('Unable to update hospital status. ' + error.message);
      return;
    }
    showSuccess(`${h.name} ${h.is_active ? 'deactivated' : 'activated'}.`);
    load();
  }

  async function handleDelete(h: Hospital) {
    if (!window.confirm(`Delete "${h.name}"? This cannot be undone. Hospitals with existing rotations or attendance history can't be deleted — deactivate them instead.`)) {
      return;
    }
    setDeletingId(h.id);
    const { error } = await supabase.from('hospitals').delete().eq('id', h.id);
    setDeletingId(null);

    if (error) {
      // Most likely a foreign key violation (rotations/attendance reference
      // this hospital) — that's expected and desired: we never want to
      // silently orphan attendance history. Guide the coordinator to the
      // safe alternative instead of showing a raw Postgres error.
      if (error.message.toLowerCase().includes('foreign key') || error.code === '23503') {
        showError(`Unable to delete "${h.name}" — it has existing rotations or attendance records. Deactivate it instead to hide it from new assignments while preserving history.`);
      } else {
        showError('Unable to delete hospital. ' + error.message);
      }
      return;
    }
    showSuccess(`"${h.name}" deleted.`);
    load();
  }

  if (loading) return <FullScreenLoader label="Loading hospitals…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Hospitals</h1>
          <p className="mt-1 text-sm text-ink-500">Configure GPS geofences for each clinical site.</p>
        </div>
        <button onClick={openAddForm} className="btn-primary">
          <Plus size={16} /> Add hospital
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="surface-card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-ink-900">{editingId ? 'Edit hospital' : 'Add hospital'}</h2>
            <button type="button" onClick={closeForm} className="text-ink-300 hover:text-ink-500">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Hospital name</label>
              <input required className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Address / location</label>
              <input className="input-field" placeholder="e.g. Sidist Kilo, Addis Ababa" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Pick location on map</label>
              <MapPicker
                latitude={form.latitude ? parseFloat(form.latitude) : null}
                longitude={form.longitude ? parseFloat(form.longitude) : null}
                radiusMeters={parseInt(form.radius_meters, 10) || 150}
                onChange={handleMapPick}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Latitude</label>
              <input
                required
                type="number"
                step="0.0000001"
                min={-90}
                max={90}
                className="input-field font-mono"
                placeholder="e.g. 9.0201"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Longitude</label>
              <input
                required
                type="number"
                step="0.0000001"
                min={-180}
                max={180}
                className="input-field font-mono"
                placeholder="e.g. 38.7500"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Geofence radius (meters)</label>
              <input required type="number" min={1} className="input-field" value={form.radius_meters} onChange={(e) => setForm({ ...form, radius_meters: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Check-in start time</label>
              <input required type="time" className="input-field" value={form.checkin_start_time} onChange={(e) => setForm({ ...form, checkin_start_time: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Session expires at</label>
              <input required type="time" className="input-field" value={form.session_expires_at} onChange={(e) => setForm({ ...form, session_expires_at: e.target.value })} />
              <p className="mt-1 text-xs text-ink-300">Check-in closes and students become eligible for auto-absent after this time. Defaults to 15:00 (3 PM).</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {editingId ? 'Save changes' : 'Save hospital'}
            </button>
            <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hospitals.map((h) => (
          <div key={h.id} className={`surface-card p-5 ${!h.is_active ? 'opacity-60' : ''}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-clinical-50 text-clinical-600">
                  <HospitalIcon size={16} />
                </div>
                <p className="font-display text-sm font-semibold text-ink-900">{h.name}</p>
              </div>
              <Badge tone={h.is_active ? 'present' : 'neutral'}>{h.is_active ? 'Active' : 'Inactive'}</Badge>
            </div>

            {h.address && <p className="mb-2 text-xs text-ink-500">{h.address}</p>}

            <dl className="space-y-1.5 text-xs text-ink-500">
              <div className="flex justify-between"><dt>Coordinates</dt><dd className="font-mono text-ink-700">{h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}</dd></div>
              <div className="flex justify-between"><dt>Radius</dt><dd>{h.radius_meters}m</dd></div>
              <div className="flex justify-between"><dt>Check-in start</dt><dd>{h.checkin_start_time.slice(0, 5)}</dd></div>
              <div className="flex justify-between"><dt>Session expires</dt><dd>{h.session_expires_at.slice(0, 5)}</dd></div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-surface-line pt-3">
              <button onClick={() => openEditForm(h)} className="btn-secondary min-w-[84px] flex-1 !px-2 !py-1.5 !text-xs">
                <Pencil size={13} /> Edit
              </button>
              <button onClick={() => toggleActive(h)} className="btn-secondary min-w-[84px] flex-1 !px-2 !py-1.5 !text-xs">
                <Power size={13} /> {h.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => handleDelete(h)}
                disabled={deletingId === h.id}
                className="btn-secondary min-w-[84px] flex-1 !px-2 !py-1.5 !text-xs !text-status-expired hover:!border-status-expired/40"
              >
                {deletingId === h.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
