import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { AppLayout } from './components/AppLayout';
import { ToastContainer } from './components/Toast';
import { Spinner } from './components/Spinner';
import { ADMIN_ONLY, GAME_MANAGERS } from './utils/roles';
import type { Role } from './types';

// One chunk per route: most users only ever open the home page and a game, so
// there's no reason to ship the admin and finance screens up front.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const GameDetailPage = lazy(() => import('./pages/GameDetailPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const CreateGamePage = lazy(() => import('./pages/CreateGamePage'));
const LegacyParserPage = lazy(() => import('./pages/LegacyParserPage'));
const RulesPage = lazy(() => import('./pages/RulesPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
const FinancesDashboardPage = lazy(() => import('./pages/FinancesDashboardPage'));
const AdminFinancesPage = lazy(() => import('./pages/AdminFinancesPage'));
const AdminOrdersPage = lazy(() => import('./pages/AdminOrdersPage'));
const TournamentsPage = lazy(() => import('./pages/TournamentsPage'));
const TournamentDetailPage = lazy(() => import('./pages/TournamentDetailPage'));
const PublicTournamentPage = lazy(() => import('./pages/PublicTournamentPage'));
const AdminTournamentsPage = lazy(() => import('./pages/AdminTournamentsPage'));
const AdminTournamentDetailPage = lazy(() => import('./pages/AdminTournamentDetailPage'));

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Spinner size={40} />
    </div>
  );
}

/** Full-viewport fallback for routes rendered outside the app shell. */
function FullPageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spinner size={48} />
    </div>
  );
}

function AuthenticatedApp({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: readonly Role[];
}) {
  return (
    <PrivateRoute allowedRoles={allowedRoles}>
      {/* Suspense sits inside the layout so the sidebar stays put while the
          page chunk loads. */}
      <AppLayout>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </AppLayout>
    </PrivateRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastContainer />
        <Suspense fallback={<FullPageFallback />}>
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
              path="/admin/camisetas"
              element={
                <AuthenticatedApp allowedRoles={ADMIN_ONLY}>
                  <AdminOrdersPage />
                </AuthenticatedApp>
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
                <AuthenticatedApp allowedRoles={ADMIN_ONLY}>
                  <AdminTournamentsPage />
                </AuthenticatedApp>
              }
            />
            <Route
              path="/admin/torneos/:id"
              element={
                <AuthenticatedApp allowedRoles={ADMIN_ONLY}>
                  <AdminTournamentDetailPage />
                </AuthenticatedApp>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
