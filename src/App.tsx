import "./i18n";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "./hooks/useToast";

/* ---------- PUBLIC ---------- */
import LoginPage from "./LoginPage";

/* ---------- LAYOUT & GUARD ---------- */
import Layout from "./Layout";
import ProtectedRoute from "./ProtectedRoute";

/* ---------- CORE POS SCREENS ---------- */
import HomePage from "./HomePage";
import AttendancePage from "./AttendancePage";
import StudentsPage from "./StudentsPage";
import StudentProfilePage from "./StudentProfilePage";
import InboxPage from "./InboxPage";
import MorePage from "./MorePage";

/* ---------- SECONDARY SCREENS ---------- */
import AdmissionsPage from "./AdmissionsPage";
import CoursesPage from "./CoursesPage";
import SettingsPage from "./SettingsPage";
import BillingPage from "./BillingPage";
import ReportsPage from "./ReportsPage";
import MessagingPage from "./MessagingPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected (POS shell with bottom nav) */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Core 5 POS screens */}
            <Route path="/dashboard" element={<HomePage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:id" element={<StudentProfilePage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/more" element={<MorePage />} />

            {/* Secondary screens (accessible from More or deep links) */}
            <Route path="/admissions" element={<AdmissionsPage />} />
            <Route path="/apply/:token" element={<AdmissionsPage publicMode />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/messaging" element={<MessagingPage />} />

            {/* Legacy redirects */}
            <Route path="/myschool/students" element={<Navigate to="/students" replace />} />
            <Route path="/myschool/student/:id" element={<Navigate to="/students/:id" replace />} />
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
      </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
