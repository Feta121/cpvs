import { useEffect, useState } from 'react';
import { Users, CheckCircle2, Clock, XCircle, FileWarning } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/ui/StatCard';
import FullScreenLoader from '../../components/ui/FullScreenLoader';

export default function CoordinatorDashboard() {
  const { coordinator } = useAuth();
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<string>('all');
  const [batches, setBatches] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, present: 0, late: 0, absent: 0, pendingAppeals: 0 });

  useEffect(() => {
    if (!coordinator) return;
    loadData();
  }, [coordinator, batch]);

  async function loadData() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    const { data: studentBatches } = await supabase.from('students').select('batch');
    setBatches(Array.from(new Set((studentBatches ?? []).map((s) => s.batch))));

    let studentQuery = supabase.from('students').select('id', { count: 'exact' });
    if (batch !== 'all') studentQuery = studentQuery.eq('batch', batch);
    const { count: total } = await studentQuery;

    const { data: todayAttendance } = await supabase.from('attendance').select('status, student_id').eq('date', today);

    const relevantStudentIds =
      batch === 'all'
        ? null
        : new Set((await supabase.from('students').select('id').eq('batch', batch)).data?.map((s) => s.id));

    const filtered = (todayAttendance ?? []).filter((a) => !relevantStudentIds || relevantStudentIds.has(a.student_id));
    // "Present today" counts anyone who showed up at all — including late and
    // very-late check-ins — since being late doesn't mean they weren't
    // present. "Late today" still separately shows that subset so
    // coordinators can see who to follow up with.
    const present = filtered.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'very_late').length;
    const late = filtered.filter((a) => a.status === 'late' || a.status === 'very_late').length;
    const absent = filtered.filter((a) => a.status === 'absent').length;

    const { count: pendingAppeals } = await supabase
      .from('appeals')
      .select('id', { count: 'exact' })
      .eq('status', 'pending');

    setStats({ total: total ?? 0, present, late, absent, pendingAppeals: pendingAppeals ?? 0 });
    setLoading(false);
  }

  if (loading) return <FullScreenLoader label="Loading dashboard…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Coordinator overview</h1>
          <p className="mt-1 text-sm text-ink-500">Today's snapshot across your assigned students.</p>
        </div>
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className="input-field w-auto">
          <option value="all">All batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total students" value={stats.total} icon={Users} tone="clinical" />
        <StatCard label="Present today" value={stats.present} icon={CheckCircle2} tone="vital" />
        <StatCard label="Late today" value={stats.late} icon={Clock} tone="late" />
        <StatCard label="Absent today" value={stats.absent} icon={XCircle} tone="expired" />
        <StatCard label="Pending appeals" value={stats.pendingAppeals} icon={FileWarning} tone="verylate" />
      </div>
    </div>
  );
}
