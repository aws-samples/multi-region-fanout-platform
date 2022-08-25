module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/runtime'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
