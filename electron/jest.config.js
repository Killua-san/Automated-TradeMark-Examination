module.exports = {
  // Use jsdom to simulate a browser environment for tests
  testEnvironment: 'jest-environment-jsdom',

  // Automatically extend Jest expect with @testing-library/jest-dom matchers
  setupFilesAfterEnv: ['@testing-library/jest-dom'],

  // Define transformations: Use Babel for JS/JSX files
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },

  // Module Name Mapper: Handle static assets if needed (can be expanded)
  // This helps Jest ignore CSS/image imports that it can't process
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy', // Mocks CSS Modules
    // Add mappings for images or other assets if necessary
    // '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },

  // Indicate where source files are (optional but good practice)
  roots: ['<rootDir>/src'],

  // Collect coverage information
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js', // Often exclude the main entry point
    '!src/reportWebVitals.js', // Exclude if present
    '!src/setupTests.js', // Exclude test setup files
  ],

  // Ignore patterns (e.g., node_modules)
  testPathIgnorePatterns: ['/node_modules/'],
  transformIgnorePatterns: [
    '/node_modules/',
    // Add specific modules here if they cause issues with transformation
    // Example: '/node_modules/(?!(module-to-transform|another-module)/)'
  ],

  // Verbose output during tests
  verbose: true,
};
