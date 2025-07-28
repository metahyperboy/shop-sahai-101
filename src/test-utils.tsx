import React, { ReactElement, ReactNode } from 'react';
import { render as rtlRender, RenderOptions, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  route?: string;
};

// Create a test query client
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
};

type TestProviderProps = {
  children: ReactNode;
};

const TestProviders = ({ children }: TestProviderProps) => {
  const testQueryClient = createTestQueryClient();
  
  return (
    <QueryClientProvider client={testQueryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const customRender = (
  ui: ReactElement,
  { route = '/', ...renderOptions }: CustomRenderOptions = {}
): RenderResult & { testQueryClient: QueryClient } => {
  window.history.pushState({}, 'Test page', route);
  
  const testQueryClient = createTestQueryClient();
  const result = rtlRender(ui, {
    wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    ...renderOptions,
  });

  return {
    ...result,
    testQueryClient,
  };
};

// Re-export everything from @testing-library/react
export * from '@testing-library/react';
// Override the render method
export { customRender as render };