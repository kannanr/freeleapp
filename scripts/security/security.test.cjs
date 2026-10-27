const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { writePrivateFileSync } = require('../../packages/core/src/services/private-file.ts');
const { isSafeExternalUrl } = require('../../packages/core/src/services/external-url.ts');
const { validateOAuthCallback } = require('../../packages/core/src/services/oauth-callback.ts');
const { isAppEntryUrl, isTrustedRendererEvent, hardenPrivilegedWindow } = require('../../packages/desktop-app/electron/security-policy.ts');

const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freeleapp-security-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const entry = pathToFileURL(path.join(dir, 'app/index.html')).href;

test('credential files are private even under a permissive umask', () => {
  const file = path.join(dir, 'new-credentials');
  const old = process.umask(0);
  try {
    writePrivateFileSync(fs, file, 'fake-token');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(file, 'utf8'), 'fake-token');
  } finally {
    process.umask(old);
  }
});

test('existing credential permissions are tightened before secrets are written', () => {
  const file = path.join(dir, 'existing-credentials');
  fs.writeFileSync(file, 'old-content');
  fs.chmodSync(file, 0o644);
  let checked = false;
  writePrivateFileSync({ ...fs, writeFileSync(fd, content) {
    assert.equal(fs.fstatSync(fd).mode & 0o777, 0o600);
    checked = true;
    fs.writeFileSync(fd, content);
  } }, file, 'new');
  assert.ok(checked);
  assert.equal(fs.readFileSync(file, 'utf8'), 'new');
});

test('symlinks cannot redirect credential writes', () => {
  const target = path.join(dir, 'symlink-target');
  const link = path.join(dir, 'symlink');
  fs.writeFileSync(target, 'unchanged');
  fs.symlinkSync(target, link);
  assert.throws(() => writePrivateFileSync(fs, link, 'secret'));
  assert.equal(fs.readFileSync(target, 'utf8'), 'unchanged');
});

test('hard links cannot redirect credential writes or truncate another file', () => {
  const target = path.join(dir, 'hardlink-target');
  const link = path.join(dir, 'hardlink');
  fs.writeFileSync(target, 'unchanged');
  fs.linkSync(target, link);
  assert.throws(() => writePrivateFileSync(fs, link, 'secret'), /non-private regular file/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'unchanged');
});

test('a permission failure closes the descriptor without truncating the old file', () => {
  const file = path.join(dir, 'permission-failure');
  fs.writeFileSync(file, 'unchanged');
  let closed = false;
  assert.throws(() => writePrivateFileSync({ ...fs,
    fchmodSync() { throw new Error('permission denied'); },
    closeSync(fd) { closed = true; fs.closeSync(fd); },
  }, file, 'secret'), /permission denied/);
  assert.ok(closed);
  assert.equal(fs.readFileSync(file, 'utf8'), 'unchanged');
});

test('Azure binary cache content is preserved', () => {
  const file = path.join(dir, 'azure-cache');
  const content = Buffer.from([0, 1, 2, 255]);
  writePrivateFileSync(fs, file, content);
  assert.deepEqual(fs.readFileSync(file), content);
});

test('HTTPS cloud and documentation links are allowed', () => {
  for (const value of ['https://github.com/kannanr/freeleapp', 'https://oidc.us-east-1.amazonaws.com/authorize?state=abc']) {
    assert.ok(isSafeExternalUrl(value));
  }
});

test('OS handlers, credential-bearing URLs and malformed URLs are blocked', () => {
  for (const value of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'mailto:user@example.com',
    'http://idp.example.com', 'https://user:password@example.com', 'https://example.com\\@evil.test',
    ' https://example.com', 'https://example.com\n', 'not a URL', null]) {
    assert.equal(isSafeExternalUrl(value), false, String(value));
  }
});

test('privileged navigation only allows the bundled entry document', () => {
  assert.ok(isAppEntryUrl(entry, entry));
  assert.ok(isAppEntryUrl(`${entry}#dashboard`, entry));
  for (const value of ['https://evil.test', 'file:///etc/passwd', `${entry}?code=anything`, `${entry}/other`, 'file://server/index.html']) {
    assert.equal(isAppEntryUrl(value, entry), false);
  }
});

test('IPC only accepts the privileged window main frame and local Angular routes', () => {
  const frame = { url: entry.replace('index.html', 'dashboard') };
  const contents = { mainFrame: frame };
  const event = { sender: contents, senderFrame: frame };
  assert.ok(isTrustedRendererEvent(event, contents, entry));
  assert.equal(isTrustedRendererEvent({ ...event, sender: {} }, contents, entry), false);
  assert.equal(isTrustedRendererEvent({ ...event, senderFrame: { url: entry } }, contents, entry), false);
  for (const value of ['https://evil.test', 'file:///etc/passwd', 'file://server/anything', entry.replace('/app/index.html', '/app-other/index.html'),
    entry.replace('index.html', '%2e%2e%2fsecret'), entry.replace('index.html', '%5csecret')]) {
    frame.url = value;
    assert.equal(isTrustedRendererEvent(event, contents, entry), false, value);
  }
});

test('navigation, redirects, webviews, popups and permission requests are denied', () => {
  const handlers = {};
  let popup, request, check;
  const win = { webContents: {
    on(name, handler) { handlers[name] = handler; },
    setWindowOpenHandler(handler) { popup = handler; },
    session: {
      setPermissionRequestHandler(handler) { request = handler; },
      setPermissionCheckHandler(handler) { check = handler; },
    },
  } };
  hardenPrivilegedWindow(win, entry);
  for (const name of ['will-navigate', 'will-redirect', 'will-attach-webview']) {
    let prevented = false;
    handlers[name]({ preventDefault() { prevented = true; } }, 'https://evil.test');
    assert.ok(prevented, name);
  }
  assert.deepEqual(popup({ url: 'https://evil.test' }), { action: 'deny' });
  request(null, 'media', allowed => assert.equal(allowed, false));
  assert.equal(check(null, 'media'), false);
});

const host = '127.0.0.1:12345';
const state = 'random-state-for-test';
const callback = target => validateOAuthCallback('GET', target, host, host, state);
test('PKCE only accepts a single code with the expected state', () => {
  assert.deepEqual(callback(`/oauth/callback?state=${state}&code=valid-code`), { kind: 'code', code: 'valid-code' });
  assert.deepEqual(callback(`/oauth/callback?state=${state}&error=access_denied`), { kind: 'error' });
});

test('unsolicited, malformed and conflicting PKCE callbacks are ignored', () => {
  for (const target of ['/favicon.ico', '/oauth/callback?code=stolen', '/oauth/callback?state=wrong&code=stolen',
    `/oauth/callback?state=${state}&state=${state}&code=a`, `/oauth/callback?state=${state}&code=a&code=b`,
    `/oauth/callback?state=${state}&code=a&error=denied`, `/oauth/callback?state=${state}&code=`,
    `https://evil.test/oauth/callback?state=${state}&code=a`, `//evil.test/oauth/callback?state=${state}&code=a`,
    `/oauth/callback?state=${state}&code=${'a'.repeat(8193)}`, `/oauth/callback?state=${state}&code=a#fragment`]) {
    assert.deepEqual(callback(target), { kind: 'ignore' }, target.slice(0, 100));
  }
  assert.deepEqual(validateOAuthCallback('POST', `/oauth/callback?state=${state}&code=a`, host, host, state), { kind: 'ignore' });
  assert.deepEqual(validateOAuthCallback('GET', `/oauth/callback?state=${state}&code=a`, 'evil.test', host, state), { kind: 'ignore' });
});

test('the packaged renderer has no remote scripts or executable CSP exceptions', () => {
  const html = fs.readFileSync(path.join(root, 'packages/desktop-app/src/index.html'), 'utf8');
  assert.doesNotMatch(html, /<script\b[^>]*src\s*=\s*["']https?:/i);
  const scripts = html.match(/script-src\s+([^;]+)/)[1];
  assert.equal(scripts.trim(), "'self'");
  assert.match(html, /object-src 'none'/);
  assert.match(html, /frame-src 'none'/);
});

test('the fork cannot update from upstream or enable unattended updates', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packages/desktop-app/package.json')));
  assert.equal(manifest.security.autoUpdatesEnabled, false);
  assert.equal(manifest.build.publish[0].owner, 'kannanr');
  assert.equal(manifest.build.publish[0].repo, 'freeleapp');
  assert.equal(manifest.build.appId, 'io.github.kannanr.freeleapp');
  const main = fs.readFileSync(path.join(root, 'packages/desktop-app/electron/main.ts'), 'utf8');
  assert.match(main, /metadata\.security\?\.autoUpdatesEnabled !== true/);
  assert.match(main, /autoUpdater\.autoInstallOnAppQuit = false/);
  assert.match(main, /devTools: !app\.isPackaged/);
  assert.doesNotMatch(main, /environment\.production|forceDevUpdateConfig/);
  assert.doesNotMatch(main, /sergioarojasm98/);
  const updater = fs.readFileSync(path.join(root, 'packages/desktop-app/src/app/services/updater.service.ts'), 'utf8');
  assert.doesNotMatch(updater, /httpClient|raw\.githubusercontent/);
});

test('AWS, Azure and SSM writes use the private-file boundary', () => {
  const service = fs.readFileSync(path.join(root, 'packages/core/src/services/file-service.ts'), 'utf8');
  assert.match(service, /writePrivateFileSync\(this\.nativeService\.fs, filePath, content\)/);
  const azure = fs.readFileSync(path.join(root, 'packages/core/src/services/azure-persistence-service.ts'), 'utf8');
  assert.match(azure, /writePrivateFileSync\(this\.iNativeService\.fs, location, finalData\)/);
  const ssm = fs.readFileSync(path.join(root, 'packages/core/src/services/ssm-service.ts'), 'utf8');
  assert.match(ssm, /this\.fileService\.writeFileSync\(/);
});

test('credential-bearing CI and release actions are pinned and fork-owned', () => {
  for (const name of ['build-macos.yml', 'desktop-app-build.yml', 'release.yml']) {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8');
    assert.match(workflow, /permissions:\n  contents: read/);
    assert.doesNotMatch(workflow, /run: npm install|\n\s+npm install/);
    for (const action of workflow.matchAll(/uses: (actions\/[\w-]+)@([^\s]+)/g)) {
      assert.match(action[2], /^[a-f0-9]{40}$/, action[1]);
    }
  }
  const release = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
  assert.doesNotMatch(release, /sergioarojasm98\/tap|sergioarojasm98\/homebrew-tap|HOMEBREW_TAP_TOKEN/);
  assert.match(release, /npm run test:security/);
  assert.match(release, /workflow_dispatch:/);
  assert.doesNotMatch(release, /tags:\s*\[/);
  assert.match(release, /DMG="dist\/Freeleapp-\$VERSION-arm64\.dmg"/);
  assert.match(release, /gh release create "\$RELEASE_TAG" "\$DMG"/);
  assert.doesNotMatch(release, /gh release create[^\n]*dist\/\*/);
});

test('the upgraded app retains zone-based rendering and NgModule declarations', () => {
  const app = fs.readFileSync(path.join(root, 'packages/desktop-app/src/app/app.module.ts'), 'utf8');
  assert.match(app, /providers: \[provideZoneChangeDetection\(\)/);
  assert.doesNotMatch(app, /entryComponents|ToastrModule/);
  const components = fs.readFileSync(path.join(root, 'packages/desktop-app/src/app/components/components.module.ts'), 'utf8');
  assert.doesNotMatch(components, /MatLegacy|legacy-menu|legacy-tabs|legacy-list|legacy-button|NgxJsonViewer/);
  const visit = directory => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) visit(file);
      else if (item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts')) {
        const source = fs.readFileSync(file, 'utf8');
        for (const declaration of source.matchAll(/@(Component|Pipe|Directive)\(\{([^]*?)\}\)/g)) {
          assert.match(declaration[2], /standalone:\s*false/, file);
          if (declaration[1] === 'Component') {
            assert.match(declaration[2], /changeDetection:\s*ChangeDetectionStrategy\.Eager/, file);
          }
        }
      }
    }
  };
  visit(path.join(root, 'packages/desktop-app/src/app'));
});

test('upgraded renderer notes use the trusted application path, not a bundler shim', () => {
  const source = fs.readFileSync(path.join(root, 'packages/desktop-app/src/app/services/updater.service.ts'), 'utf8');
  assert.match(source, /path\.join\(this\.electronService\.app\.getAppPath\(\), "dist", "leapp-client", "CHANGELOG.md"\)/);
  assert.doesNotMatch(source, /__dirname.*CHANGELOG/);
});
