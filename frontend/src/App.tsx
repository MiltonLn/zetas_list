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
import TournamentsPage from './pages/TournamentsPage';
import TournamentDetailPage from './pages/TournamentDetailPage';
import PublicTournamentPage from './pages/PublicTournamentPage';
import AdminTournamentsPage from './pages/AdminTournamentsPage';
import AdminTournamentDetailPage from './pages/AdminTournamentDetailPage';

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
              <AdminApp>
                <AdminOrdersPage />
              </AdminApp>
            }
          />
          <Route
            path="/torneos"
            element={
              <AuthenticatedApp>
                <TournamentsPage />
              </AuthenticatedApp>
            }
          />
          <Route
            path="/torneos/:id"
            element={
              <AuthenticatedApp>
                <TournamentDetailPage />
              </AuthenticatedApp>
            }
          />
          <Route path="/t/:id" element={<PublicTournamentPage />} />
          <Route
            path="/admin/torneos"
            element={
              <AdminApp>
                <AdminTournamentsPage />
              </AdminApp>
            }
          />
          <Route
            path="/admin/torneos/:id"
            element={
              <AdminApp>
                <AdminTournamentDetailPage />
              </AdminApp>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
