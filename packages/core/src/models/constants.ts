export const constants = {
  //General
  // Keychain service name and data folder. Leapp's ".Leapp" folder and "Leapp" keychain items are migrated on first run.
  appName: "Freeleapp",
  appDataDir: ".freeleapp",
  legacyAppName: "Leapp",
  legacyAppDataDir: ".Leapp",
  rsaBinFileDestination: ".freeleapp/rsa.bin",
  lockFileDestination: ".freeleapp/freeleapp-lock.json",
  lockFileBackupPath: ".freeleapp/freeleapp-lock.backup.bin",
  latestUrl: "https://github.com/kannanr/freeleapp/releases/latest",
  docsUrl: "https://freeleapp.com",
  workspaceLastVersion: 12,
  localWorkspaceName: "Local workspace",
  localWorkspaceDescription: "Community Edition",
  localWorkspaceKeychainValue: "local",

  //Aws
  samlRoleSessionDuration: 3600, // 1h
  sessionDuration: 1200, // 20 min
  sessionTokenDuration: 36000, // 10h
  timeout: 10000,
  credentialsDestination: ".aws/credentials",
  defaultRegion: "us-east-1",
  maxSsoTps: 5, // Transaction per second for AWS SSO endpoint

  //Azure
  azureMsalCacheFile: ".azure/msal_token_cache.json",
  defaultLocation: "eastus",
  defaultAwsProfileName: "default",
  defaultAzureProfileName: "default-azure",

  inApp: "In-app",
  inBrowser: "In-browser",
  forcedCloseBrowserWindow: "ForceCloseBrowserWindow",

  confirmed: "**CONFIRMED**",
  confirmClosed: "**MODAL_CLOSED**",
  confirmClosedAndIgnoreUpdate: "**IGNORE_UPDATE_AND_MODAL_CLOSED**",
  confirmCloseAndDownloadUpdate: "**GO_TO_DOWNLOAD_PAGE_AND_MODAL_CLOSED**",

  macOsTerminal: "Terminal",
  macOsIterm2: "iTerm2",
  macOsWarp: "Warp",
  systemDefaultTheme: "System Default",

  lightTheme: "Light Theme",
  darkTheme: "Dark Theme",
  colorTheme: "System Default",

  cliStartAwsFederatedSessionChannel: "aws-federated-session-start-channel",
  cliLogoutAwsFederatedSessionChannel: "aws-federated-session-logout-channel",
  cliRefreshSessionsChannel: "refresh-sessions-channel",
  ipcServerId: "leapp_da",

  roleSessionName: "assumed-from-leapp",
  // Credential method: Freeleapp always writes ~/.aws/credentials. The credential-process method needed the Leapp CLI,
  // which Freeleapp does not ship; workspace migration 8 moves Leapp setups that used it back to the file.
  credentialFile: "credential-file-method",
  legacyCredentialProcess: "credential-process-method",

  // SSM region behavior. Unused since Freeleapp 1.1: View SSM Sessions preselects the region used last for the session,
  // else the session's own region. Kept because Leapp workspaces store it.
  ssmRegionNo: "No",
  ssmRegionDefault: "Use default region",

  // The local port of a tunnel whose Local Port field is left empty
  ssmLocalPortSameAsRemote: "same-as-remote",
  ssmLocalPortFree: "free",

  // Contains Env for SSM on macOS
  ssmSourceFileDestination: ".freeleapp/ssm-env",

  touchIdEnabled: true,
  requirePasswordEveryTwoWeeks: { key: "Every 2 weeks", value: 14 },
};
