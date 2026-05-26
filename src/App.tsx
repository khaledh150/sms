import "./i18n";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import { ToastProvider } from "./hooks/useToast";

/* ---------- PUBLIC ---------- */
import LoginPage from "./LoginPage";

/* ---------- LAYOUT & GUARD ---------- */
import Layout from "./Layout";
import ProtectedRoute from "./ProtectedRoute";
import AdminRoute from "./AdminRoute";

function LegacyStudentRedirect() {
  const { id } = useParams();
  return <Navigate to={`/students/${id}`} replace />;
}

/* ---------- CORE POS SCREENS (eagerly loaded) ---------- */
import HomePage from "./HomePage";
import AttendancePage from "./features/attendance";
import CourseAttendanceView from "./features/attendance/CourseAttendanceView";
import StudentsPage from "./StudentsPage";
import StudentProfilePage from "./features/student-profile";
import MorePage from "./MorePage";

/* ---------- SECONDARY / ADMIN SCREENS (lazy loaded) ---------- */
const InboxPage = lazy(() => import("./InboxPage"));
const AdmissionsPage = lazy(() => import("./AdmissionsPage"));
const CoursesPage = lazy(() => import("./CoursesPage"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const BillingPage = lazy(() => import("./BillingPage"));
const ReportsPage = lazy(() => import("./ReportsPage"));
const MessagingPage = lazy(() => import("./features/messaging"));
const SuperAdminDashboard = lazy(() => import("./features/super-admin"));
const RenewCoursePage = lazy(() => import("./RenewCoursePage"));
import SuperAdminRoute from "./features/super-admin/SuperAdminRoute";


function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-3 animate-spin" style={{ borderColor: "#E8E0FF", borderTopColor: "#6C5CE7" }} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Suspense fallback={<LazyFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/renew/:studentId/:courseId" element={<RenewCoursePage />} />

          {/* Protected (POS shell with bottom nav) */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Core POS screens */}
            <Route path="/dashboard" element={<HomePage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/attendance/:courseId" element={<CourseAttendanceView />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:id" element={<StudentProfilePage />} />
            <Route path="/inbox" element={<AdminRoute><InboxPage /></AdminRoute>} />
            <Route path="/more" element={<MorePage />} />

            {/* Secondary screens */}
            <Route path="/admissions" element={<AdmissionsPage />} />
            <Route path="/apply/:token" element={<AdmissionsPage publicMode />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
            <Route path="/billing" element={<AdminRoute><BillingPage /></AdminRoute>} />
            <Route path="/reports" element={<AdminRoute><ReportsPage /></AdminRoute>} />
            <Route path="/messaging" element={<AdminRoute><MessagingPage /></AdminRoute>} />
            <Route path="/admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />

            {/* Legacy redirects */}
            <Route path="/myschool/students" element={<Navigate to="/students" replace />} />
            <Route path="/myschool/student/:id" element={<LegacyStudentRedirect />} />
            <Route path="/myschool/students/inactive" element={<Navigate to="/students" replace />} />
            <Route path="/myschool/courses" element={<Navigate to="/courses" replace />} />
            <Route path="/review" element={<Navigate to="/inbox" replace />} />
            <Route path="/review-hub" element={<Navigate to="/inbox" replace />} />
            <Route path="/notifications" element={<Navigate to="/inbox" replace />} />

            {/* Default → dashboard */}
            <Route index element={<Navigate to="/dashboard" replace />} />
          </Route>

          {/* Catch-all → login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
