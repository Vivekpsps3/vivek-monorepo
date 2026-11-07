const path = require('path');
const { createRequire } = require('module');

// Karma coverage gate. Thresholds sit about 1 point below the measured totals.
// Karma only instruments files the specs load, so these are not whole-app coverage.
const coverageGates = {
  web: {
    statements: 60,
    branches: 52,
    functions: 56,
    lines: 62,
  },
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

// Coverage stays ON by default: the gates below are part of the canonical
// test pass and CI reads the coverage-summary.json this config writes.
// SUITE_KARMA_COVERAGE=0 is the local fast-iteration path (see
// `make test-frontend-quick`, which also passes --code-coverage=false so the
// builder skips instrumentation). A run with coverage off is NOT a gate run.
const coverageEnabled = process.env.SUITE_KARMA_COVERAGE !== '0';
// CI logs are write-only: the dots reporter produces the same pass/fail and
// executed-count summary with far less output than the progress reporter.
const ciMode = !!process.env.CI;

module.exports = function (config) {
  const projectDir = process.cwd();
  const projectName = process.env.SUITE_TEST_PROJECT;
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
      ...(coverageEnabled ? [requireFromProject('karma-coverage')] : []),
      requireFromProject('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    ...(coverageEnabled
      ? {
          coverageReporter: {
            dir: path.join(projectDir, ({ 'finance-app': 'apps/finance/frontend', 'personal-website': 'apps/site', web: 'apps/web' })[projectName], 'coverage', projectName),
            subdir: '.',
            reporters: [{ type: 'text-summary' }, { type: 'json-summary' }],
            check: {
              global: gate,
            },
          },
        }
      : {}),
    reporters: coverageEnabled
      ? [ciMode ? 'dots' : 'progress', 'coverage']
      : [ciMode ? 'dots' : 'progress'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--no-first-run',
        ],
      },
    },
    browsers: ['ChromeHeadlessCI'],
    restartOnFileChange: true,
    // Disconnect tolerance for loaded shared runners. The browser connects
    // while webpack is still building the test bundle; under load it can
    // starve past the default no-activity window, disconnect, and leave the
    // run hung (observed on this repo's runner pool: disconnect after
    // "no message in 30000 ms" during bundle generation, run never
    // recovered). These values only govern how long Karma waits for the
    // browser — no spec timeout, retry, or assertion changes.
    browserNoActivityTimeout: 120_000,
    browserDisconnectTimeout: 10_000,
    captureTimeout: 120_000,
  });
};
