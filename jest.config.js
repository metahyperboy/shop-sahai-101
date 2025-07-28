export default {
  testEnvironment: 'jsdom',
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@testing-library/jest-dom/extend-expect$': '<rootDir>/node_modules/@testing-library/jest-dom',
    '^@testing-library/react$': '<rootDir>/node_modules/@testing-library/react',
    '^@testing-library/user-event$': '<rootDir>/node_modules/@testing-library/user-event',
    '^@testing-library/dom$': '<rootDir>/node_modules/@testing-library/dom',
  },
  transform: {
    '^.+\.[jt]sx?$': ['babel-jest', { configFile: './babel.config.js' }],
    '^.+\.(css|less|scss|sass)$': 'jest-transform-stub',
  },
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/src/setupTests.ts',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs|@testing-library|@radix-ui|@babel))',
  ],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleDirectories: ['node_modules', 'src'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
  
  // Module file extensions
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/.next/',
    '/out/'
  ],
  
  // Coverage settings
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
    '!src/**/index.{js,jsx,ts,tsx}'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json', 'clover'],
  
  // TypeScript support
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
  
  // Test timeout
  testTimeout: 10000,
};
