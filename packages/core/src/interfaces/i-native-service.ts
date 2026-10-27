import { IMsalEncryptionService } from "./i-msal-encryption-service";

export interface INativeService {
  url: any;
  fs: any;
  rimraf: any;
  os: any;
  ini: any;
  exec: any;
  spawn: any;
  net: any;
  copydir: any;
  sudo: any;
  path: any;
  semver: any;
  machineId: any;
  keytar: any;
  followRedirects: any;
  httpProxyAgent: any;
  httpsProxyAgent: any;
  process: any;
  msalEncryptionService: IMsalEncryptionService;
  fetch: any;
}
