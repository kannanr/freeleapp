// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.
const environment = {
  appName: "Freeleapp",
  samlRoleSessionDuration: 3600, // 1h
  sessionDuration: 1200,
  sessionTokenDuration: 36000, // 10h
  timeout: 10000,
  lockFileDestination: "",
  production: true,
  credentialsDestination: ".aws/credentials",
  azureMsalCacheFile: ".azure/msal_token_cache.json",
  defaultRegion: "us-east-1",
  defaultLocation: "eastus",
  defaultAwsProfileName: "default",
  defaultAzureProfileName: "default-azure",
  latestUrl: "https://github.com/kannanr/freeleapp/releases/latest",
  // TODO: add actual endpoint
  apiEndpoint: "http://localhost:3000",
};

environment.lockFileDestination = `.freeleapp/freeleapp-lock.json`;
export { environment };
