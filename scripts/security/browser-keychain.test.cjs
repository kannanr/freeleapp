const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('test-browser launchers use a mock keychain rather than macOS password storage', () => {
  const file = path.join(__dirname, '../../packages/desktop-app/karma.conf.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module,
    __dirname: path.dirname(file),
    require: name => name === 'path' ? path : {},
  });
  let configuration;
  module.exports({ LOG_INFO: 1, set: value => { configuration = value; } });
  assert.equal(configuration.browsers[0], 'ChromeSafe');
  for (const name of ['ChromeSafe', 'ChromeHeadlessSafe', 'ChromeHeadlessCI']) {
    const flags = Array.from(configuration.customLaunchers[name].flags);
    assert.ok(flags.includes('--use-mock-keychain'), `${name} must avoid the user's login keychain`);
    assert.ok(flags.includes('--password-store=basic'), `${name} must use its throwaway profile's storage`);
  }
});
