// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Routes déclarées en code (pas de génération de fichiers) : l'arborescence tient sur
// un écran et reste lisible.

import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from './components/AppShell.js';
import { Loading } from './components/ui.js';
import { SessionProvider, useCurrentSession } from './lib/session.js';
import { LoginPage } from './routes/login.js';
import {
  EmailConfirmationPage,
  PasswordForgottenPage,
  PasswordResetPage,
} from './routes/password.js';
import { DashboardPage } from './routes/dashboard.js';
import { PlanPage } from './routes/plan.js';
import { PlantingDetailPage } from './routes/plantingDetail.js';
import { TasksPage } from './routes/tasks.js';
import { HarvestsPage } from './routes/harvests.js';

const rootRoute = createRootRoute({
  component: () => (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  ),
});

/** Toutes les pages métier passent par la coquille ; sans session, on renvoie à la connexion. */
function ProtectedLayout() {
  const { session, isLoading, farm } = useCurrentSession();
  if (isLoading) return <Loading />;
  if (!session) {
    window.location.href = '/connexion';
    return <Loading />;
  }
  if (!farm) return <Loading />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/connexion',
  component: LoginPage,
});

const forgottenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mot-de-passe-oublie',
  component: PasswordForgottenPage,
});

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mot-de-passe/$token',
  component: function ResetRoute() {
    const { token } = resetRoute.useParams();
    return <PasswordResetPage token={token} />;
  },
});

const confirmationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/confirmation/$token',
  component: function ConfirmationRoute() {
    const { token } = confirmationRoute.useParams();
    return <EmailConfirmationPage token={token} />;
  },
});

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  component: ProtectedLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: DashboardPage,
});
const planRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/plan',
  component: PlanPage,
});
const newPlantingRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/plan/nouvelle',
  component: () => <PlantingDetailPage plantingId={null} />,
});
const plantingRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/plan/$plantingId',
  component: function PlantingRoute() {
    const { plantingId } = plantingRoute.useParams();
    return <PlantingDetailPage plantingId={Number(plantingId)} />;
  },
});
const tasksRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/taches',
  component: TasksPage,
});
const bedsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/assolement',
  component: lazyRouteComponent(() => import('./routes/beds.js'), 'BedsPage'),
});
const ordersRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/commandes',
  component: lazyRouteComponent(() => import('./routes/orders.js'), 'OrdersPage'),
});
const harvestsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/recoltes',
  component: HarvestsPage,
});
const notesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/notes',
  component: lazyRouteComponent(() => import('./routes/notes.js'), 'NotesPage'),
});
const statsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/statistiques',
  component: lazyRouteComponent(() => import('./routes/stats.js'), 'StatsPage'),
});
const trainingRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/formation',
  component: lazyRouteComponent(() => import('./routes/training.js'), 'TrainingPage'),
});
const mapRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/carte',
  component: lazyRouteComponent(() => import('./routes/map.js'), 'MapPage'),
});
const moonRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/calendrier-lunaire',
  component: lazyRouteComponent(() => import('./routes/moonMonth.js'), 'MoonMonthPage'),
});
const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/parametres',
  component: lazyRouteComponent(() => import('./routes/settings.js'), 'SettingsPage'),
});

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
  component: () => null,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  forgottenRoute,
  resetRoute,
  confirmationRoute,
  protectedRoute.addChildren([
    dashboardRoute,
    planRoute,
    newPlantingRoute,
    plantingRoute,
    tasksRoute,
    bedsRoute,
    ordersRoute,
    harvestsRoute,
    notesRoute,
    statsRoute,
    trainingRoute,
    mapRoute,
    moonRoute,
    settingsRoute,
  ]),
  notFoundRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
