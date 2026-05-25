import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../AuthContext";

export default function SuperAdminRoute({ children }: { children: ReactNode }): ReactNode {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== "superadmin") return <Navigate to="/dashboard" replace />;
  return children;
}
