import { createBrowserRouter } from 'react-router-dom';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { CreateCompetitionPage } from '../pages/competitions/CreateCompetitionPage';
import { StandingsPage } from '../pages/competitions/StandingsPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';

const Placeholder = ({ title }: { title: string }) => <main className="mx-auto max-w-lg p-6"><h1 className="text-2xl font-black">{title}</h1><p className="mt-2 text-slate-500">Esta área será conectada nas próximas etapas do Chavea.</p></main>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/', element: <DashboardPage /> },
  { path: '/competitions/new', element: <CreateCompetitionPage /> },
  { path: '/competitions/:competitionId/standings', element: <StandingsPage /> },
  { path: '/competitions', element: <Placeholder title="Campeonatos" /> },
  { path: '/competitions/:competitionId', element: <Placeholder title="Campeonato" /> },
  { path: '/matches', element: <Placeholder title="Jogos" /> },
  { path: '/profile', element: <Placeholder title="Perfil" /> },
]);
