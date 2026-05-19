import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

let responseInterceptor: (error: AxiosError) => Promise<unknown>;

vi.mock('axios', async () => {
  const actual = await vi.importActual('axios');
  const interceptors = {
    request: { use: vi.fn() },
    response: {
      use: vi.fn((_onSuccess: unknown, onError: unknown) => {
        responseInterceptor = onError as typeof responseInterceptor;
      }),
    },
  };
  const instance = {
    interceptors,
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  };
  return {
    ...actual,
    default: {
      ...(actual as Record<string, unknown>),
      create: vi.fn(() => instance),
      isAxiosError: (actual as { isAxiosError: (e: unknown) => boolean }).isAxiosError,
      post: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: { location: { href: '' } },
    writable: true,
  });
});

afterEach(() => vi.restoreAllMocks());

function make401Error(url: string): AxiosError {
  const config = { url, headers: {} } as InternalAxiosRequestConfig;
  const error = new AxiosError('Unauthorized', '401', config, null, {
    status: 401,
    data: { message: 'Credenciales inválidas' },
    statusText: 'Unauthorized',
    headers: {},
    config,
  } as AxiosResponse);
  error.config = config;
  return error;
}

describe('Axios response interceptor', () => {
  beforeEach(async () => {
    await import('./api');
  });

  it('rechaza directamente para /auth/login sin redirect', async () => {
    const error = make401Error('/auth/login');

    await expect(responseInterceptor(error)).rejects.toThrow();
    expect(globalThis.window.location.href).not.toBe('/login');
  });

  it('rechaza directamente para /auth/change-password sin redirect', async () => {
    const error = make401Error('/auth/change-password');

    await expect(responseInterceptor(error)).rejects.toThrow();
    expect(globalThis.window.location.href).not.toBe('/login');
  });

  it('redirige a /login cuando no hay refreshToken y no es auth endpoint', async () => {
    vi.mocked(globalThis.localStorage.getItem).mockReturnValue(null);
    const error = make401Error('/games');

    await expect(responseInterceptor(error)).rejects.toThrow();
    expect(globalThis.localStorage.clear).toHaveBeenCalled();
    expect(globalThis.window.location.href).toBe('/login');
  });
});

describe('getApiError', () => {
  it('extrae message de un AxiosError', async () => {
    const { getApiError } = await import('./api');
    const error = new AxiosError('fail', '400', undefined, null, {
      status: 400,
      data: { message: 'Campo inválido' },
      statusText: 'Bad Request',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    } as AxiosResponse);

    expect(getApiError(error)).toBe('Campo inválido');
  });

  it('retorna mensaje genérico para errores desconocidos', async () => {
    const { getApiError } = await import('./api');
    expect(getApiError(new Error('random'))).toBe('Ha ocurrido un error inesperado');
  });
});
