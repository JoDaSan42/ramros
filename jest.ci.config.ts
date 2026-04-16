import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__/integration'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**'
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^vscode$': '<rootDir>/src/__tests__/integration/__mocks__/vscode.js'
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration/setup.ts'],
  testTimeout: 30000,
  // Skip tests that require ROS environment
  testPathIgnorePatterns: [
    '<rootDir>/src/__tests__/integration/terminal-manager.integration.test.ts',
    '<rootDir>/src/__tests__/integration/tree-provider.integration.test.ts',
    '<rootDir>/src/__tests__/integration/workspace-detector.integration.test.ts',
    '<rootDir>/src/__tests__/integration/wizard/package-creator.test.ts'
  ]
};

export default config;
