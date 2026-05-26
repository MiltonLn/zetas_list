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
import { FinancesDashboardPage } from './pages/FinancesDashboardPage';
import { AdminFinancesPage } from './pages/AdminFinancesPage';

function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  return (
    <PrivateRoute>
      <AppLayout>{children}</AppLayout>
    </PrivateRoute>
  );
}

function AdminApp({ children }: { children: React.ReactNode }) {
  return (
    <PrivateRoute adminOnly>
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
              <AdminApp>
                <AdminUsersPage />
              </AdminApp>
            }
          />
          <Route
            path="/admin/games/new"
            element={
              <AdminApp>
                <CreateGamePage />
              </AdminApp>
            }
          />
          <Route
            path="/admin/legacy-parser"
            element={
              <AdminApp>
                <LegacyParserPage />
              </AdminApp>
            }
          />
          <Route
            path="/admin/finances"
            element={
              <AdminApp>
                <AdminFinancesPage />
              </AdminApp>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
