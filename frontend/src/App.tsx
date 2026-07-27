import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { AppLayout } from './components/AppLayout';
import { ToastContainer } from './components/Toast';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import GameDetailPage from './pages/GameDetailPage';
import AdminUsersPage from './pages/AdminUsersPage';
import CreateGamePage from './pages/CreateGamePage';
import LegacyParserPage from './pages/LegacyParserPage';
import RulesPage from './pages/RulesPage';
import GuidePage from './pages/GuidePage';
import { FinancesDashboardPage } from './pages/FinancesDashboardPage';
import { AdminFinancesPage } from './pages/AdminFinancesPage';
import CamisetasPage from './pages/CamisetasPage';
import { AdminOrdersPage } from './pages/AdminOrdersPage';
import { ADMIN_ONLY, GAME_MANAGERS } from './utils/roles';
import type { Role } from './types';

function AuthenticatedApp({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: readonly Role[];
}) {
  return (
    <PrivateRoute allowedRoles={allowedRoles}>
      <AppLayout>{children}</AppLayout>
    </PrivateRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastContainer />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reglas" element={<RulesPage />} />
          <Route path="/guia" element={<GuidePage />} />
          <Route path="/change-password" element={
            <PrivateRoute>
              <ChangePasswordPage />
            </PrivateRoute>
          } />
          <Route
            path="/"
            element={
              <AuthenticatedApp>
                <HomePage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthenticatedApp>
                <ProfilePage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/game/:id"
            element={
              <AuthenticatedApp>
                <GameDetailPage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AuthenticatedApp allowedRoles={ADMIN_ONLY}>
                <AdminUsersPage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/admin/games/new"
            element={
              <AuthenticatedApp allowedRoles={ADMIN_ONLY}>
                <CreateGamePage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/admin/legacy-parser"
            element={
              <AuthenticatedApp allowedRoles={GAME_MANAGERS}>
                <LegacyParserPage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/admin/finances"
            element={
              <AuthenticatedApp allowedRoles={ADMIN_ONLY}>
                <AdminFinancesPage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/finances"
            element={
              <AuthenticatedApp>
                <FinancesDashboardPage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/camisetas"
            element={
              <AuthenticatedApp>
                <CamisetasPage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/admin/camisetas"
            element={
              <AuthenticatedApp allowedRoles={ADMIN_ONLY}>
                <AdminOrdersPage />
              </AuthenticatedApp>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
