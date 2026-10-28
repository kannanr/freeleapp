import { constants } from "../models/constants";
import { Repository } from "./repository";
import {
  GenerateSSOTokenResponse,
  RegisterClientResponse,
  StartDeviceAuthorizationResponse,
  VerificationResponse,
} from "./session/aws/aws-sso-role-service";
import { IAwsSsoOidcVerificationWindowService, OidcClient, OidcTokens } from "../interfaces/i-aws-sso-oidc-verification-window-service";
import { IKeychainService } from "../interfaces/i-keychain-service";
import { BrowserWindowClosing } from "../interfaces/i-browser-window-closing";
import { LoggedEntry, LoggedException, LogLevel, LogService } from "./log-service";
import { CreateTokenRequest, RegisterClientRequest, SSOOIDC, StartDeviceAuthorizationRequest } from "@aws-sdk/client-sso-oidc";

/** Scope that makes IAM Identity Center issue a refresh token (the same one the AWS CLI asks for). */
export const ssoOidcScopes = ["sso:account:access"];
/** Registered clients are reused until a day before their secret expires (AWS issues them for ~90 days). */
const clientRenewMarginMs = 24 * 60 * 60 * 1000;
/** createToken errors that mean the stored refresh token can never work again. */
const deadRefreshTokenErrors = ["InvalidGrantException", "ExpiredTokenException", "InvalidClientException", "UnauthorizedClientException"];
/** Waits before retrying a refresh that failed for another reason (network, throttling, 5xx). */
const refreshRetryDelaysMs = [2000, 5000];

interface StoredRefreshToken {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

/** Error name, HTTP status and OAuth error code of a failed SSO OIDC call; never includes tokens. */
const describeOidcError = (err: any): string =>
  [err?.name ?? "Error", err?.$metadata?.httpStatusCode, err?.error, err?.error_description ?? err?.message].filter((part) => part).join(" ");

export class AwsSsoOidcService {
  public readonly listeners: BrowserWindowClosing[];
  private ssoOidc: SSOOIDC;
  private generateSSOTokenResponse: GenerateSSOTokenResponse;
  private setIntervalQueue: Array<any>;
  private mainIntervalId: any;
  private loginMutex: boolean;
  private loginError: any;
  private loginFailed: boolean;
  private timeoutOccurred: boolean;
  private interruptOccurred: boolean;
  private refreshRetryDelaysMs = refreshRetryDelaysMs;

  constructor(
    private verificationWindowService: IAwsSsoOidcVerificationWindowService,
    private repository: Repository,
    private disableInAppBrowser: boolean = false,
    private keychainService: IKeychainService = null,
    private logService: LogService = null
  ) {
    this.listeners = [];
    this.ssoOidc = null;
    this.generateSSOTokenResponse = null;
    this.setIntervalQueue = [];
    this.loginMutex = false;
    this.loginError = null;
    this.loginFailed = false;
    this.timeoutOccurred = false;
    this.interruptOccurred = false;
  }

  getListeners(): BrowserWindowClosing[] {
    return this.listeners;
  }

  appendListener(listener: BrowserWindowClosing): void {
    this.listeners.push(listener);
  }

  async login(configurationId: string | number, region: string, portalUrl: string): Promise<GenerateSSOTokenResponse> {
    if (!this.loginMutex && this.setIntervalQueue.length === 0) {
      this.loginMutex = true;

      this.ssoOidc = new SSOOIDC({ region });
      this.generateSSOTokenResponse = null;
      this.setIntervalQueue = [];
      this.loginError = null;
      this.loginFailed = false;
      this.timeoutOccurred = false;
      this.interruptOccurred = false;

      try {
        this.generateSSOTokenResponse = await this.interactiveLogin(configurationId, region, portalUrl);
      } catch (err) {
        this.loginError = err;
        this.loginFailed = true;
        this.loginMutex = false;
        throw err;
      }

      this.loginMutex = false;
      return this.generateSSOTokenResponse;
    } else if (!this.loginMutex && this.setIntervalQueue.length > 0) {
      if (this.generateSSOTokenResponse) {
        return this.generateSSOTokenResponse;
      }
      if (this.interruptOccurred) {
        throw new LoggedException("AWS SSO Interrupted.", this, LogLevel.info);
      }
      if (this.timeoutOccurred) {
        throw new LoggedException("AWS SSO Timeout occurred. Please redo login procedure.", this, LogLevel.error);
      }
      if (this.loginFailed) {
        throw this.loginError;
      }
      throw new LoggedException("AWS SSO login did not complete.", this, LogLevel.error);
    } else {
      return new Promise((resolve, reject) => {
        const repeatEvery = 500; // 0.5 second, we can make these more speedy as they just check a variable, no external calls here

        const resolved = setInterval(async () => {
          if (this.interruptOccurred) {
            clearInterval(resolved);

            const resolvedIndex = this.setIntervalQueue.indexOf(resolved);
            this.setIntervalQueue.splice(resolvedIndex, 1);
            reject(new LoggedException("AWS SSO Interrupted.", this, LogLevel.info));
          } else if (this.generateSSOTokenResponse) {
            clearInterval(resolved);

            const resolvedIndex = this.setIntervalQueue.indexOf(resolved);
            this.setIntervalQueue.splice(resolvedIndex, 1);

            resolve(this.generateSSOTokenResponse);
          } else if (this.timeoutOccurred) {
            clearInterval(resolved);

            const resolvedIndex = this.setIntervalQueue.indexOf(resolved);
            this.setIntervalQueue.splice(resolvedIndex, 1);
            reject(new LoggedException("AWS SSO Timeout occurred. Please redo login procedure.", this, LogLevel.error));
          } else if (this.loginFailed) {
            clearInterval(resolved);

            const resolvedIndex = this.setIntervalQueue.indexOf(resolved);
            this.setIntervalQueue.splice(resolvedIndex, 1);
            reject(this.loginError);
          }
        }, repeatEvery);

        this.setIntervalQueue.push(resolved);
      });
    }
  }

  /**
   * Gets a new access token with the stored refresh token, without any browser. Returns null when there is no usable
   * refresh token (never signed in with this version, signed out, or the IAM Identity Center session has ended).
   */
  async refreshAccessToken(configurationId: string | number, region: string): Promise<GenerateSSOTokenResponse> {
    const stored = await this.readJsonSecret<StoredRefreshToken>(this.refreshTokenKey(configurationId));
    if (!stored?.refreshToken) {
      this.log(`AWS SSO integration ${configurationId}: no stored refresh token, signing in with the browser`, LogLevel.info);
      return null;
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await new SSOOIDC({ region }).createToken({
          clientId: stored.clientId,
          clientSecret: stored.clientSecret,
          grantType: "refresh_token",
          refreshToken: stored.refreshToken,
        });
        await this.saveRefreshToken(configurationId, response.refreshToken ?? stored.refreshToken, stored.clientId, stored.clientSecret);
        const expirationTime = new Date(Date.now() + response.expiresIn * 1000);
        const rotated = response.refreshToken && response.refreshToken !== stored.refreshToken ? ", refresh token rotated" : "";
        this.log(
          `AWS SSO integration ${configurationId}: token refreshed silently, expires ${expirationTime.toISOString()}${rotated}`,
          LogLevel.info
        );
        return { accessToken: response.accessToken, expirationTime };
      } catch (err) {
        if (deadRefreshTokenErrors.includes(err?.name)) {
          await this.forgetRefreshToken(configurationId);
          this.log(
            `AWS SSO integration ${configurationId}: refresh token rejected (${describeOidcError(err)}), signing in with the browser`,
            LogLevel.warn
          );
          return null;
        }
        if (attempt >= this.refreshRetryDelaysMs.length) {
          this.log(
            `AWS SSO integration ${configurationId}: refresh failed ${attempt + 1} times (${describeOidcError(err)}), signing in with the browser`,
            LogLevel.warn
          );
          return null;
        }
        this.log(
          `AWS SSO integration ${configurationId}: refresh attempt ${attempt + 1} failed (${describeOidcError(err)}), retrying`,
          LogLevel.warn
        );
        await new Promise((resolve) => setTimeout(resolve, this.refreshRetryDelaysMs[attempt]));
      }
    }
  }

  async forgetRefreshToken(configurationId: string | number): Promise<void> {
    if (this.keychainService) {
      await this.keychainService.deleteSecret(constants.appName, this.refreshTokenKey(configurationId));
    }
  }

  closeVerificationWindow(): void {
    this.loginMutex = false;

    this.getListeners().forEach((listener) => {
      listener.catchClosingBrowserWindow();
    });
  }

  interrupt(): void {
    clearInterval(this.mainIntervalId);
    this.interruptOccurred = true;
    this.loginMutex = false;
  }

  private getAwsSsoOidcClient(): SSOOIDC {
    return this.ssoOidc;
  }

  /**
   * Browser opening "external": authorization code + PKCE (the user only clicks "Allow"). In-app windows, or any
   * failure before the browser opens (e.g. a proxy the direct OIDC calls can't use), use the device code flow.
   * Both flows keep a refresh token, so later renewals skip the browser.
   */
  private async interactiveLogin(configurationId: string | number, region: string, portalUrl: string): Promise<GenerateSSOTokenResponse> {
    const windowModality = this.repository.getAwsSsoIntegration(configurationId).browserOpening;
    const external = this.disableInAppBrowser || windowModality !== constants.inApp;
    const windowService = this.verificationWindowService;
    if (external && this.keychainService && windowService.registerAuthorizationCodeClient && windowService.signInWithAuthorizationCode) {
      let client: OidcClient;
      try {
        client = await this.getClient("pkce", region, portalUrl, () =>
          windowService.registerAuthorizationCodeClient(region, portalUrl, ssoOidcScopes)
        );
      } catch (err) {
        client = null;
      }
      if (client) {
        const tokens: OidcTokens = await windowService.signInWithAuthorizationCode(region, client, ssoOidcScopes);
        await this.saveRefreshToken(configurationId, tokens.refreshToken, client.clientId, client.clientSecret);
        return { accessToken: tokens.accessToken, expirationTime: new Date(Date.now() + tokens.expiresIn * 1000) };
      }
    }

    const registerClientResponse = await this.registerSsoOidcClient(region, portalUrl);
    const startDeviceAuthorizationResponse = await this.startDeviceAuthorization(registerClientResponse, portalUrl);
    const verificationResponse = await this.verificationWindowService.openVerificationWindow(
      registerClientResponse,
      startDeviceAuthorizationResponse,
      windowModality,
      () => this.closeVerificationWindow()
    );
    return await this.createToken(configurationId, verificationResponse);
  }

  private async registerSsoOidcClient(region: string, portalUrl: string): Promise<RegisterClientResponse> {
    const registerClientRequest: RegisterClientRequest = { clientName: "freeleapp", clientType: "public", scopes: ssoOidcScopes };
    return (await this.getClient("device", region, portalUrl, async () => {
      const response = await this.getAwsSsoOidcClient().registerClient(registerClientRequest);
      return { clientId: response.clientId, clientSecret: response.clientSecret, clientSecretExpiresAt: response.clientSecretExpiresAt };
    })) as RegisterClientResponse;
  }

  /** Reuses a registered client from the keychain until it is about to expire; registers a new one otherwise. */
  private async getClient(kind: "device" | "pkce", region: string, portalUrl: string, register: () => Promise<OidcClient>): Promise<OidcClient> {
    const key = `aws-sso-oidc-client-${kind}-${region}-${portalUrl}`;
    const stored = await this.readJsonSecret<OidcClient>(key);
    if (stored?.clientId && stored.clientSecretExpiresAt * 1000 - Date.now() > clientRenewMarginMs) {
      return stored;
    }
    const client = await register();
    if (this.keychainService) {
      await this.keychainService.saveSecret(constants.appName, key, JSON.stringify(client));
    }
    return client;
  }

  private log(message: string, level: LogLevel): void {
    this.logService?.log(new LoggedEntry(message, this, level));
  }

  private refreshTokenKey(configurationId: string | number): string {
    return `aws-sso-integration-refresh-token-${configurationId}`;
  }

  private async saveRefreshToken(configurationId: string | number, refreshToken: string, clientId: string, clientSecret: string): Promise<void> {
    if (!this.keychainService || !refreshToken) {
      return;
    }
    const value: StoredRefreshToken = { refreshToken, clientId, clientSecret };
    await this.keychainService.saveSecret(constants.appName, this.refreshTokenKey(configurationId), JSON.stringify(value));
  }

  private async readJsonSecret<T>(key: string): Promise<T> {
    if (!this.keychainService) {
      return null;
    }
    try {
      const raw = await this.keychainService.getSecret(constants.appName, key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      return null;
    }
  }

  private async startDeviceAuthorization(
    registerClientResponse: RegisterClientResponse,
    portalUrl: string
  ): Promise<StartDeviceAuthorizationResponse> {
    const startDeviceAuthorizationRequest: StartDeviceAuthorizationRequest = {
      clientId: registerClientResponse.clientId,
      clientSecret: registerClientResponse.clientSecret,
      startUrl: portalUrl,
    };

    return await this.getAwsSsoOidcClient().startDeviceAuthorization(startDeviceAuthorizationRequest);
  }

  private async createToken(configurationId: string | number, verificationResponse: VerificationResponse): Promise<GenerateSSOTokenResponse> {
    const createTokenRequest: CreateTokenRequest = {
      clientId: verificationResponse.clientId,
      clientSecret: verificationResponse.clientSecret,
      grantType: "urn:ietf:params:oauth:grant-type:device_code",
      deviceCode: verificationResponse.deviceCode,
    };

    let createTokenResponse;
    // disableInAppBrowser is a client-specific parameter. If disableInAppBrowser is true, the client will open aws sso
    // login page using the Browser instead of the Electron BrowserWindow, regardless the value specified in Leapp
    // configuration's browserOpening parameter.
    if (!this.disableInAppBrowser && this.repository.getAwsSsoIntegration(configurationId).browserOpening === constants.inApp) {
      createTokenResponse = await this.getAwsSsoOidcClient().createToken(createTokenRequest);
    } else {
      createTokenResponse = await this.waitForToken(createTokenRequest);
    }

    await this.saveRefreshToken(configurationId, createTokenResponse.refreshToken, verificationResponse.clientId, verificationResponse.clientSecret);
    const expirationTime: Date = new Date(Date.now() + createTokenResponse.expiresIn * 1000);
    return { accessToken: createTokenResponse.accessToken, expirationTime };
  }

  private async waitForToken(createTokenRequest: CreateTokenRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const intervalInMilliseconds = 5000;

      this.mainIntervalId = setInterval(() => {
        this.getAwsSsoOidcClient()
          .createToken(createTokenRequest)
          .then((createTokenResponse) => {
            clearInterval(this.mainIntervalId);
            resolve(createTokenResponse);
          })
          .catch((err) => {
            if (err.toString().indexOf("AuthorizationPendingException") === -1) {
              // AWS SSO Timeout occurred
              clearInterval(this.mainIntervalId);
              this.timeoutOccurred = true;
              reject(new LoggedException("AWS SSO Timeout occurred. Please redo login procedure.", this, LogLevel.error));
            }
          });
      }, intervalInMilliseconds);
    });
  }
}
