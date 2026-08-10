import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, MapPin, CalendarClock, FileWarning, Bell, BellPlus, User,
  Users, Hospital, Repeat, ClipboardList, Megaphone, CalendarX2, LogOut,
  Sun, Moon, Sparkles, PanelLeftClose, PanelLeftOpen, Search, ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme, ThemePreference } from '../../theme/ThemeProvider';
import { supabase } from '../../lib/supabase';
import ErrorBoundary from '../ErrorBoundary';
import PushNotificationManager from './PushNotificationManager';
import { getNotificationPermission, requestNotificationPermission, setAppBadgeCount } from '../../utils/pushNotifications';
import { useToast } from '../../context/ToastContext';
import clsx from 'clsx';
import type { NotificationRow } from '../../types/database';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Groups items under a heading in the desktop sidebar. Items without one
   * (studentNav) render flat, unchanged. */
  section?: string;
}

const studentNav: NavItem[] = [
  { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/student/attendance', label: 'Check In', icon: MapPin },
  { to: '/student/history', label: 'Attendance History', icon: CalendarClock },
  { to: '/student/appeals', label: 'Appeals', icon: FileWarning },
  { to: '/student/notifications', label: 'Notifications', icon: Bell },
  { to: '/student/profile', label: 'Profile', icon: User },
];

const coordinatorNav: NavItem[] = [
  { to: '/coordinator', label: 'Dashboard', icon: LayoutDashboard, end: true, section: 'Program' },
  { to: '/coordinator/students', label: 'Students', icon: Users, section: 'Program' },
  { to: '/coordinator/hospitals', label: 'Hospitals', icon: Hospital, section: 'Program' },
  { to: '/coordinator/rotations', label: 'Rotations', icon: Repeat, section: 'Program' },
  { to: '/coordinator/attendance', label: 'Attendance', icon: ClipboardList, section: 'Attendance' },
  { to: '/coordinator/appeals', label: 'Appeals', icon: FileWarning, section: 'Attendance' },
  { to: '/coordinator/exceptions', label: 'Exceptions', icon: CalendarX2, section: 'Updates' },
  { to: '/coordinator/announcements', label: 'Announcements', icon: Megaphone, section: 'Updates' },
  { to: '/coordinator/notifications', label: 'Notifications', icon: Bell, section: 'Updates' },
];

function matchesActive(pathname: string, item: { to: string; end?: boolean }) {
  return item.end ? pathname === item.to : pathname.startsWith(item.to);
}

const THEME_OPTIONS: { value: ThemePreference; icon: LucideIcon; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'aether', icon: Sparkles, label: 'Aether' },
];

function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const activeIndex = THEME_OPTIONS.findIndex((o) => o.value === preference);

  return (
    <div className="relative flex h-9 w-24 items-center rounded-full bg-surface-muted p-1">
      <motion.div
        className="absolute h-7 rounded-full bg-surface shadow-sm"
        style={{ width: 'calc((100% - 8px) / 3)' }}
        animate={{ left: `calc(4px + ${activeIndex} * (100% - 8px) / 3)` }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setPreference(opt.value)}
          aria-label={`${opt.label} theme`}
          title={`${opt.label} theme`}
          className="relative z-10 flex h-7 flex-1 items-center justify-center"
        >
          <opt.icon size={14} className={preference === opt.value ? 'text-clinical-600' : 'text-ink-300'} />
        </button>
      ))}
    </div>
  );
}

/** Bell with unread-count badge and a small dropdown of recent notifications — shared by both roles even though only students have a dedicated /notifications page. */
function EnableNotificationsButton() {
  const { showSuccess, showError } = useToast();
  const [permission, setPermission] = useState(getNotificationPermission());

  if (permission !== 'default') return null; // already granted, denied, or unsupported — nothing to prompt

  async function handleClick() {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      showSuccess("Notifications enabled — you'll get alerts even when this tab isn't focused.");
    } else if (result === 'denied') {
      showError('Notifications blocked. You can re-enable them in your browser\'s site settings.');
    }
  }

  return (
    <button
      onClick={handleClick}
      title="Enable browser notifications"
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-surface-muted hover:text-ink-900"
    >
      <BellPlus size={17} />
    </button>
  );
}

function NotificationsMenu() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .eq('is_read', false),
      ]);
      setItems(data ?? []);
      const unreadCount = count ?? 0;
      setUnread(unreadCount);
      setAppBadgeCount(unreadCount);
    })();
  }, [profile?.id]);

  async function handleOpen() {
    setOpen((o) => !o);
    if (!open && unread > 0 && profile) {
      // Mark ALL of this user's unread notifications as read (not just the
      // 8 shown in the preview) so the badge count — which reflects the
      // true total — actually reaches zero instead of leaving a stale
      // remainder for anything beyond the preview list.
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnread(0);
      setAppBadgeCount(0);
    }
  }

  // Live updates: a new notification for this user shows up in the preview
  // list and bumps the badge immediately, without needing to reopen the
  // dropdown or reload the page — this is the same realtime channel
  // PushNotificationManager uses for OS-level notifications; this one keeps
  // the in-app bell itself live.
  useEffect(() => {
    if (!profile) return;

    // Defensive guard: if a channel with this exact topic already exists
    // (e.g. from React StrictMode's intentional double-invoke of effects in
    // development, or a fast-firing prior effect run whose async
    // removeChannel() hasn't resolved yet), remove it first rather than
    // trying to subscribe a second time on top of it — that's what was
    // throwing "cannot add postgres_changes callbacks ... after subscribe()".
    const topic = `notifications-badge-${profile.id}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          setItems((prev) => [n, ...prev].slice(0, 8));
          setUnread((prev) => {
            const next = prev + 1;
            setAppBadgeCount(next);
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleOpen} className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-surface-muted hover:text-ink-900">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-status-expired px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-xl2 border border-surface-line bg-surface shadow-glass sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80"
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
            <NavLink
              to={profile?.role === 'coordinator' ? '/coordinator/notifications' : '/student/notifications'}
              onClick={() => setOpen(false)}
              className="block border-t border-surface-line px-4 py-2.5 text-center text-xs font-medium text-clinical-600 hover:bg-surface-muted hover:text-clinical-700"
            >
              View all notifications
            </NavLink>
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
            className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-xl2 border border-surface-line bg-surface shadow-glass sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-56"
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
      <PushNotificationManager />

      {/* Desktop sidebar — floating, collapsible, animated active indicator */}
      <motion.aside
        animate={{ width: collapsed ? 84 : 256 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-surface-line bg-surface-sidebar md:flex"
      >
        <div className={clsx('flex items-center px-5 py-6', collapsed ? 'justify-center' : 'justify-start')}>
          {collapsed ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-clinical-600 text-lg font-bold text-onPrimary">C</div>
          ) : (
            <img src="/wordmark.png" alt="CPVS" className="wordmark h-11 w-auto dark:brightness-0 dark:invert" />
          )}
        </div>

        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3">
          {nav.map((item, index) => {
            const isActive = matchesActive(location.pathname, item);
            const previousSection = index > 0 ? nav[index - 1].section : undefined;
            const showSectionHeader = !!item.section && item.section !== previousSection;
            return (
              <div key={item.to}>
                {showSectionHeader && !collapsed && (
                  <p className={clsx('mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-300', index === 0 ? 'mt-1' : 'mt-4')}>
                    {item.section}
                  </p>
                )}
                {showSectionHeader && collapsed && index !== 0 && (
                  <div className="my-2 border-t border-surface-line" />
                )}
                <div className="group relative">
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

      <main className="min-w-0 flex-1">
        {/* Desktop top bar — fixed (not sticky) so it's guaranteed to stay
            pinned to the viewport regardless of how the scroll container
            above ends up sized; offset to always sit beside the sidebar. */}
        <div
          style={{ left: collapsed ? 84 : 256 }}
          className="fixed right-0 top-0 z-20 hidden items-center justify-between gap-4 border-b border-surface-line bg-surface/85 px-6 py-3.5 backdrop-blur-md transition-[left] duration-300 md:flex"
        >
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
            <EnableNotificationsButton />
            <NotificationsMenu />
            <ThemeToggle />
            <ProfileMenu onSignOut={handleSignOut} />
          </div>
        </div>

        {/* Mobile top bar — also fixed for the same reason */}
        <div className="fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-surface-line bg-surface/85 px-4 py-3 backdrop-blur-md md:hidden">
          <img src="/wordmark.png" alt="CPVS" className="wordmark h-9 w-auto dark:brightness-0 dark:invert" />
          <div className="flex items-center gap-1">
            <EnableNotificationsButton />
            <NotificationsMenu />
            <ThemeToggle />
            <button onClick={handleSignOut} className="p-2 text-ink-500">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* pt-[Nrem] compensates for the now-fixed topbar height so content
            doesn't start underneath it */}
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-24 md:px-8 md:pt-24 md:pb-8">
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
