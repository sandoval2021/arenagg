import { Suspense, lazy, type PropsWithChildren, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

const LandingPageLight = lazy(() => import('../pages/LandingPageLight').then((m) => ({ default: m.LandingPageLight })));
const LoginPage = lazy(() => import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const InvitePage = lazy(() => import('../pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const JogarAgoraPage = lazy(() => import('../pages/JogarAgoraPage').then((m) => ({ default: m.JogarAgoraPage })));
const CasualMatchRoomPage = lazy(() => import('../pages/CasualMatchRoomPage').then((m) => ({ default: m.CasualMatchRoomPage })));
const CompetitionsPage = lazy(() => import('../pages/competitions/CompetitionsPage').then((m) => ({ default: m.CompetitionsPage })));
const CompetitionDetailExperience = lazy(() => import('../pages/competitions/CompetitionDetailExperience').then((m) => ({ default: m.CompetitionDetailExperience })));
const CreateCompetitionPhaseThreePage = lazy(() => import('../pages/competitions/CreateCompetitionPhaseThreePage').then((m) => ({ default: m.CreateCompetitionPhaseThreePage })));
const StandingsPage = lazy(() => import('../pages/competitions/StandingsPage').then((m) => ({ default: m.StandingsPage })));
const RankingPage = lazy(() => import('../pages/RankingPage').then((m) => ({ default: m.RankingPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const EditProfilePage = lazy(() => import('../pages/EditProfilePage').then((m) => ({ default: m.EditProfilePage })));
const AlbumPage = lazy(() => import('../pages/AlbumPage').then((m) => ({ default: m.AlbumPage })));
const PublicProfilePage = lazy(() => import('../pages/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })));
const OwnerSettingsPage = lazy(() => import('../pages/OwnerSettingsPage').then((m) => ({ default: m.OwnerSettingsPage })));

function RouteChunk({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" aria-label="Abrindo tela" />}>
      {children}
    </Suspense>
  );
}

const lazyElement = (element: ReactNode) => <RouteChunk>{element}</RouteChunk>;

const Placeholder = ({ title }: { title: string }) => (
  <main className="mx-auto max-w-lg bg-white p-6 text-slate-900">
    <h1 className="text-2xl font-black">{title}</h1>
    <p className="mt-2 text-slate-500">Esta área está em evolução no Chavea.</p>
  </main>
);

export const router = createBrowserRouter([
  { path: '/', element: lazyElement(<LandingPageLight />) },
  { path: '/login', element: lazyElement(<LoginPage />) },
  { path: '/register', element: lazyElement(<RegisterPage />) },
  { path: '/forgot-password', element: lazyElement(<ForgotPasswordPage />) },
  { path: '/invite/:id', element: lazyElement(<InvitePage />) },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/dashboard', element: lazyElement(<DashboardPage />) },
      { path: '/play', element: lazyElement(<JogarAgoraPage />) },
      { path: '/play/rooms/:roomId', element: lazyElement(<CasualMatchRoomPage />) },
      { path: '/competitions', element: lazyElement(<CompetitionsPage />) },
      { path: '/competitions/new', element: lazyElement(<CreateCompetitionPhaseThreePage />) },
      { path: '/competitions/:competitionId', element: lazyElement(<CompetitionDetailExperience />) },
      { path: '/competitions/:competitionId/standings', element: lazyElement(<StandingsPage />) },
      { path: '/matches', element: <Placeholder title="Jogos" /> },
      { path: '/ranking', element: lazyElement(<RankingPage />) },
      { path: '/profile', element: lazyElement(<ProfilePage />) },
      { path: '/profile/edit', element: lazyElement(<EditProfilePage />) },
      { path: '/profile/album', element: lazyElement(<AlbumPage />) },
      { path: '/profile/:userId', element: lazyElement(<PublicProfilePage />) },
      { path: '/owner/settings', element: lazyElement(<OwnerSettingsPage />) },
    ],
  },
]);
