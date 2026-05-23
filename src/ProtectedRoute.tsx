import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }): ReactNode {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#F8F9FE" }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: "#E8E0FF", borderTopColor: "#6C5CE7" }} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}
