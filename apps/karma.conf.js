const path = require('path');
const { createRequire } = require('module');

// Karma coverage gate. Thresholds sit about 1 point below the measured totals.
// Karma only instruments files the specs load, so these are not whole-app coverage.
const coverageGates = {
  'finance-app': {
    statements: 60,
    branches: 52,
    functions: 56,
    lines: 62,
  },
  'personal-website': {
    statements: 61,
    branches: 47,
    functions: 55,
    lines: 63,
  },
};

module.exports = function (config) {
  const projectDir = process.cwd();
  const projectName = require(path.join(projectDir, 'package.json')).name;
  const gate = coverageGates[projectName];
  if (!gate) {
    throw new Error(`No Karma coverage gate for ${projectName} (${projectDir})`);
  }
  const requireFromProject = createRequire(path.join(projectDir, 'package.json'));

  config.set({
    basePath: projectDir,
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      requireFromProject('karma-jasmine'),
      requireFromProject('karma-chrome-launcher'),
      requireFromProject('karma-jasmine-html-reporter'),
      requireFromProject('karma-coverage'),
      requireFromProject('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: path.join(projectDir, 'coverage', projectName),
      subdir: '.',
      reporters: [{ type: 'text-summary' }, { type: 'json-summary' }],
      check: {
        global: gate,
      },
    },
    reporters: ['progress', 'coverage'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-dev-shm-usage'],
      },
    },
    browsers: ['ChromeHeadlessCI'],
    restartOnFileChange: true,
  });
};
