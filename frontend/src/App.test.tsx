import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './lib/query-client';
import { authService } from './services/auth.service';
import { gamesService } from './services/games.service';

vi.mock('./services/auth.service', () => ({
  authService: {
    me: vi.fn(),
    login: vi.fn(),
  },
}));

vi.mock('./services/games.service', () => ({
  gamesService: {
    list: vi.fn(),
  },
}));

function renderApp() {
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

// Every page is lazy-loaded, so these assertions double as a check that the
// Suspense boundaries resolve instead of leaving the app on the fallback.
describe('App routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.mocked(gamesService.list).mockResolvedValue({
      data: { data: [], meta: { total: 0, page: 1, limit: 15, totalPages: 0 } },
    } as never);
    // RulesPage fetches its markdown; a real request would still be in flight
    // when the test environment tears down.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '# Reglas' }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lleva a login cuando no hay sesión', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: /Ingresar|Entrar/i })).toBeInTheDocument();
  });

  it('carga una ruta pública sin sesión', async () => {
    window.history.pushState({}, '', '/reglas');
    renderApp();
    // Match the page's own heading, not the fetched markdown: both contain
    // "Reglas" and a loose matcher resolves to whichever renders first.
    expect(
      await screen.findByRole('heading', { name: 'Reglas del Grupo 2026' }),
    ).toBeInTheDocument();
  });

  it('redirige la URL de pedidos de camisetas al inicio', async () => {
    localStorage.setItem('accessToken', 'token');
    vi.mocked(authService.me).mockResolvedValue({
      data: {
        id: 'u1',
        username: 'miembro',
        name: 'Miembro',
        role: 'member',
        phone: '3000000000',
      },
    } as never);
    window.history.pushState({}, '', '/camisetas');

    renderApp();

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('heading', { name: 'Pedido de Camisetas' })).not.toBeInTheDocument();
  });
});
