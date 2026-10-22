// Karma coverage gate. Thresholds are the current totals, truncated.
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/personal-website'),
      subdir: '.',
      reporters: [{ type: 'text-summary' }, { type: 'json-summary' }],
      check: {
        global: {
          statements: 62,
          branches: 48,
          functions: 56,
          lines: 64,
        },
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
