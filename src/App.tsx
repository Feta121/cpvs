import { lazy, Suspense, ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import InstallPrompt from './components/ui/InstallPrompt';
import FullScreenLoader from './components/ui/FullScreenLoader';

// Login and ChangePassword are kept as regular (non-lazy) imports: they're
// the very first thing an unauthenticated visitor sees, don't need AppShell
// or any of its heavier dependencies (framer-motion), and lazy-loading them
// would just add an extra loading flash with no bundle-size benefit.
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';

// Every authenticated page is lazy — this is what actually shrinks the
// initial bundle. Pages that pull in Leaflet (Hospitals, CoordinatorDashboard)
// or recharts (both dashboards) previously forced every user, including
// students who never see Hospitals, to download that code upfront.
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const StudentAttendance = lazy(() => import('./pages/student/Attendance'));
const AttendanceHistory = lazy(() => import('./pages/student/AttendanceHistory'));
const StudentAppeals = lazy(() => import('./pages/student/Appeals'));
const StudentNotifications = lazy(() => import('./pages/student/Notifications'));
const StudentProfile = lazy(() => import('./pages/student/Profile'));

const CoordinatorDashboard = lazy(() => import('./pages/coordinator/CoordinatorDashboard'));
const CoordinatorStudents = lazy(() => import('./pages/coordinator/Students'));
const CoordinatorHospitals = lazy(() => import('./pages/coordinator/Hospitals'));
const CoordinatorRotations = lazy(() => import('./pages/coordinator/Rotations'));
const CoordinatorAttendance = lazy(() => import('./pages/coordinator/AttendanceManagement'));
const CoordinatorAppeals = lazy(() => import('./pages/coordinator/Appeals'));
const CoordinatorAnnouncements = lazy(() => import('./pages/coordinator/Announcements'));
const CoordinatorExceptions = lazy(() => import('./pages/coordinator/Exceptions'));
const CoordinatorNotifications = lazy(() => import('./pages/coordinator/Notifications'));

function RoleHome() {
  const { loading, profile, authError, refreshProfile } = useAuth();

  // Required flow: Login -> check authenticated user -> fetch profile ->
  // determine role -> navigate. Each step below is an explicit branch so a
  // failure at any point is visible instead of falling through to a blank
  // screen.
  if (loading) return <FullScreenLoader label="Loading your account…" />;

  if (authError && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted px-4 text-center">
        <p className="max-w-sm text-sm text-ink-700">{authError}</p>
        <button onClick={() => refreshProfile()} className="btn-primary">Try again</button>
      </div>
    );
  }

  if (!profile) return <Navigate to="/login" replace />;
  if (profile.must_change_password) return <Navigate to="/change-password" replace />;

  switch (profile.role) {
    case 'student':
      return <Navigate to="/student" replace />;
    case 'coordinator':
      return <Navigate to="/coordinator" replace />;
    default:
      // Unrecognized role on the profile row — fail visibly rather than
      // silently redirecting somewhere wrong.
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-surface-muted px-4 text-center">
          <p className="text-sm text-ink-700">Your account role ("{profile.role}") isn't recognized. Contact support.</p>
        </div>
      );
  }
}

/** Wraps a lazy page in its own Suspense boundary (inside AppShell, so the
 * sidebar/topbar stay visible immediately and only the page content area
 * shows the loader while its chunk downloads). */
function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FullScreenLoader label="Loading…" />}>{children}</Suspense>;
}

export default function App() {
  return (
    <>
      <InstallPrompt />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/" element={<RoleHome />} />

      {/* Student routes */}
      <Route
        path="/student"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><Lazy><StudentDashboard /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/attendance"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><Lazy><StudentAttendance /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/history"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><Lazy><AttendanceHistory /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/appeals"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><Lazy><StudentAppeals /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/notifications"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><Lazy><StudentNotifications /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/profile"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><Lazy><StudentProfile /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />

      {/* Coordinator routes */}
      <Route
        path="/coordinator"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorDashboard /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/students"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorStudents /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/hospitals"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorHospitals /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/rotations"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorRotations /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/attendance"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorAttendance /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/appeals"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorAppeals /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/announcements"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorAnnouncements /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/exceptions"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorExceptions /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/notifications"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><Lazy><CoordinatorNotifications /></Lazy></AppShell>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
