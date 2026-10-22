// Karma coverage gate. Thresholds sit about 1 point below the measured totals.
// Karma only instruments files the specs load, so these are not whole-app coverage.
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
          statements: 61,
          branches: 47,
          functions: 55,
          lines: 63,
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
