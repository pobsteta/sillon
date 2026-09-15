// SPDX-FileCopyrightText: © 2026 Sillon contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router.js';
import { setupI18n } from './i18n/index.js';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Au champ, on tolère des données un peu anciennes plutôt qu'un écran vide.
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount) => navigator.onLine && failureCount < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

await setupI18n();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
