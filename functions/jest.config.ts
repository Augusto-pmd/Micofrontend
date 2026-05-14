import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^.*\\/config\\/firebase$': '<rootDir>/tests/__mocks__/firebase.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
};

export default config;
