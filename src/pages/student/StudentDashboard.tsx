import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hospital as HospitalIcon, UserRound, Percent, CheckCircle2, Megaphone, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import FullScreenLoader from '../../components/ui/FullScreenLoader';
import type { Rotation, Hospital, Profile, AttendanceRecord, Announcement } from '../../types/database';

export default function StudentDashboard() {
  const { profile, student } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState<(Rotation & { hospital: Hospital; coordinator: Profile }) | null>(null);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!student) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);

      const { data: rotationData } = await supabase
        .from('rotations')
        .select('*, hospital:hospitals(*), coordinator:profiles!rotations_coordinator_id_fkey(*)')
        .eq('student_id', student.id)
        .eq('status', 'active')
        .maybeSingle();
      setRotation(rotationData as any);

      const { data: allAttendance } = await supabase
        .from('attendance')
        .select('status')
        .eq('student_id', student.id);
      if (allAttendance && allAttendance.length > 0) {
        const presentLike = allAttendance.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'very_late').length;
        setAttendancePct(Math.round((presentLike / allAttendance.length) * 100));
      } else {
        setAttendancePct(null);
      }

      const { data: todayData } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', student.id)
        .eq('date', today)
        .maybeSingle();
      setTodayRecord(todayData);

      const { data: ann } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
      setAnnouncements(ann ?? []);

      setLoading(false);
    })();
  }, [student]);

  if (loading) return <FullScreenLoader label="Loading your dashboard…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Welcome back, {profile?.full_name?.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-500">Here's where your clinical rotation stands today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hospital rotation" value={rotation?.hospital?.name ?? 'Unassigned'} icon={HospitalIcon} tone="clinical" />
        <StatCard label="Coordinator" value={rotation?.coordinator?.full_name ?? '—'} icon={UserRound} tone="vital" />
        <StatCard label="Attendance rate" value={attendancePct !== null ? `${attendancePct}%` : '—'} icon={Percent} tone="clinical" />
        <StatCard
          label="Today's status"
          value={todayRecord ? todayRecord.status.replace('_', ' ') : 'Not checked in'}
          icon={CheckCircle2}
          tone={todayRecord?.status === 'present' ? 'vital' : todayRecord ? 'late' : 'clinical'}
        />
      </div>

      {student?.late_attendance_concern && (
        <div className="rounded-xl2 border border-status-verylate/30 bg-status-verylate/5 px-5 py-4 text-sm text-status-verylate">
          You've been flagged with a <strong>Late Attendance Concern</strong> for this rotation. Please speak with your coordinator.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="surface-card lg:col-span-2 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-ink-900">Today's check-in</h2>
            <Link to="/student/attendance" className="flex items-center gap-1 text-sm font-medium text-clinical-600 hover:text-clinical-700">
              Go to check-in <ArrowRight size={14} />
            </Link>
          </div>
          {todayRecord ? (
            <div className="flex items-center gap-3">
              <Badge tone={todayRecord.status === 'present' ? 'present' : todayRecord.status === 'late' ? 'late' : todayRecord.status === 'very_late' ? 'verylate' : 'expired'} dot>
                {todayRecord.status.replace('_', ' ')}
              </Badge>
              <span className="text-sm text-ink-500">
                Checked in at {todayRecord.check_in_time ? new Date(todayRecord.check_in_time).toLocaleTimeString() : '—'}
              </span>
            </div>
          ) : (
            <p className="text-sm text-ink-500">You haven't checked in yet today. Head to the check-in page when you arrive at your hospital.</p>
          )}
        </div>

        <div className="surface-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Megaphone size={16} className="text-clinical-600" />
            <h2 className="font-display text-base font-semibold text-ink-900">Announcements</h2>
          </div>
          <div className="space-y-3">
            {announcements.length === 0 && <p className="text-sm text-ink-500">No announcements yet.</p>}
            {announcements.map((a) => (
              <div key={a.id} className="rounded-xl border border-surface-line p-3">
                <div className="flex items-center gap-2">
                  {a.type === 'emergency' && <Badge tone="expired">Urgent</Badge>}
                  <p className="text-sm font-medium text-ink-900">{a.title}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-ink-500">{a.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
