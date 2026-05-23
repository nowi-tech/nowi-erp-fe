import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/auth';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserRole } from '@/api/types';
import { hasAnyRole } from '@/lib/userRoles';

interface Props {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRouteV2({ children, allowedRoles }: Props) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    // Same shimmer the rest of the app uses for "we're loading" states,
    // so this auth gate doesn't render a separate circular spinner on
    // top of the Suspense PageSkeleton — there is exactly one loader
    // pattern app-wide.
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Multi-role: a user passes if any of their roles (primary OR
  // UserRoleAssignment) is in `allowedRoles`.
  if (allowedRoles && !hasAnyRole(user, allowedRoles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
