import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

const LandingPageLight = lazy(() => import('../pages/LandingPageLight').then((m) => ({ default: m.LandingPageLight })));
const InvitePage = lazy(() => import('../pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const OwnerSettingsPage = lazy(() => import('../pages/OwnerSettingsPage').then((m) => ({ default: m.OwnerSettingsPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const EditProfilePage = lazy(() => import('../pages/EditProfilePage').then((m) => ({ default: m.EditProfilePage })));
const PublicProfilePage = lazy(() => import('../pages/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })));
const AlbumPage = lazy(() => import('../pages/AlbumPage').then((m) => ({ default: m.AlbumPage })));
const RankingPage = lazy(() => import('../pages/RankingPage').then((m) => ({ default: m.RankingPage })));
const JogarAgoraPage = lazy(() => import('../pages/JogarAgoraPage').then((m) => ({ default: m.JogarAgoraPage })));
const CasualMatchRoomPage = lazy(() => import('../pages/CasualMatchRoomPage').then((m) => ({ default: m.CasualMatchRoomPage })));
const LoginPage = lazy(() => import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const CompetitionsPage = lazy(() => import('../pages/competitions/CompetitionsPage').then((m) => ({ default: m.CompetitionsPage })));
const CompetitionDetailExperience = lazy(() => import('../pages/competitions/CompetitionDetailExperience').then((m) => ({ default: m.CompetitionDetailExperience })));
const CreateCompetitionPhaseThreePage = lazy(() => import('../pages/competitions/CreateCompetitionPhaseThreePage').then((m) => ({ default: m.CreateCompetitionPhaseThreePage })));
const StandingsPage = lazy(() => import('../pages/competitions/StandingsPage').then((m) => ({ default: m.StandingsPage })));
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));

function RouteShellFallback() {
  return (
    <main className="min-h-dvh bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] text-slate-900">
      <div className="mx-auto max-w-lg">
        <div className="flex h-12 items-center justify-between border-b border-slate-100">
          <span className="text-lg font-black text-[#073B8C]">Chavea</span>
          <span className="h-8 w-8 rounded-full bg-slate-100" aria-hidden="true" />
        </div>
        <div className="mt-4 h-24 rounded-2xl bg-slate-50" />
      </div>
    </main>
  );
}

function deferred(element: ReactNode) {
  return <Suspense fallback={<RouteShellFallback />}>{element}</Suspense>;
}

const Placeholder = ({ title }: { title: string }) => (
  <main className="mx-auto max-w-lg bg-white p-6 text-slate-900">
    <h1 className="text-2xl font-black">{title}</h1>
    <p className="mt-2 text-slate-500">Esta área está em evolução no Chavea.</p>
  </main>
);

export const router = createBrowserRouter([
  { path: '/', element: deferred(<LandingPageLight />) },
  { path: '/login', element: deferred(<LoginPage />) },
  { path: '/register', element: deferred(<RegisterPage />) },
  { path: '/forgot-password', element: deferred(<ForgotPasswordPage />) },
  { path: '/invite/:id', element: deferred(<InvitePage />) },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/dashboard', element: deferred(<DashboardPage />) },
      { path: '/play', element: deferred(<JogarAgoraPage />) },
      { path: '/play/rooms/:roomId', element: deferred(<CasualMatchRoomPage />) },
      { path: '/competitions', element: deferred(<CompetitionsPage />) },
      { path: '/competitions/new', element: deferred(<CreateCompetitionPhaseThreePage />) },
      { path: '/competitions/:competitionId', element: deferred(<CompetitionDetailExperience />) },
      { path: '/competitions/:competitionId/standings', element: deferred(<StandingsPage />) },
      { path: '/matches', element: <Placeholder title="Jogos" /> },
      { path: '/ranking', element: deferred(<RankingPage />) },
      { path: '/profile', element: deferred(<ProfilePage />) },
      { path: '/profile/edit', element: deferred(<EditProfilePage />) },
      { path: '/profile/album', element: deferred(<AlbumPage />) },
      { path: '/profile/:userId', element: deferred(<PublicProfilePage />) },
      { path: '/owner/settings', element: deferred(<OwnerSettingsPage />) },
    ],
  },
]);
