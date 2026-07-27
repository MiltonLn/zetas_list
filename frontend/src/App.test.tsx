import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Every page is lazy-loaded, so these assertions double as a check that the
// Suspense boundaries resolve instead of leaving the app on the fallback.
describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    // RulesPage fetches its markdown; a real request would still be in flight
    // when the test environment tears down.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '# Reglas' }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('lleva a login cuando no hay sesión', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /Ingresar|Entrar/i })).toBeInTheDocument();
  });

  it('carga una ruta pública sin sesión', async () => {
    window.history.pushState({}, '', '/reglas');
    render(<App />);
    expect(await screen.findByText(/Reglas/i)).toBeInTheDocument();
  });
});
