// src/ProtectedRoute.tsx
export default function ProtectedRoute({
  children,
}: {
  children: JSX.Element;
}) {
  return children; // no-op while auth is disabled
}
