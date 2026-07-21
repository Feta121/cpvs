import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import FullScreenLoader from './components/ui/FullScreenLoader';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';

import StudentDashboard from './pages/student/StudentDashboard';
import StudentAttendance from './pages/student/Attendance';
import AttendanceHistory from './pages/student/AttendanceHistory';
import StudentAppeals from './pages/student/Appeals';
import StudentNotifications from './pages/student/Notifications';
import StudentProfile from './pages/student/Profile';

import CoordinatorDashboard from './pages/coordinator/CoordinatorDashboard';
import CoordinatorStudents from './pages/coordinator/Students';
import CoordinatorHospitals from './pages/coordinator/Hospitals';
import CoordinatorRotations from './pages/coordinator/Rotations';
import CoordinatorAttendance from './pages/coordinator/AttendanceManagement';
import CoordinatorAppeals from './pages/coordinator/Appeals';
import CoordinatorAnnouncements from './pages/coordinator/Announcements';
import CoordinatorExceptions from './pages/coordinator/Exceptions';

function RoleHome() {
  const { loading, profile } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.must_change_password) return <Navigate to="/change-password" replace />;
  return <Navigate to={profile.role === 'coordinator' ? '/coordinator' : '/student'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/" element={<RoleHome />} />

      {/* Student routes */}
      <Route
        path="/student"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><StudentDashboard /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/attendance"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><StudentAttendance /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/history"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><AttendanceHistory /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/appeals"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><StudentAppeals /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/notifications"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><StudentNotifications /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/profile"
        element={
          <ProtectedRoute allow={['student']}>
            <AppShell><StudentProfile /></AppShell>
          </ProtectedRoute>
        }
      />

      {/* Coordinator routes */}
      <Route
        path="/coordinator"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><CoordinatorDashboard /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/students"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><CoordinatorStudents /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/hospitals"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><CoordinatorHospitals /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/rotations"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><CoordinatorRotations /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/attendance"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><CoordinatorAttendance /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/appeals"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><CoordinatorAppeals /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/announcements"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><CoordinatorAnnouncements /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/exceptions"
        element={
          <ProtectedRoute allow={['coordinator']}>
            <AppShell><CoordinatorExceptions /></AppShell>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
