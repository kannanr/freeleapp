const path = require('node:path');
const Module = require('node:module');
const { createRequire } = Module;
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '../..');
const home = process.env.FREELEAPP_UI_FIXTURE_HOME;
if (!home || process.env.HOME !== home) throw new Error('Refusing non-isolated UI fixture');
const appRoot = process.env.FREELEAPP_UI_ASAR || path.join(root, 'packages/desktop-app');
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const secretStore = new Map();
const keytar = {
  async getPassword(service, account) { return secretStore.get(`${service}:${account}`) ?? null; },
  async setPassword(service, account, value) { secretStore.set(`${service}:${account}`, value); },
  async deletePassword(service, account) { return secretStore.delete(`${service}:${account}`); },
  async findCredentials() { return []; },
};
const childProcess = {
  exec(command, options, callback) {
    if (typeof options === 'function') callback = options;
    const output = command.includes('aws --version') ? 'aws-cli/2.31.0' : command.includes('session-manager-plugin --version') ? '1.2.0' : '';
    queueMicrotask(() => callback?.(null, output, ''));
    return Object.assign(new EventEmitter(), { kill() {}, stdout: new EventEmitter(), stderr: new EventEmitter() });
  },
  spawn() { throw new Error('UI fixture blocks process creation'); },
  execFile() { throw new Error('UI fixture blocks process creation'); },
  fork() { throw new Error('UI fixture blocks process creation'); },
  spawnSync() { throw new Error('UI fixture blocks process creation'); },
  execFileSync() { throw new Error('UI fixture blocks process creation'); },
  execSync() { throw new Error('UI fixture blocks process creation'); },
};

const originalLoad = Module._load;
const networkMethods = new Map([
  ['http', ['request', 'get', 'createServer', 'createConnection', 'connect']],
  ['https', ['request', 'get', 'createServer', 'createConnection', 'connect']],
  ['http2', ['connect', 'createServer', 'createSecureServer']],
  ['net', ['connect', 'createConnection', 'createServer']],
  ['tls', ['connect', 'createServer']],
  ['dgram', ['createSocket']],
  ['dns', ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse']],
  ['dns/promises', ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse']],
]);
const networkConstructors = new Map([
  ['http', ['Agent']], ['https', ['Agent']],
  ['net', ['Socket', 'Server']], ['tls', ['TLSSocket', 'Server']],
  ['dgram', ['Socket']],
  ['http2', ['Http2Session', 'ClientHttp2Session', 'ServerHttp2Session', 'Http2Stream', 'Http2ServerRequest', 'Http2ServerResponse']],
]);
const blockedModules = new Set(['cluster', 'worker_threads', 'inspector']);
const blockedNetwork = name => { throw new Error(`UI fixture blocks ${name}`); };
const canonicalModuleName = name => name.startsWith('node:') ? name.slice(5) : name;

// Guard all renderer-side CommonJS loads, including loads made by dependencies.
// The Electron main process (and its loopback-only CDP listener) is a separate process.
Module._load = function(request, parent, isMain) {
  const name = canonicalModuleName(request);
  if (name === 'child_process') return childProcess;
  if (name === 'keytar') return keytar;
  if (name === 'node-machine-id') return { machineIdSync: () => 'ui-fixture-machine-id' };
  if (name === 'sudo-prompt') return { exec: () => blockedNetwork('privileged processes') };
  if (name === 'follow-redirects') {
    return { http: { request: () => blockedNetwork('network requests') }, https: { request: () => blockedNetwork('network requests') } };
  }
  if ([...blockedModules, 'undici'].some(blocked => name === blocked || name.startsWith(`${blocked}/`))) {
    return blockedNetwork(`module ${request}`);
  }

  const loaded = originalLoad.call(this, request, parent, isMain);
  const methods = networkMethods.get(name);
  const constructors = networkConstructors.get(name) || [];
  if (!methods && constructors.length === 0) return loaded;
  return new Proxy(loaded, {
    get(target, property, receiver) {
      if (methods?.includes(property) || constructors.includes(property)) {
        return blockBrowserNetwork(`network access via ${request}.${String(property)}`);
      }
      if ((name === 'http' || name === 'https') && property === 'globalAgent') {
        return new Proxy(Reflect.get(target, property, target), {
          get(agent, agentProperty, agentReceiver) {
            if (['addRequest', 'createConnection', 'keepSocketAlive', 'reuseSocket'].includes(agentProperty)) {
              return blockBrowserNetwork(`network access via ${request}.globalAgent.${String(agentProperty)}`);
            }
            return Reflect.get(agent, agentProperty, agentReceiver);
          },
        });
      }
      return Reflect.get(target, property, receiver);
    },
  });
};

const blockBrowserNetwork = name => function() { throw new Error(`UI fixture blocks ${name}`); };
globalThis.fetch = blockBrowserNetwork('fetch');
if (typeof window !== 'undefined') {
  window.fetch = globalThis.fetch;
  window.WebSocket = blockBrowserNetwork('WebSocket');
  window.EventSource = blockBrowserNetwork('EventSource');
  if (window.navigator?.sendBeacon) window.navigator.sendBeacon = blockBrowserNetwork('sendBeacon');
}

window.require = name => {
  if (name === 'keytar') return keytar;
  if (name === 'node-machine-id') return { machineIdSync: () => 'ui-fixture-machine-id' };
  if (name === 'child_process') return childProcess;
  if (name === 'sudo-prompt') return { exec: () => { throw new Error('UI fixture blocks privileged processes'); } };
  return appRequire(name);
};
