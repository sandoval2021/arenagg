import { Suspense, lazy, type PropsWithChildren, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

const LandingPageLight = lazy(() => import('../pages/LandingPageLight').then((module) => ({ default: module.LandingPageLight })));
const LoginPage = lazy(() => import('../pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })));
const InvitePage = lazy(() => import('../pages/InvitePage').then((module) => ({ default: module.InvitePage })));
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const JogarAgoraPage = lazy(() => import('../pages/JogarAgoraPage').then((module) => ({ default: module.JogarAgoraPage })));
const CasualMatchRoomPage = lazy(() => import('../pages/CasualMatchRoomPage').then((module) => ({ default: module.CasualMatchRoomPage })));
const CompetitionsPage = lazy(() => import('../pages/competitions/CompetitionsPage').then((module) => ({ default: module.CompetitionsPage })));
const CompetitionDetailExperience = lazy(() => import('../pages/competitions/CompetitionDetailExperience').then((module) => ({ default: module.CompetitionDetailExperience })));
const CreateCompetitionPhaseThreePage = lazy(() => import('../pages/competitions/CreateCompetitionPhaseThreePage').then((module) => ({ default: module.CreateCompetitionPhaseThreePage })));
const StandingsPage = lazy(() => import('../pages/competitions/StandingsPage').then((module) => ({ default: module.StandingsPage })));
const RankingPage = lazy(() => import('../pages/RankingPage').then((module) => ({ default: module.RankingPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const EditProfilePage = lazy(() => import('../pages/EditProfilePage').then((module) => ({ default: module.EditProfilePage })));
const AlbumPage = lazy(() => import('../pages/AlbumPage').then((module) => ({ default: module.AlbumPage })));
const PublicProfilePage = lazy(() => import('../pages/PublicProfilePage').then((module) => ({ default: module.PublicProfilePage })));
const OwnerSettingsPage = lazy(() => import('../pages/OwnerSettingsPage').then((module) => ({ default: module.OwnerSettingsPage })));

function RouteChunk({ children }: PropsWithChildren) {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] text-slate-900">
          <div className="mx-auto max-w-lg animate-pulse space-y-3 py-4" aria-label="Abrindo tela">
            <div className="h-5 w-32 rounded-full bg-slate-100" />
            <div className="h-24 rounded-3xl bg-slate-100" />
            <div className="h-16 rounded-2xl bg-slate-50" />
          </div>
        </main>
      }
    >
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
