import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './Spinner';
import { hasRole } from '../utils/roles';
import type { Role } from '../types';

interface PrivateRouteProps {
  children: React.ReactNode;
  /** Omit to allow any authenticated user. */
  allowedRoles?: readonly Role[];
}

export function PrivateRoute({ children, allowedRoles }: PrivateRouteProps) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spinner size={48} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (allowedRoles && !hasRole(user.role, allowedRoles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
