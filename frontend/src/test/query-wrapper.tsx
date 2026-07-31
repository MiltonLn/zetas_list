import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function queryWrapper(client: QueryClient = createTestQueryClient()) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

export function renderWithQueryClient(
  ui: ReactElement,
  client: QueryClient = createTestQueryClient(),
) {
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}
