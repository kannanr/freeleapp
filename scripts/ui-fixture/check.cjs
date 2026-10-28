const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const appRoot = path.join(root, 'packages/desktop-app');
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const coreRequire = createRequire(path.join(root, 'packages/core/package.json'));

async function run() {
  const puppeteer = require(process.env.FREELEAPP_PUPPETEER_PATH || '/Users/kannanramakrishnan/.claude/skills/browser-tools/node_modules/puppeteer-core');
  const base = process.env.FREELEAPP_UI_TMP || os.tmpdir();
  const home = fs.mkdtempSync(path.join(base, 'freeleapp-ui-fixture-'));
  fs.writeFileSync(path.join(home, '.ui-fixture-only'), 'synthetic-data-only');
  const { Workspace } = coreRequire('./dist/models/workspace');
  const { AwsIamUserSession } = coreRequire('./dist/models/aws/aws-iam-user-session');
  const { AwsSsoIntegration } = coreRequire('./dist/models/aws/aws-sso-integration');
  const { constants } = coreRequire('./dist/models/constants');
  const workspace = new Workspace();
  workspace.setNewWorkspaceVersion();
  const dark = process.env.FREELEAPP_UI_THEME !== 'light';
  workspace.colorTheme = dark ? constants.darkTheme : constants.lightTheme;
  workspace.touchIdEnabled = false;
  workspace.requirePassword = 0;
  workspace.autoDownloadUpdates = false;
  workspace.sessions = ['Pinned fixture', 'Unpinned fixture'].map((name, i) => {
    const session = new AwsIamUserSession(name, 'us-east-1', workspace.profiles[0].id);
    session.sessionId = `fixture-${i}`;
    return session;
  });
  workspace.pinned = ['fixture-0'];
  workspace.awsSsoIntegrations = [new AwsSsoIntegration('fixture-integration', 'Fixture Integration', 'https://example.invalid/start', 'us-east-1', constants.inBrowser)];
  const crypto = appRequire('crypto-js');
  const serialized = coreRequire('class-transformer').serialize(workspace);
  fs.mkdirSync(path.join(home, '.freeleapp'), { mode: 0o700 });
  fs.writeFileSync(path.join(home, constants.lockFileDestination), crypto.AES.encrypt(serialized, 'ui-fixture-machine-id').toString(), { mode: 0o600 });
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(AWS_|AZURE_|CSC_|APPLE_)/.test(key)));
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  Object.assign(env, { HOME: home, FREELEAPP_UI_FIXTURE_HOME: home, FREELEAPP_UI_PORT: String(port) });
  const electron = path.join(appRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  const child = spawn(electron, [path.join(__dirname, 'main.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  child.stdout.on('data', value => output.push(value.toString()));
  child.stderr.on('data', value => output.push(value.toString()));
  let browser;
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (!browser) throw new Error('Isolated Electron did not start');
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('leapp-client')) || pages[0];
    await page.setViewport({ width: 1280, height: 800 });
    page.on('pageerror', error => output.push(`PAGEERROR: ${error.message}`));
    await page.waitForFunction(() => document.querySelectorAll('app-session-card, tr[app-session-card]').length === 2, { timeout: 30000 });
    const state = async () => page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[app-session-card]')).map(row => row.textContent.trim());
      const items = Array.from(document.querySelectorAll('app-side-bar > .sidebar-flex > mat-list > mat-list-item'));
      const details = items.map(item => {
        const span = item.querySelector('.sidebar-row-label');
        const icon = item.querySelector('i');
        const rowRect = item.getBoundingClientRect();
        const labelRect = span?.getBoundingClientRect();
        return { label: span?.textContent, x: labelRect?.left, verticalOffset: labelRect && (labelRect.top + labelRect.bottom - rowRect.top - rowRect.bottom) / 2, color: span && getComputedStyle(span).color, iconColor: icon && getComputedStyle(icon).color };
      });
      return { rows, details, dark: document.body.classList.contains('dark-theme') };
    });
    const click = async text => {
      const handle = await page.evaluateHandle(label => Array.from(document.querySelectorAll('app-side-bar mat-list-item')).find(item => item.textContent.trim() === label), text);
      await handle.asElement().click();
      await new Promise(resolve => setTimeout(resolve, 250));
      return state();
    };
    const before = await state();
    const pinned = await click('Pinned Sessions');
    const all = await click('Sessions');
    for (let cycle = 0; cycle < 2; cycle++) {
      assert.equal((await click('Pinned Sessions')).rows.length, 1, 'Pinned view must remain responsive on repeated clicks');
      assert.equal((await click('Sessions')).rows.length, 2, 'Sessions view must remain responsive on repeated clicks');
    }
    await click('Tunnels');
    assert.ok(await page.$('app-ssm-tunnels'), 'Tunnels must display its own view');
    assert.equal((await click('Pinned Sessions')).rows.length, 1, 'Returning from Tunnels must show the pinned subset');
    assert.equal((await click('Sessions')).rows.length, 2, 'Returning to Sessions must restore the whole list');
    await page.waitForSelector('app-integration-bar .integration-provider-icon .red-dot, app-integration-bar .integration-provider-icon .green-dot');
    const badge = await page.evaluate(() => {
      const box = document.querySelector('app-integration-bar .integration-provider-icon');
      const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      return { logo: rect(box.querySelector('img')), dot: rect(box.querySelector('.red-dot, .green-dot')), row: rect(box.closest('mat-list-item')) };
    });
    const dotMiddle = (badge.dot.top + badge.dot.bottom) / 2;
    assert.ok(dotMiddle >= badge.logo.top && dotMiddle <= badge.logo.bottom + 2, `Integration status dot must sit on the logo: ${JSON.stringify(badge)}`);
    assert.ok(Math.abs(badge.dot.right - badge.logo.right) <= 6, `Integration status dot must sit on the logo's right corner: ${JSON.stringify(badge)}`);
    assert.ok(badge.dot.bottom <= badge.row.bottom, 'Integration status dot must stay inside its row');
    // Only the free Font Awesome package is bundled: every icon in the templates must have a glyph
    const iconClasses = new Set();
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.html')) {
        for (const [, value] of fs.readFileSync(file, 'utf8').matchAll(/class="([^"]*)"/g)) {
          const tokens = value.replace(/\{\{[^}]*\}\}/g, ' ').split(/\s+/);
          if (tokens.some(token => /^fa-(?!spin$|fw$)[a-z0-9-]+$/.test(token))) iconClasses.add(tokens.filter(token => /^fa/.test(token)).join(' '));
        }
      }
    });
    walk(path.join(appRoot, 'src/app'));
    const missingIcons = await page.evaluate(classes => classes.filter(className => {
      const icon = document.createElement('i');
      icon.className = className;
      document.body.appendChild(icon);
      const content = getComputedStyle(icon, '::before').content;
      icon.remove();
      return !content || content === 'none' || content === 'normal';
    }), [...iconClasses]);
    assert.deepEqual(missingIcons, [], 'Every Font Awesome icon used by the templates must exist in the bundled free set');
    const screenshot = path.join(home, `${dark ? 'dark' : 'light'}-sidebar.png`);
    await page.screenshot({ path: screenshot });
    console.log(JSON.stringify({ home, before, pinned, all, screenshot, errors: output.filter(x => x.startsWith('PAGEERROR:')).slice(0, 8) }, null, 2));
    assert.equal(pinned.rows.length, 1, 'Pinned Sessions must render immediately, without visiting Tunnels');
    assert.equal(all.rows.length, 2, 'Sessions must restore every row immediately');
    const brightness = color => color.match(/\d+/g).slice(0, 3).map(Number).reduce((sum, n) => sum + n, 0) / 3;
    for (const item of all.details) {
      assert.ok(dark ? brightness(item.color) > 160 : brightness(item.color) < 120, `Sidebar text is unreadable: ${item.label}`);
      assert.ok(dark ? brightness(item.iconColor) > 160 : brightness(item.iconColor) < 120, `Sidebar icon is unreadable: ${item.label}`);
      assert.ok(Math.abs(item.verticalOffset) <= 2, `Sidebar label must be vertically centred: ${item.label}`);
    }
    assert.ok(Math.abs(all.details[0].x - all.details[1].x) <= 2, 'Sidebar label alignment must not jump with selection');
  } finally {
    if (browser) browser.disconnect();
    child.kill('SIGTERM');
    console.error(output.filter(line => /PAGEERROR|Error:/.test(line)).slice(-6).join('\n'));
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
