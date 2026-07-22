import { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function StudentProfile() {
  const { profile, student, refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    const path = `${profile.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
      await supabase.from('profiles').update({ photo_url: data.publicUrl }).eq('id', profile.id);
      await refreshProfile();
    }
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
      <h1 className="font-display text-2xl font-semibold text-ink-900">My profile</h1>

      <div className="surface-card p-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-vital-100 text-2xl font-semibold text-vital-700">
              {profile.photo_url ? (
                <img src={profile.photo_url} alt={profile.full_name} className="h-full w-full object-cover" />
              ) : (
                profile.full_name[0]?.toUpperCase()
              )}
            </div>
            <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-clinical-600 text-white shadow-md">
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </label>
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-ink-900">{profile.full_name}</p>
            <p className="text-sm text-ink-500">{student.student_id}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-surface-line pt-6 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-300">{f.label}</p>
              <p className="mt-1 text-sm text-ink-900">{f.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
