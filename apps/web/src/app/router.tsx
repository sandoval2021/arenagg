import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { LandingPageLight } from '../pages/LandingPageLight';
import { InvitePage } from '../pages/InvitePage';
import { OwnerSettingsPage } from '../pages/OwnerSettingsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { EditProfilePage } from '../pages/EditProfilePage';
import { PublicProfilePage } from '../pages/PublicProfilePage';
import { AlbumPage } from '../pages/AlbumPage';
import { RankingPage } from '../pages/RankingPage';
import { JogarAgoraPage } from '../pages/JogarAgoraPage';
import { CasualMatchRoomPage } from '../pages/CasualMatchRoomPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { CompetitionsPage } from '../pages/competitions/CompetitionsPage';
import { CompetitionDetailExperience } from '../pages/competitions/CompetitionDetailExperience';
import { CreateCompetitionPhaseThreePage } from '../pages/competitions/CreateCompetitionPhaseThreePage';
import { StandingsPage } from '../pages/competitions/StandingsPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';

const Placeholder = ({ title }: { title: string }) => (
  <main className="mx-auto max-w-lg bg-white p-6 text-slate-900">
    <h1 className="text-2xl font-black">{title}</h1>
    <p className="mt-2 text-slate-500">Esta área está em evolução no Chavea.</p>
  </main>
);

export const router = createBrowserRouter([
  { path: '/', element: <LandingPageLight /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/invite/:id', element: <InvitePage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/play', element: <JogarAgoraPage /> },
      { path: '/play/rooms/:roomId', element: <CasualMatchRoomPage /> },
      { path: '/competitions', element: <CompetitionsPage /> },
      { path: '/competitions/new', element: <CreateCompetitionPhaseThreePage /> },
      { path: '/competitions/:competitionId', element: <CompetitionDetailExperience /> },
      { path: '/competitions/:competitionId/standings', element: <StandingsPage /> },
      { path: '/matches', element: <Placeholder title="Jogos" /> },
      { path: '/ranking', element: <RankingPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/profile/edit', element: <EditProfilePage /> },
      { path: '/profile/album', element: <AlbumPage /> },
      { path: '/profile/:userId', element: <PublicProfilePage /> },
      { path: '/owner/settings', element: <OwnerSettingsPage /> },
    ],
  },
]);
