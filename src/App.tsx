import "./i18n";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/* ---------- PUBLIC ---------- */
import LoginPage from "./LoginPage";

/* ---------- LAYOUT & GUARD ---------- */
import Layout from "./Layout";
import ProtectedRoute from "./ProtectedRoute";
import ReviewHubPage from "./ReviewHubPage";

/* ---------- MAIN PAGES ---------- */
import HomePage from "./HomePage";
import NotificationsPage from "./NotificationsPage";
import CoursesPage from "./CoursesPage";

/* ---------- STUDENTS ---------- */
import StudentsPage from "./StudentsPage";
import StudentProfilePage from "./StudentProfilePage";
import StudentsInactivePage from "./StudentsInactivePage";


/* ---------- OTHER SECTIONS ---------- */
import AdmissionsPage from "./AdmissionsPage";
import AttendancePage from "./AttendancePage";
import BillingPage from "./BillingPage";
import ReportsPage from "./ReportsPage";
import MessagingPage from "./MessagingPage";
import SettingsPage from "./SettingsPage";

// If you want the React Query devtools for debugging, you can also:
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected (app shell + sidebar) */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard */}
            <Route path="/dashboard" element={<HomePage />} />

            {/* Students */}
            <Route path="/myschool/students" element={<StudentsPage />} />
            <Route path="/myschool/student/:id" element={<StudentProfilePage />} />

            {/* Admissions (and public apply) */}
            <Route path="/admissions" element={<AdmissionsPage />} />
            <Route path="/apply/:token" element={<AdmissionsPage publicMode />} />

            {/* Other sections */}
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/messaging" element={<MessagingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/review" element={<ReviewHubPage />} />
            <Route path="/myschool/courses" element={<CoursesPage />} />
            <Route path="/myschool/students/inactive" element={<StudentsInactivePage />} />


            {/* Notifications */}
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/review-hub" element={<ReviewHubPage />} />
            
            {/* Fallback inside protected → dashboard */}
            <Route index element={<Navigate to="/dashboard" replace />} />
          </Route>

          {/* Catch-all → login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
}
