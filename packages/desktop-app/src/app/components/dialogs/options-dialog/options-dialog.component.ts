import {
  ChangeDetectionStrategy,
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
} from "@angular/core";
import { FormControl, FormGroup } from "@angular/forms";
import { AppService } from "../../../services/app.service";
import { Router } from "@angular/router";
import { MatTabGroup } from "@angular/material/tabs";
import { constants } from "@noovolari/leapp-core/models/constants";
import { LoggedEntry, LogLevel } from "@noovolari/leapp-core/services/log-service";
import { MessageToasterService, ToastLevel } from "../../../services/message-toaster.service";
import { WindowService } from "../../../services/window.service";
import { AppProviderService } from "../../../services/app-provider.service";
import { BsModalRef, BsModalService } from "ngx-bootstrap/modal";
import { ConfirmationDialogComponent } from "../confirmation-dialog/confirmation-dialog.component";
import { OptionsService } from "../../../services/options.service";
import { AwsIamRoleFederatedSession } from "@noovolari/leapp-core/models/aws/aws-iam-role-federated-session";
import { SessionService } from "@noovolari/leapp-core/services/session/session-service";
import { SessionStatus } from "@noovolari/leapp-core/models/session-status";
import { OperatingSystem } from "@noovolari/leapp-core/models/operating-system";
import { AppNativeService } from "../../../services/app-native.service";
import { colorThemeSubject } from "../../check-icon-svg/check-icon-svg.component";
import { withRecentRegions } from "../../../services/region-options";
import { UpdaterService } from "../../../services/updater.service";

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: "app-options-dialog",
  templateUrl: "./options-dialog.component.html",
  styleUrls: ["./options-dialog.component.scss"],
  encapsulation: ViewEncapsulation.None,
})
export class OptionsDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input()
  selectedIndex;

  @ViewChild("tabs", { static: false })
  tabGroup: MatTabGroup;

  eConstants = constants;
  eOperatingSystem = OperatingSystem;

  awsProfileValue: { id: string; name: string };
  idpUrlValue;
  editingIdpUrl: boolean;
  editingAwsProfile: boolean;

  showProxyAuthentication = false;
  proxyProtocol = "https"; // Default
  proxyUrl;
  proxyPort = "8080"; // Default
  proxyUsername;
  proxyPassword;

  locations: { location: string }[];
  regions: { region: string }[];
  selectedLocation: string;
  selectedRegion: string;
  selectedBrowserOpening = constants.inApp.toString();
  selectedTerminal;

  colorTheme: string;
  selectedColorTheme: string;

  selectedSsmLocalPort: string;
  autoDownloadUpdates: boolean;
  readonly ssmLocalPortOptions = [
    { value: constants.ssmLocalPortSameAsRemote, label: "Same as the remote port" },
    { value: constants.ssmLocalPortFree, label: "The remote port, or a free one if it is taken" },
  ];

  form = new FormGroup({
    idpUrl: new FormControl(""),
    awsProfile: new FormControl(""),
    proxyUrl: new FormControl(""),
    proxyProtocol: new FormControl(""),
    proxyPort: new FormControl(""),
    proxyUsername: new FormControl(""),
    proxyPassword: new FormControl(""),
    showAuthCheckbox: new FormControl(""),
    regionsSelect: new FormControl(""),
    locationsSelect: new FormControl(""),
    defaultBrowserOpening: new FormControl(""),
    terminalSelect: new FormControl(""),
    colorThemeSelect: new FormControl(""),
    sessionDuration: new FormControl(""),
    ssmLocalPortSelect: new FormControl(""),
    autoDownloadUpdates: new FormControl(""),
  });

  webConsoleSessionDuration: number;

  /* Simple profile page: shows the Idp Url and the workspace json */
  private sessionService: SessionService;

  // The theme is previewed as soon as it is picked, so closing without Done has to put the original one back
  private initialColorTheme: string;
  private saved = false;
  // What Done would save, as opened; Cancel asks before dropping anything different
  private initialSettings: string;
  private discardConfirmation: BsModalRef;
  private mouseDownTarget: EventTarget;

  constructor(
    public appProviderService: AppProviderService,
    public appService: AppService,
    private optionsService: OptionsService,
    private appNativeService: AppNativeService,
    private windowService: WindowService,
    private toasterService: MessageToasterService,
    private modalService: BsModalService,
    private router: Router,
    private elementRef: ElementRef,
    private updaterService: UpdaterService
  ) {
    this.selectedTerminal = this.optionsService.macOsTerminal || constants.macOsTerminal;

    this.colorTheme = this.optionsService.colorTheme || constants.colorTheme;
    this.selectedColorTheme = this.colorTheme;
    this.initialColorTheme = this.colorTheme;

    this.selectedSsmLocalPort = this.optionsService.ssmLocalPort || constants.ssmLocalPortSameAsRemote;
  }

  @HostListener("document:mousedown", ["$event"])
  onMouseDown(event: MouseEvent): void {
    this.mouseDownTarget = event.target;
  }

  @HostListener("document:click", ["$event"])
  onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    // A click on the dimmed area around the dialog, not a drag that started inside it
    const outside = target.classList?.contains("modal") && target.contains(this.elementRef.nativeElement);
    if (outside && this.mouseDownTarget === target && !this.discardConfirmation) {
      this.cancel();
    }
  }

  // Escape (app-dialog-escape) and a click around the dialog both go through cancel(). A discard confirmation on top
  // handles Escape itself.
  onEscape(): void {
    if (!this.discardConfirmation) {
      this.cancel();
    }
  }

  async ngOnInit(): Promise<void> {
    this.idpUrlValue = "";
    this.proxyProtocol = this.optionsService.proxyConfiguration.proxyProtocol;
    this.proxyUrl = this.optionsService.proxyConfiguration.proxyUrl;
    this.proxyPort = this.optionsService.proxyConfiguration.proxyPort;
    this.proxyUsername = this.optionsService.proxyConfiguration.username || "";
    this.proxyPassword = this.optionsService.proxyConfiguration.password || "";
    this.webConsoleSessionDuration = this.optionsService.samlRoleSessionDuration || constants.samlRoleSessionDuration;

    this.form.controls["idpUrl"].setValue(this.idpUrlValue);
    this.form.controls["proxyUrl"].setValue(this.proxyUrl);
    this.form.controls["proxyProtocol"].setValue(this.proxyProtocol);
    this.form.controls["proxyPort"].setValue(this.proxyPort);
    this.form.controls["proxyUsername"].setValue(this.proxyUsername);
    this.form.controls["proxyPassword"].setValue(this.proxyPassword);
    this.form.controls["sessionDuration"].setValue(`${this.webConsoleSessionDuration}`);

    const isProxyUrl = this.optionsService.proxyConfiguration.proxyUrl && this.optionsService.proxyConfiguration.proxyUrl !== "undefined";
    this.proxyUrl = isProxyUrl ? this.optionsService.proxyConfiguration.proxyUrl : "";

    if (this.proxyUsername || this.proxyPassword) {
      this.showProxyAuthentication = true;
    }

    this.regions = withRecentRegions(this.appProviderService.awsCoreService.getRegions(), this.appProviderService.repository.getSessions());
    this.locations = this.appProviderService.azureCoreService.getLocations();
    this.selectedRegion = this.optionsService.defaultRegion || constants.defaultRegion;
    this.selectedLocation = this.optionsService.defaultLocation || constants.defaultLocation;

    this.appService.validateAllFormFields(this.form);

    this.selectedSsmLocalPort = this.optionsService.ssmLocalPort || constants.ssmLocalPortSameAsRemote;
    this.autoDownloadUpdates = this.optionsService.autoDownloadUpdates;
    this.initialSettings = this.pendingSettings();
  }

  ngAfterViewInit(): void {
    if (this.selectedIndex) {
      this.tabGroup.selectedIndex = this.selectedIndex;
    }
  }

  /**
   * Cancel, Esc and a click outside all close the dialog without saving: the fields applied by Done are dropped and a
   * previewed color theme is reverted. List actions (IdP URLs, profiles) and the credential method keep
   * applying immediately, each with its own confirmation.
   */
  ngOnDestroy(): void {
    if (!this.saved && this.colorTheme !== this.initialColorTheme) {
      this.setColorTheme(this.initialColorTheme);
    }
  }

  cancel(): void {
    if (this.pendingSettings() === this.initialSettings) {
      this.appService.closeModal();
      return;
    }
    this.discardConfirmation = this.confirmOverSettings(
      "Discard the changes you made in Settings?",
      "Discard",
      () => this.appService.closeModal(),
      "Keep Editing"
    );
    this.discardConfirmation.onHidden.subscribe(() => (this.discardConfirmation = undefined));
  }

  setColorTheme(theme: string): void {
    this.optionsService.colorTheme = theme;
    this.colorTheme = this.optionsService.colorTheme;
    this.selectedColorTheme = this.colorTheme;
    if (this.colorTheme === constants.darkTheme) {
      colorThemeSubject.next(true);
      document.querySelector("body").classList.add("dark-theme");
    } else if (this.colorTheme === constants.lightTheme) {
      colorThemeSubject.next(false);
      document.querySelector("body").classList.remove("dark-theme");
    } else if (this.colorTheme === constants.systemDefaultTheme) {
      colorThemeSubject.next(true);
      document.querySelector("body").classList.toggle("dark-theme", this.appService.isDarkMode());
    }
  }

  /**
   * Save the idp-url again
   */
  async saveOptions(): Promise<void> {
    if (this.form.valid) {
      this.saved = true;
      this.optionsService.updateProxyConfiguration({
        proxyUrl: this.form.controls["proxyUrl"].value,
        proxyProtocol: this.form.controls["proxyProtocol"].value,
        proxyPort: this.form.controls["proxyPort"].value,
        username: this.form.controls["proxyUsername"].value,
        password: this.form.controls["proxyPassword"].value,
      });

      this.optionsService.defaultRegion = this.selectedRegion;
      this.optionsService.defaultLocation = this.selectedLocation;
      this.optionsService.macOsTerminal = this.selectedTerminal;
      this.optionsService.samlRoleSessionDuration = parseInt(this.form.controls["sessionDuration"].value, 10);

      this.optionsService.ssmLocalPort = this.selectedSsmLocalPort;

      if (this.autoDownloadUpdates !== this.optionsService.autoDownloadUpdates) {
        this.optionsService.autoDownloadUpdates = this.autoDownloadUpdates;
        this.updaterService.sendSettings(this.autoDownloadUpdates);
      }

      if (this.checkIfNeedDialogBox()) {
        // eslint-disable-next-line max-len
        this.windowService.confirmDialog(
          "You've set a proxy url: the app must be restarted to update the configuration.",
          (res) => {
            if (res !== constants.confirmClosed) {
              // eslint-disable-next-line max-len
              this.appProviderService.logService.log(
                new LoggedEntry("User have set a proxy url: the app must be restarted to update the configuration.", this, LogLevel.info)
              );
              this.appService.restart();
            }
          },
          "Restart",
          "Cancel"
        );
      } else {
        this.appService.closeModal();
        this.appProviderService.logService.log(
          new LoggedEntry("Option saved.", this, LogLevel.info, false, JSON.stringify(this.form.getRawValue(), null, 3))
        );
        this.toasterService.toast("Options Saved", ToastLevel.info, "Options");
      }
    }
  }

  /**
   * Check if we need a dialog box to request restarting the application
   */
  checkIfNeedDialogBox(): boolean {
    return (
      this.form.controls["proxyUrl"].value !== undefined &&
      this.form.controls["proxyUrl"].value !== null &&
      (this.form.controls["proxyUrl"].dirty ||
        this.form.controls["proxyProtocol"].dirty ||
        this.form.controls["proxyPort"].dirty ||
        this.form.controls["proxyUsername"].dirty ||
        this.form.controls["proxyPassword"].dirty)
    );
  }

  /**
   * Return to home screen
   */
  goBack(): void {
    this.router.navigate(["/dashboard"]).then(() => {});
  }

  manageIdpUrl(id: string): void {
    const idpUrl = this.appProviderService.idpUrlService.getIdpUrl(id);
    const validate = this.appProviderService.idpUrlService.validateIdpUrl(this.form.get("idpUrl").value);
    if (validate === true) {
      if (!idpUrl) {
        this.appProviderService.idpUrlService.createIdpUrl(this.form.get("idpUrl").value);
      } else {
        this.appProviderService.idpUrlService.editIdpUrl(id, this.form.get("idpUrl").value);
      }
    }
    this.editingIdpUrl = false;
    this.idpUrlValue = undefined;
    this.form.get("idpUrl").setValue("");
  }

  editIdpUrl(id: string): void {
    const idpUrl = this.appProviderService.idpUrlService.getIdpUrls().filter((u) => u.id === id)[0];
    this.idpUrlValue = idpUrl;
    this.form.get("idpUrl").setValue(idpUrl.url);
    this.editingIdpUrl = true;
  }

  deleteIdpUrl(id: string): void {
    const sessions = this.appProviderService.idpUrlService.getDependantSessions(id);

    // Get only names for display
    let sessionsNames = sessions.map(
      (s) =>
        `<li>
            <div class="removed-sessions">
            <b>${s.sessionName}</b> - <small>${(s as AwsIamRoleFederatedSession).roleArn.split("/")[1]}</small>
            </div>
      </li>`
    );

    if (sessionsNames.length === 0) {
      sessionsNames = ["<li><b>no sessions</b></li>"];
    }

    this.confirmOverSettings(
      `Deleting this IdP URL will also remove these sessions: <br><ul>${sessionsNames.join("")}</ul>Do you want to proceed?`,
      "Delete IdP URL",
      () => {
        this.appProviderService.logService.log(new LoggedEntry(`Removing idp url with id: ${id}`, this, LogLevel.info));

        sessions.forEach((session) => {
          this.appProviderService.sessionManagementService.deleteSession(session.sessionId);
          this.appProviderService.behaviouralSubjectService.setSessions(this.appProviderService.sessionManagementService.getSessions());
        });
        this.appProviderService.idpUrlService.deleteIdpUrl(id);
      }
    );
  }

  async manageAwsProfile(id: string | number): Promise<void> {
    const profileIndex = this.appProviderService.namedProfileService.getNamedProfiles().findIndex((p) => p.id === id.toString());

    const validate = this.appProviderService.namedProfileService.validateNewProfileName(this.form.get("awsProfile").value);
    if (validate === true) {
      if (profileIndex === -1) {
        this.appProviderService.namedProfileService.createNamedProfile(this.form.get("awsProfile").value);
      } else {
        this.appProviderService.namedProfileService.editNamedProfile(id.toString(), this.form.get("awsProfile").value);

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < this.appProviderService.behaviouralSubjectService.sessions.length; i++) {
          const sess = this.appProviderService.behaviouralSubjectService.sessions[i];
          this.sessionService = this.appProviderService.sessionFactory.getSessionService(sess.type);

          if ((sess as any).profileId === id.toString()) {
            if ((sess as any).status === SessionStatus.active) {
              await this.sessionService.stop(sess.sessionId);
              await this.sessionService.start(sess.sessionId);
            }
          }
        }
      }
    } else {
      this.toasterService.toast(validate.toString(), ToastLevel.warn);
    }

    this.editingAwsProfile = false;
    this.awsProfileValue = undefined;
    this.form.get("awsProfile").setValue("");
  }

  editAwsProfile(id: string): void {
    const profile = this.appProviderService.namedProfileService.getNamedProfiles(false).filter((u) => u.id === id)[0];
    this.awsProfileValue = profile;
    this.form.get("awsProfile").setValue(profile.name);
    this.editingAwsProfile = true;
  }

  deleteAwsProfile(id: string): void {
    const namedProfileService = this.appProviderService.namedProfileService;
    const profileName = namedProfileService.getProfileName(id);
    const sessions = namedProfileService.getSessionsWithNamedProfile(id);
    const sessionList = sessions.map((session) => `<li><b>${session.sessionName}</b></li>`).join("");
    this.confirmOverSettings(
      sessions.length === 0
        ? `Delete the "${profileName}" profile? No session uses it.`
        : `Delete the "${profileName}" profile? These sessions move to a profile of their own:<ul>${sessionList}</ul>`,
      "Delete Profile",
      async () => {
        this.appProviderService.logService.log(new LoggedEntry(`Deleting named profile ${profileName}`, this, LogLevel.info));
        await namedProfileService.deleteNamedProfile(id);
      }
    );
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  openBrowser(url: string) {
    this.windowService.openExternalUrl(url);
  }

  /**
   * Everything Done saves, including the previewed theme, in a comparable form
   */
  private pendingSettings(): string {
    const controls = this.form.controls;
    return JSON.stringify([
      this.selectedRegion,
      this.selectedLocation,
      this.selectedTerminal,
      this.colorTheme,
      this.selectedSsmLocalPort,
      this.autoDownloadUpdates,
      `${controls["sessionDuration"].value}`,
      ...["proxyProtocol", "proxyUrl", "proxyPort", "proxyUsername", "proxyPassword"].map((name) => controls[name].value ?? ""),
    ]);
  }

  // A confirmation on top of Settings. WindowService.confirmDialog closes every dialog first, Settings included.
  private confirmOverSettings(message: string, confirmText: string, onConfirm: () => void | Promise<void>, cancelText = "Cancel"): BsModalRef {
    return this.modalService.show(ConfirmationDialogComponent, {
      animated: false,
      class: "confirm-modal",
      backdrop: "static",
      keyboard: false,
      initialState: {
        message,
        confirmText,
        cancelText,
        callback: async (answer: string) => {
          if (answer !== constants.confirmClosed) {
            await onConfirm();
          }
        },
      },
    });
  }
}
