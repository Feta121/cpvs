import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, CalendarClock, FileWarning, Bell, User,
  Users, Hospital, Repeat, ClipboardList, Megaphone, CalendarX2, LogOut, Stethoscope,
  Sun, Moon, MonitorSmartphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemePreference } from '../../theme/ThemeProvider';
import clsx from 'clsx';
import { ReactNode } from 'react';

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: MonitorSmartphone },
];

function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface-muted p-1">
      {themeOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setPreference(opt.value)}
          title={opt.label}
          aria-label={`${opt.label} theme`}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium transition-colors',
            preference === opt.value ? 'bg-surface text-clinical-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'
          )}
        >
          <opt.icon size={13} />
        </button>
      ))}
    </div>
  );
}

const studentNav = [
  { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/student/attendance', label: 'Check In', icon: MapPin },
  { to: '/student/history', label: 'Attendance History', icon: CalendarClock },
  { to: '/student/appeals', label: 'Appeals', icon: FileWarning },
  { to: '/student/notifications', label: 'Notifications', icon: Bell },
  { to: '/student/profile', label: 'Profile', icon: User },
];

const coordinatorNav = [
  { to: '/coordinator', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/coordinator/students', label: 'Students', icon: Users },
  { to: '/coordinator/hospitals', label: 'Hospitals', icon: Hospital },
  { to: '/coordinator/rotations', label: 'Rotations', icon: Repeat },
  { to: '/coordinator/attendance', label: 'Attendance', icon: ClipboardList },
  { to: '/coordinator/appeals', label: 'Appeals', icon: FileWarning },
  { to: '/coordinator/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/coordinator/exceptions', label: 'Exceptions', icon: CalendarX2 },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const nav = profile?.role === 'coordinator' ? coordinatorNav : studentNav;

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-surface-line bg-surface/80 backdrop-blur-md md:flex">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-clinical-600 text-white">
            <Stethoscope size={18} />
          </div>
          <div>
            <p className="font-display text-sm font-semibold leading-tight text-ink-900">CPVS</p>
            <p className="text-[11px] leading-tight text-ink-500">Clinical Verification</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-clinical-50 text-clinical-700'
                    : 'text-ink-700 hover:bg-surface-muted'
                )
              }
            >
              <item.icon size={18} strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-surface-line p-3">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-vital-100 text-sm font-semibold text-vital-700">
              {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{profile?.full_name}</p>
              <p className="truncate text-xs capitalize text-ink-500">{profile?.role}</p>
            </div>
          </div>
          <div className="px-1 pb-1 pt-2">
            <ThemeToggle />
          </div>
          <button
            onClick={handleSignOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:bg-status-expired/5 hover:text-status-expired"
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-surface-line bg-surface/80 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-clinical-600 text-white">
              <Stethoscope size={16} />
            </div>
            <span className="font-display text-sm font-semibold">CPVS</span>
          </div>
          <button onClick={handleSignOut} className="text-ink-500">
            <LogOut size={20} />
          </button>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>

        {/* Mobile bottom nav */}
        <div className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-surface-line bg-surface/90 py-2 backdrop-blur-md md:hidden">
          {nav.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx('flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]', isActive ? 'text-clinical-700' : 'text-ink-500')
              }
            >
              <item.icon size={18} />
              {item.label.split(' ')[0]}
            </NavLink>
          ))}
        </div>
      </main>
    </div>
  );
}