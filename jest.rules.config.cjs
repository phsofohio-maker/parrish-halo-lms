/**
 * Jest config for Firestore security rules tests.
 * Runs only the rules suite which depends on the Firebase emulator.
 *
 * Usage:
 *   firebase emulators:start --only firestore   # in another terminal
 *   npm run test:rules
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/firestore_rules_test.ts'],
  moduleFileExtensions: ['ts', 'js'],
};
