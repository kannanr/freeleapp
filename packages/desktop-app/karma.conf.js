// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('karma-coverage-istanbul-reporter'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    files: [
      {
        pattern: 'karma-process-mock.js',
        type: 'js'
      },
      {
        pattern: 'src/**/*.ts',
        type: 'js' // To silence the warning. Means load with <script> tag.
      },
    ],
    client: {
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },
    coverageIstanbulReporter: {
      dir: require('path').join(__dirname, './coverage/leapp'),
      reports: ['html', 'lcovonly', 'text-summary'],
      fixWebpackSourcePaths: true
    },
    webpack: { node: { fs: 'empty', } },
    reporters: ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['ChromeSafe'],
    customLaunchers: {
      ChromeSafe: {
        base: 'Chrome',
        flags: ['--use-mock-keychain', '--password-store=basic'],
      },
      // Isolated test HOME/profile must never request the real macOS login keychain.
      ChromeHeadlessSafe: {
        base: 'ChromeHeadless',
        flags: ['--use-mock-keychain', '--password-store=basic'],
      },
      // GitHub-hosted Ubuntu runners block Chrome's user namespace sandbox
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'],
      },
    },
    singleRun: false,
    restartOnFileChange: true
  });
};
