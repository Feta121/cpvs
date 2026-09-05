import { useState } from 'react';
import { Camera, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function StudentProfile() {
  const { profile, student, refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    setUploadError(null);

    // The photo goes into a folder named after the student's own user id.
    // The storage policies in migration 0014 rely on that first path
    // segment to decide who may write here — keep the `${profile.id}/`
    // prefix or the upload will be rejected.
    const path = `${profile.id}/${Date.now()}-${file.name}`;
    const { error: storageError } = await supabase.storage
      .from('profile-photos')
      .upload(path, file, { upsert: true });

    // This used to be `if (!error) { … }` with no else branch: when the
    // upload failed the page just stopped, showing no message and no new
    // photo. That hid a real outage — the `profile-photos` bucket did not
    // exist at all (migration 0014 creates it), so every upload since launch
    // failed silently and students had no way to know why.
    if (storageError) {
      setUploadError(storageError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ photo_url: data.publicUrl })
      .eq('id', profile.id);
    if (profileError) {
      setUploadError(profileError.message);
      setUploading(false);
      return;
    }

    await refreshProfile();
    setUploading(false);
  }

  if (!profile || !student) return null;

  const fields = [
    { label: 'Full name', value: profile.full_name },
    { label: 'CPVS ID', value: student.student_id },
    { label: 'Student ID (University ID)', value: student.university_id ?? '—' },
    { label: 'Email', value: profile.email },
    { label: 'Phone', value: profile.phone ?? '—' },
    { label: 'Department', value: student.department },
    { label: 'Program', value: student.program ?? student.department },
    { label: 'Institution', value: student.institution },
    { label: 'Year', value: `Year ${student.year}` },
    { label: 'Batch', value: student.batch },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-semibold tracking-tightest text-ink-900">My profile</h1>

      {uploadError && (
        <div className="relative flex items-start gap-2.5 overflow-hidden rounded-xl2 bg-status-expired/8 px-4 py-3 text-sm text-status-expired ring-1 ring-inset ring-status-expired/25">
          <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-status-expired" />
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="leading-relaxed">Could not update your photo: {uploadError}</span>
        </div>
      )}

      <div className="surface-card relative overflow-hidden p-6">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-vital-500 via-clinical-500 to-transparent" />
        <span className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-vital-500/10 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-vital-400 to-clinical-500 text-2xl font-bold text-onAccent shadow-glow-accent ring-2 ring-surface">
              {profile.photo_url ? (
                <img src={profile.photo_url} alt={profile.full_name} className="h-full w-full object-cover" />
              ) : (
                profile.full_name[0]?.toUpperCase()
              )}
            </div>
            <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-clinical-500 to-clinical-600 text-onPrimary shadow-lift ring-2 ring-surface transition-transform duration-300 ease-spring hover:scale-110">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </label>
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-semibold tracking-tightest text-ink-900">{profile.full_name}</p>
            <p className="mt-0.5 text-sm tabular-nums text-ink-500">{student.student_id}</p>
            <p className="mt-2 inline-flex"><span className="chip">{student.program ?? student.department} · Year {student.year}</span></p>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-1 gap-2.5 border-t border-surface-line pt-6 sm:grid-cols-2">
          {fields.map((f) => (
            <div
              key={f.label}
              className="rounded-xl2 border border-surface-line bg-surface-alt/40 p-3.5 transition-all duration-300 ease-spring hover:border-transparent hover:bg-surface hover:shadow-lift"
            >
              <p className="section-label">{f.label}</p>
              <p className="mt-1 truncate text-sm font-semibold text-ink-900">{f.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
