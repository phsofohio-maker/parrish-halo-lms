/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Run only true unit tests by default. The Firestore rules suite lives in
  // tests/firestore_rules_test.ts and needs the emulator — run it via
  // `npm run test:rules`.
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: [
    'utils/**/*.ts',
    '!**/*.d.ts',
    '!**/__tests__/**',
  ],
  coverageThreshold: {
    'utils/gradeCalculation.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    'utils/certificateId.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
