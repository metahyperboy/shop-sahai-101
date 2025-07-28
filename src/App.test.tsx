import React from 'react';
import { render } from './test-utils';
import App from './App';

type MockSupabaseClient = {
  auth: {
    onAuthStateChange: jest.Mock;
    getSession: jest.Mock;
  };
};

declare global {
  namespace jest {
    interface Mock<T = any> {
      (...args: any[]): any;
      mockImplementation: (impl: (...args: any[]) => any) => Mock;
      mockResolvedValue: (value: any) => Mock;
      mockImplementationOnce: (impl: (...args: any[]) => any) => Mock;
      mockResolvedValueOnce: (value: any) => Mock;
    }
  }
}

// Mock the supabase client
const mockSupabaseClient: MockSupabaseClient = {
  auth: {
    onAuthStateChange: jest.fn((callback) => {
      // Simulate auth state change
      const { data: { subscription } } = {
        data: {
          subscription: {
            unsubscribe: jest.fn()
          }
        }
      };
      // Simulate initial auth state
      callback('SIGNED_OUT', null);
      return { subscription };
    }),
    getSession: jest.fn().mockResolvedValue({ 
      data: { session: null },
      error: null 
    }),
  },
};

// Mock the supabase client module
jest.mock('@/integrations/supabase/client', () => mockSupabaseClient);

describe('App', () => {
  // Reset all mocks after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    const { container } = render(<App />);
    // Check for loading state
    const loadingElement = container.querySelector('[role="status"]');
    expect(loadingElement).toBeInTheDocument();
  });

  it('renders auth page when not authenticated', async () => {
    const { findByText } = render(<App />);
    // Check if auth page is rendered
    const authElement = await findByText(/sign in/i);
    expect(authElement).toBeInTheDocument();
  });
});
