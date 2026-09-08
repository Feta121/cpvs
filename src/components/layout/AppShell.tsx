import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, MapPin, CalendarClock, FileWarning, Bell, BellPlus, User,
  Users, Hospital, Repeat, ClipboardList, Megaphone, CalendarX2, LogOut,
  PanelLeftClose, PanelLeftOpen, Search, ChevronDown, Check, Settings as SettingsIcon, UserCog,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';
import ErrorBoundary from '../ErrorBoundary';
import Wordmark from '../ui/Wordmark';
import ConfirmDialog from '../ui/ConfirmDialog';
import ThemeToggle from '../ui/ThemeToggle';
import PushNotificationManager from './PushNotificationManager';
import { getNotificationPermission, requestNotificationPermission, setAppBadgeCount } from '../../utils/pushNotifications';
import { useToast } from '../../context/ToastContext';
import clsx from 'clsx';
import type { NotificationRow, PermissionKey } from '../../types/database';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Groups items under a heading in the desktop sidebar. Items without one
   * (studentNav) render flat, unchanged. */
  section?: string;
  /** Added in migration 0012. If set, this item is hidden unless the
   * signed-in coordinator has at least one of these permissions (or is a
   * Super Coordinator). Items with no `permissions` (Dashboard, Settings,
   * Notifications, Coordinators) are always visible — Coordinators is
   * intentionally visible to every coordinator per spec (view-only unless
   * you're a Super Coordinator; the page itself gates the actions). */
  permissions?: PermissionKey[];
}

const studentNav: NavItem[] = [
  { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/student/attendance', label: 'Check In', icon: MapPin },
  { to: '/student/history', label: 'Attendance History', icon: CalendarClock },
  { to: '/student/rotations', label: 'Rotation History', icon: Repeat },
  { to: '/student/appeals', label: 'Appeals', icon: FileWarning },
  { to: '/student/notifications', label: 'Notifications', icon: Bell },
  { to: '/student/profile', label: 'Profile', icon: User },
  { to: '/student/settings', label: 'Settings', icon: SettingsIcon },
];

const coordinatorNav: NavItem[] = [
  { to: '/coordinator', label: 'Dashboard', icon: LayoutDashboard, end: true, section: 'Program' },
  { to: '/coordinator/students', label: 'Students', icon: Users, section: 'Program', permissions: ['can_create_students', 'can_edit_students', 'can_delete_students'] },
  { to: '/coordinator/hospitals', label: 'Hospitals', icon: Hospital, section: 'Program', permissions: ['can_create_hospitals', 'can_edit_hospitals', 'can_delete_hospitals'] },
  { to: '/coordinator/rotations', label: 'Rotations', icon: Repeat, section: 'Program', permissions: ['can_create_rotations', 'can_edit_rotations', 'can_delete_rotations'] },
  { to: '/coordinator/coordinators', label: 'Coordinators', icon: UserCog, section: 'Program' },
  { to: '/coordinator/attendance', label: 'Attendance', icon: ClipboardList, section: 'Attendance', permissions: ['can_manage_attendance'] },
  { to: '/coordinator/appeals', label: 'Appeals', icon: FileWarning, section: 'Attendance', permissions: ['can_review_appeals'] },
  { to: '/coordinator/exceptions', label: 'Exceptions', icon: CalendarX2, section: 'Updates', permissions: ['can_manage_schedules'] },
  { to: '/coordinator/announcements', label: 'Announcements', icon: Megaphone, section: 'Updates', permissions: ['can_send_announcements'] },
  { to: '/coordinator/notifications', label: 'Notifications', icon: Bell, section: 'Updates' },
  { to: '/coordinator/settings', label: 'Settings', icon: SettingsIcon, section: 'App' },
];

function matchesActive(pathname: string, item: { to: string; end?: boolean }) {
  return item.end ? pathname === item.to : pathname.startsWith(item.to);
}

/** Shared look for the small round icon buttons that live in the top bar. */
const TOPBAR_ICON_BTN =
  'relative flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 transition-all duration-200 hover:bg-clinical-500/10 hover:text-clinical-600';

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
    <button onClick={handleClick} title="Enable browser notifications" className={TOPBAR_ICON_BTN}>
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
      <button onClick={handleOpen} className={TOPBAR_ICON_BTN} aria-label="Notifications">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-status-expired px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
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
            className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-xl3 border border-surface-line bg-surface shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2.5 sm:w-80"
          >
            <div className="flex items-center gap-2.5 border-b border-surface-line px-4 py-3.5">
              <span className="icon-tile h-7 w-7 rounded-lg">
                <Bell size={14} strokeWidth={2.5} />
              </span>
              <span className="text-sm font-semibold text-ink-900">Notifications</span>
              {unread > 0 && <span className="chip ml-auto py-0.5">{unread} new</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-400">You're all caught up.</p>}
              {items.map((n) => (
                <div
                  key={n.id}
                  className="relative border-b border-surface-line/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={clsx(
                        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        n.is_read ? 'bg-surface-line' : 'bg-clinical-500 shadow-[0_0_8px_0] shadow-clinical-500/70',
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-ink-900">{n.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{n.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <NavLink
              to={profile?.role === 'coordinator' ? '/coordinator/notifications' : '/student/notifications'}
              onClick={() => setOpen(false)}
              className="block border-t border-surface-line px-4 py-3 text-center text-xs font-semibold tracking-wide text-clinical-600 transition-colors hover:bg-clinical-500/8 hover:text-clinical-700"
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-alt"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-vital-500 to-clinical-500 text-sm font-bold text-onAccent shadow-glow-accent">
          {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <ChevronDown size={14} className={clsx('text-ink-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-xl3 border border-surface-line bg-surface shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2.5 sm:w-60"
          >
            <div className="flex items-center gap-3 border-b border-surface-line px-4 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-vital-500 to-clinical-500 text-base font-bold text-onAccent">
                {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{profile?.full_name}</p>
                <p className="truncate text-xs capitalize text-ink-500">{profile?.role}</p>
              </div>
            </div>
            <div className="p-1.5">
              {profile?.role === 'student' && (
                <NavLink
                  to="/student/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-alt hover:text-ink-900"
                >
                  <User size={15} /> Profile
                </NavLink>
              )}
              <button
                onClick={onSignOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-status-expired transition-colors hover:bg-status-expired/10"
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { hasAny } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const rawNav = profile?.role === 'coordinator' ? coordinatorNav : studentNav;
  // Added in migration 0012: hide any coordinator nav item the signed-in
  // coordinator has none of the relevant permissions for. Items with no
  // `permissions` array (Dashboard, Settings, Notifications, Coordinators)
  // are always shown. Student nav is untouched — none of its items carry a
  // `permissions` field, so every item passes this filter unchanged.
  const nav = rawNav.filter((item) => !item.permissions || hasAny(item.permissions));
  const [collapsed, setCollapsed] = useState(false);
  // Was a CSS absolute-positioned flyout living inside the scrollable nav
  // (overflow-y-auto) — deliberately positioned via `left-full` to escape
  // the 84px collapsed rail visually. The bug: per the CSS overflow spec,
  // once ONE axis's overflow is non-`visible`, the OTHER axis is forced to
  // compute as `auto` too rather than staying `visible` — so `overflow-y:
  // auto` silently turned `overflow-x` into `auto` as well, and the
  // tooltip's intentional rightward overflow triggered a real horizontal
  // scrollbar across the whole collapsed sidebar. Fixed by portaling the
  // tooltip to document.body instead — `position: fixed` there is
  // unaffected by any ancestor's overflow, and the tooltip no longer
  // contributes to the nav's scrollable content size at all.
  const [collapsedTooltip, setCollapsedTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  const [search, setSearch] = useState('');
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const activeItem = nav.find((item) => matchesActive(location.pathname, item)) ?? nav[0];
  const searchMatches = search.trim() ? nav.filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase())) : [];

  async function handleSignOut() {
    setConfirmingSignOut(false);
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
        className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-surface-line bg-surface-sidebar md:flex"
      >
        {/* Brand-tinted wash down the sidebar so it separates from the page
            without needing a heavier border. pointer-events-none + the
            content sitting at z-10 keeps it purely decorative. */}
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-clinical-500/[0.07] via-transparent to-vital-500/[0.06]" />

        <div className={clsx('relative z-10 flex items-center px-5 py-6', collapsed ? 'justify-center' : 'justify-start')}>
          {collapsed ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl2 bg-gradient-to-br from-clinical-500 to-clinical-600 text-onPrimary shadow-glow">
              <Check size={20} strokeWidth={3} />
            </div>
          ) : (
            <Wordmark className="h-11" />
          )}
        </div>

        <div className="relative z-10 mx-4 mb-2 hairline" />

        <nav className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {nav.map((item, index) => {
            const isActive = matchesActive(location.pathname, item);
            const previousSection = index > 0 ? nav[index - 1].section : undefined;
            const showSectionHeader = !!item.section && item.section !== previousSection;
            return (
              <div key={item.to}>
                {showSectionHeader && !collapsed && (
                  <p className={clsx('section-label mb-2 flex items-center gap-2 px-3', index === 0 ? 'mt-1' : 'mt-5')}>
                    {item.section}
                    <span className="h-px flex-1 bg-surface-line" />
                  </p>
                )}
                {showSectionHeader && collapsed && index !== 0 && (
                  <div className="my-3 border-t border-surface-line" />
                )}
                <div
                  className="group relative"
                  onMouseEnter={(e) => {
                    if (!collapsed) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setCollapsedTooltip({ label: item.label, top: r.top + r.height / 2, left: r.right + 10 });
                  }}
                  onMouseLeave={() => setCollapsedTooltip(null)}
                >
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={clsx(
                    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-spring',
                    isActive ? 'text-clinical-700' : 'text-ink-700 hover:bg-surface-alt hover:text-ink-900',
                    !collapsed && !isActive && 'hover:translate-x-1',
                    collapsed && 'justify-center px-0'
                  )}
                >
                  {/* Collapsed active state is a small, CONTAINED badge (a
                      fixed 40x40 square centered in the nav item) rather
                      than a solid fill stretched across the item's full
                      padding box — the previous full-bleed fill read as a
                      loud, edge-to-edge block of color with no breathing
                      room around it. Centering uses left-1/2/top-1/2 PLUS a
                      fixed negative margin (-ml-5/-mt-5, i.e. -20px = half
                      of the 40px box) rather than a -translate-x/y-1/2
                      Tailwind class — this element has a layoutId, and
                      Framer Motion animates it by writing its own transform
                      directly via inline style, which silently overwrites
                      any transform-based class the moment that animation
                      runs (inline style always wins over a class). Margin
                      doesn't touch the transform property, so it isn't
                      clobbered the same way — see the identical reasoning
                      already documented below for active-nav-glow, which
                      hit this exact bug first. */}
                  {isActive && (
                    <motion.div
                      layoutId={collapsed ? 'active-nav-badge' : 'active-nav-pill'}
                      className={clsx(
                        'absolute rounded-xl2',
                        collapsed
                          ? 'left-1/2 top-1/2 -ml-5 -mt-5 h-10 w-10 bg-gradient-to-br from-clinical-500 to-clinical-600 shadow-glow'
                          : 'inset-0 rounded-xl bg-gradient-to-r from-clinical-500/16 via-clinical-500/10 to-vital-500/8 ring-1 ring-inset ring-clinical-500/25'
                      )}
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  {/* CHANGED: vertical centering moved from a transform
                      (-translate-y-1/2) to a fixed negative margin (-mt-2.5,
                      i.e. -10px = half of h-5's 20px). This element has
                      layoutId, so Framer Motion animates it between nav
                      items by writing its OWN transform directly via inline
                      style — which silently overwrites any transform-based
                      Tailwind class the moment that animation runs (inline
                      style always wins over a class). That's exactly why it
                      looked centered on first load (no animation has run
                      yet, so the class's transform was still untouched) but
                      dropped out of center after the first page navigation
                      (once Framer Motion's own transform took over and the
                      -50% offset was lost). Margin doesn't touch the
                      transform property at all, so it can't be clobbered
                      the same way. */}
                  {isActive && !collapsed && (
                    <motion.div
                      layoutId="active-nav-glow"
                      className="absolute left-0 top-1/2 -mt-2.5 h-5 w-[3px] rounded-full bg-gradient-to-b from-clinical-500 to-vital-500 shadow-[0_0_10px_0] shadow-clinical-500/70"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                  <item.icon
                    size={18}
                    strokeWidth={2}
                    className={clsx(
                      'relative z-10 shrink-0 transition-colors',
                      isActive && (collapsed ? 'text-onPrimary' : 'text-clinical-600')
                    )}
                  />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                </NavLink>
                </div>
              </div>
            );
          })}
        </nav>

        {/* The collapsed-rail tooltip itself — portaled to document.body
            (see the collapsedTooltip state comment above for why) rather
            than rendered inline in the nav. Fixed positioning here is
            immune to any ancestor's overflow/scroll, by design. */}
        {collapsed && collapsedTooltip && createPortal(
          <div
            className="pointer-events-none fixed z-[100] -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-semibold text-surface shadow-float"
            style={{ top: collapsedTooltip.top, left: collapsedTooltip.left }}
          >
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-ink-900" />
            {collapsedTooltip.label}
          </div>,
          document.body
        )}

        <div className="relative z-10 border-t border-surface-line p-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-500 transition-all duration-200 hover:bg-clinical-500/10 hover:text-clinical-600"
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
          className="fixed right-0 top-0 z-20 hidden items-center justify-between gap-4 border-b border-surface-line/70 bg-surface/75 px-6 py-3.5 backdrop-blur-xl transition-[left] duration-300 md:flex"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-clinical-500 to-vital-500" />
            <h1 className="truncate font-display text-lg font-semibold tracking-[-0.015em] text-ink-900">{activeItem?.label}</h1>
          </div>

          <div className="relative max-w-sm flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sections…"
              className="w-full rounded-full border border-surface-line bg-surface-alt py-2 pl-9 pr-3 text-sm text-ink-900 outline-none transition-all duration-200 placeholder:text-ink-400 hover:border-clinical-300/70 focus:border-clinical-500 focus:bg-surface focus:shadow-[0_0_0_4px_rgb(var(--primary-500)/0.14)]"
            />
            {searchMatches.length > 0 && (
              <div className="animate-scaleIn absolute left-0 right-0 top-full z-30 mt-2 origin-top overflow-hidden rounded-xl2 border border-surface-line bg-surface p-1.5 shadow-float">
                {searchMatches.map((m) => (
                  <NavLink
                    key={m.to}
                    to={m.to}
                    onClick={() => setSearch('')}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-alt hover:text-clinical-700"
                  >
                    <m.icon size={15} className="text-ink-400" /> {m.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* The two bell actions read as one grouped control island; the
                theme switch and avatar stay separate so they don't get lost
                in it. */}
            <div className="flex items-center gap-0.5 rounded-2xl bg-surface-alt/70 p-0.5 ring-1 ring-inset ring-surface-line">
              <EnableNotificationsButton />
              <NotificationsMenu />
            </div>
            <ThemeToggle />
            <span className="h-6 w-px bg-surface-line" />
            <ProfileMenu onSignOut={() => setConfirmingSignOut(true)} />
          </div>
        </div>

        {/* Mobile top bar — also fixed for the same reason */}
        <div className="fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-surface-line/70 bg-surface/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <Wordmark className="h-9" />
          <div className="flex items-center gap-1">
            <EnableNotificationsButton />
            <NotificationsMenu />
            <ThemeToggle />
            <button
              onClick={() => setConfirmingSignOut(true)}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 transition-colors hover:bg-status-expired/10 hover:text-status-expired"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* pt-[Nrem] compensates for the now-fixed topbar height so content
            doesn't start underneath it */}
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-28 md:px-8 md:pt-24 md:pb-10">
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
          className="fixed inset-x-3 bottom-3 z-10 flex gap-1 overflow-x-auto rounded-xl3 border border-surface-line bg-surface/85 px-2 py-2 shadow-float backdrop-blur-xl [&::-webkit-scrollbar]:hidden md:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-b from-clinical-500/18 to-vital-500/8 text-clinical-700 ring-1 ring-inset ring-clinical-500/25'
                    : 'text-ink-500 active:scale-95'
                )
              }
            >
              <item.icon size={17} />
              {item.label.split(' ')[0]}
            </NavLink>
          ))}
        </nav>
      </main>

      <ConfirmDialog
        open={confirmingSignOut}
        title="Sign out of CPVS?"
        message="You'll need to sign back in with your username and password to continue."
        confirmLabel="Sign out"
        danger={false}
        onConfirm={handleSignOut}
        onCancel={() => setConfirmingSignOut(false)}
      />
    </div>
  );
}
