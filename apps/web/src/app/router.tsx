import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { LandingPage } from '../pages/LandingPage';
import { InvitePage } from '../pages/InvitePage';
import { OwnerSettingsPage } from '../pages/OwnerSettingsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { CompetitionsPage } from '../pages/competitions/CompetitionsPage';
import { CompetitionDetailPage } from '../pages/competitions/CompetitionDetailPage';
import { CreateCompetitionPage } from '../pages/competitions/CreateCompetitionPage';
import { StandingsPage } from '../pages/competitions/StandingsPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';

const Placeholder = ({ title }: { title: string }) => (
  <main className="mx-auto max-w-lg bg-white p-6 text-slate-900">
    <h1 className="text-2xl font-black">{title}</h1>
    <p className="mt-2 text-slate-500">Esta área está em evolução no ArenaGG.</p>
  </main>
);

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/invite/:id', element: <InvitePage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/competitions', element: <CompetitionsPage /> },
      { path: '/competitions/new', element: <CreateCompetitionPage /> },
      { path: '/competitions/:competitionId', element: <CompetitionDetailPage /> },
      { path: '/competitions/:competitionId/standings', element: <StandingsPage /> },
      { path: '/matches', element: <Placeholder title="Jogos" /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/owner/settings', element: <OwnerSettingsPage /> },
    ],
  },
]);
