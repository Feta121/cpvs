import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, MapPin, CalendarClock, FileWarning, Bell, User,
  Users, Hospital, Repeat, ClipboardList, Megaphone, CalendarX2, LogOut,
  Sun, Moon, PanelLeftClose, PanelLeftOpen, Search, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { supabase } from '../../lib/supabase';
import ErrorBoundary from '../ErrorBoundary';
import clsx from 'clsx';
import type { NotificationRow } from '../../types/database';

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

function matchesActive(pathname: string, item: { to: string; end?: boolean }) {
  return item.end ? pathname === item.to : pathname.startsWith(item.to);
}

function ThemeToggle() {
  const { preference, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${preference === 'dark' ? 'light' : 'dark'} theme`}
      className="relative flex h-9 w-16 items-center rounded-full bg-surface-muted px-1 transition-colors"
    >
      <motion.div
        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface shadow-sm"
        animate={{ x: preference === 'dark' ? 28 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        {preference === 'dark' ? <Moon size={14} className="text-clinical-400" /> : <Sun size={14} className="text-clinical-600" />}
      </motion.div>
    </button>
  );
}

/** Bell with unread-count badge and a small dropdown of recent notifications — shared by both roles even though only students have a dedicated /notifications page. */
function NotificationsMenu() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(8);
      setItems(data ?? []);
      setUnread((data ?? []).filter((n) => !n.is_read).length);
    })();
  }, [profile]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function handleOpen() {
    setOpen((o) => !o);
    if (!open && unread > 0 && profile) {
      const ids = items.filter((n) => !n.is_read).map((n) => n.id);
      if (ids.length > 0) {
        await supabase.from('notifications').update({ is_read: true }).in('id', ids);
        setUnread(0);
      }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleOpen} className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-surface-muted hover:text-ink-900">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-status-expired" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl2 border border-surface-line bg-surface shadow-glass"
          >
            <div className="border-b border-surface-line px-4 py-3 text-sm font-semibold text-ink-900">Notifications</div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-500">You're all caught up.</p>}
              {items.map((n) => (
                <div key={n.id} className="border-b border-surface-line/60 px-4 py-3 last:border-b-0">
                  <p className="text-sm font-medium text-ink-900">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{n.message}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileMenu({ onSignOut }: { onSignOut: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-muted">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-vital-100 text-sm font-semibold text-vital-700">
          {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <ChevronDown size={14} className="text-ink-500" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl2 border border-surface-line bg-surface shadow-glass"
          >
            <div className="border-b border-surface-line px-4 py-3">
              <p className="truncate text-sm font-medium text-ink-900">{profile?.full_name}</p>
              <p className="truncate text-xs capitalize text-ink-500">{profile?.role}</p>
            </div>
            {profile?.role === 'student' && (
              <NavLink to="/student/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-700 hover:bg-surface-muted">
                <User size={15} /> Profile
              </NavLink>
            )}
            <button onClick={onSignOut} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-status-expired hover:bg-status-expired/5">
              <LogOut size={15} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = profile?.role === 'coordinator' ? coordinatorNav : studentNav;
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');

  const activeItem = nav.find((item) => matchesActive(location.pathname, item)) ?? nav[0];
  const searchMatches = search.trim() ? nav.filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase())) : [];

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — floating, collapsible, animated active indicator */}
      <motion.aside
        animate={{ width: collapsed ? 84 : 256 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-surface-line bg-surface-sidebar md:flex"
      >
        <div className={clsx('flex items-center px-5 py-6', collapsed ? 'justify-center' : 'justify-start')}>
          {collapsed ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-clinical-600 text-lg font-bold text-white">C</div>
          ) : (
            <img src="/wordmark.png" alt="CPVS" className="h-11 w-auto dark:brightness-0 dark:invert" />
          )}
        </div>

        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3">
          {nav.map((item) => {
            const isActive = matchesActive(location.pathname, item);
            return (
              <div key={item.to} className="group relative">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={clsx(
                    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    'hover:scale-[1.02] hover:bg-surface-muted',
                    isActive ? 'text-clinical-700' : 'text-ink-700',
                    collapsed && 'justify-center px-0'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav-pill"
                      className="absolute inset-0 rounded-xl bg-clinical-50 shadow-[0_0_0_1px_rgba(15,76,129,0.08)]"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  {isActive && !collapsed && (
                    <motion.div layoutId="active-nav-glow" className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-clinical-600" />
                  )}
                  <item.icon size={18} strokeWidth={2} className={clsx('relative z-10 shrink-0 transition-colors', isActive && 'text-clinical-600')} />
                  {!collapsed && <span className="relative z-10">{item.label}</span>}
                </NavLink>
                {collapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-surface opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-surface-line p-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:bg-surface-muted hover:text-ink-900"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /> Collapse</>}
          </button>
        </div>
      </motion.aside>

      <main className="flex-1 overflow-y-auto">
        {/* Desktop top bar — sticky, page title, search, notifications, theme, profile */}
        <div className="sticky top-0 z-20 hidden items-center justify-between gap-4 border-b border-surface-line bg-surface/85 px-6 py-3.5 backdrop-blur-md md:flex">
          <h1 className="font-display text-lg font-semibold text-ink-900">{activeItem?.label}</h1>

          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sections…"
              className="w-full rounded-full border border-surface-line bg-surface-muted py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-clinical-300 focus:ring-4 focus:ring-clinical-100"
            />
            {searchMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-surface-line bg-surface shadow-glass">
                {searchMatches.map((m) => (
                  <NavLink
                    key={m.to}
                    to={m.to}
                    onClick={() => setSearch('')}
                    className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-ink-700 hover:bg-surface-muted"
                  >
                    <m.icon size={14} /> {m.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <NotificationsMenu />
            <ThemeToggle />
            <ProfileMenu onSignOut={handleSignOut} />
          </div>
        </div>

        {/* Mobile top bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-surface-line bg-surface/85 px-4 py-3 backdrop-blur-md md:hidden">
          <img src="/wordmark.png" alt="CPVS" className="h-9 w-auto dark:brightness-0 dark:invert" />
          <div className="flex items-center gap-1">
            <NotificationsMenu />
            <ThemeToggle />
            <button onClick={handleSignOut} className="p-2 text-ink-500">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8 pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Mobile floating nav — every section is reachable via horizontal scroll */}
        <nav
          className="fixed inset-x-3 bottom-3 z-10 flex gap-1 overflow-x-auto rounded-2xl border border-surface-line bg-surface/95 px-2 py-2 shadow-glass backdrop-blur-md md:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors',
                  isActive ? 'bg-clinical-50 text-clinical-700' : 'text-ink-500'
                )
              }
            >
              <item.icon size={17} />
              {item.label.split(' ')[0]}
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  );
}