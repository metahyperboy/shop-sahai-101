// This file contains type definitions for Jest
// that are not automatically included by @types/jest

declare namespace jest {
  interface Matchers<R> {
    toBeInTheDocument(): R;
    toHaveTextContent(text: string | RegExp): R;
    toHaveAttribute(attr: string, value?: any): R;
    toBeVisible(): R;
    toBeDisabled(): R;
    toBeEnabled(): R;
    toHaveClass(...classNames: string[]): R;
    toHaveStyle(css: string): R;
  }
}

// Add global Jest types
declare var describe: jest.Describe;
declare var it: jest.It;
declare var test: jest.It;
declare var expect: jest.Expect;
declare var beforeAll: jest.Lifecycle;
declare var afterAll: jest.Lifecycle;
declare var beforeEach: jest.Lifecycle;
declare var afterEach: jest.Lifecycle;
declare var jest: jest.Jest;

declare module '@testing-library/jest-dom' {
  interface Matchers<R> {
    toBeInTheDocument(): R;
    toHaveTextContent(text: string | RegExp): R;
    toHaveAttribute(attr: string, value?: any): R;
    toBeVisible(): R;
    toBeDisabled(): R;
    toBeEnabled(): R;
    toHaveClass(...classNames: string[]): R;
    toHaveStyle(css: string): R;
  }
}
