import { AfterContentChecked, Component, ElementRef, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { mainView, tunnelSearch } from "../../services/main-view";
import { BsModalService } from "ngx-bootstrap/modal";
import { OptionsDialogComponent } from "../dialogs/options-dialog/options-dialog.component";
import { CreateDialogComponent } from "../dialogs/create-dialog/create-dialog.component";
import { SegmentDialogComponent } from "../dialogs/segment-dialog/segment-dialog.component";
import { FormControl, FormGroup } from "@angular/forms";
import { BehaviorSubject, Subject } from "rxjs";
import { Session } from "@noovolari/leapp-core/models/session";
import Segment, { GlobalFilters } from "@noovolari/leapp-core/models/segment";
import { SessionType } from "@noovolari/leapp-core/models/session-type";
import { BehaviouralSubjectService } from "@noovolari/leapp-core/services/behavioural-subject-service";
import { syncAllEvent } from "../integration-bar/integration-bar.component";
import { AppProviderService } from "../../services/app-provider.service";
import { AppNativeService } from "../../services/app-native.service";
import { AppService } from "../../services/app.service";
import { AwsSsoRoleSession } from "@noovolari/leapp-core/models/aws/aws-sso-role-session";
import { constants } from "@noovolari/leapp-core/models/constants";
import { WindowService } from "../../services/window.service";
import { OptionsService } from "../../services/options.service";
import { AzureSession } from "@noovolari/leapp-core/models/azure/azure-session";
import { UpdaterService } from "../../services/updater.service";
import { LeappNotification } from "@noovolari/leapp-core/models/notification";
import { InfoDialogComponent } from "../dialogs/info-dialog/info-dialog.component";
import { NotificationService } from "@noovolari/leapp-core/services/notification-service";

// Narrow layout (fewer columns, shorter labels): derived from the window width by MainLayoutComponent
export const compactMode = new BehaviorSubject<boolean>(false);
// Sidebar toggled by the user; it never resizes the window
export const sidebarCollapsed = new BehaviorSubject<boolean>(false);
// Clicks on the sidebar button; MainLayoutComponent decides between collapsing and showing it as an overlay
export const sidebarToggleRequests = new Subject<void>();
export const globalFilteredSessions = new BehaviorSubject<Session[]>([]);
export const globalFilterGroup = new BehaviorSubject<GlobalFilters>(null);
export const globalHasFilter = new BehaviorSubject<boolean>(false);
export const globalResetFilter = new BehaviorSubject<boolean>(false);
export const globalSegmentFilter = new BehaviorSubject<Segment>(null);

export interface IGlobalColumns {
  role: boolean;
  provider: boolean;
  namedProfile: boolean;
  region: boolean;
}

export const globalColumns = new BehaviorSubject<IGlobalColumns>(null);
export const globalColumnsCount = new BehaviorSubject<number>(null);

@Component({
  standalone: false,
  selector: "app-command-bar",
  templateUrl: "./command-bar.component.html",
  styleUrls: ["./command-bar.component.scss"],
})
export class CommandBarComponent implements OnInit, OnDestroy, AfterContentChecked {
  @ViewChild("parent") parent: ElementRef;
  @ViewChild("child") child: ElementRef;
  overflowed = false;

  filterForm = new FormGroup({
    searchFilter: new FormControl(""),
    dateFilter: new FormControl(true),
    providerFilter: new FormControl([]),
    profileFilter: new FormControl([]),
    regionFilter: new FormControl([]),
    typeFilter: new FormControl([]),
  });

  providers: { show: boolean; id: string; name: string; value: boolean }[];
  profiles: { show: boolean; id: string; name: string; value: boolean }[];
  types: { show: boolean; id: SessionType; category: string; name: string; value: boolean }[];
  regions: { show: boolean; name: string; value: boolean }[];

  filterExtended: boolean;
  // The main area shows tunnels: the search box filters them, and the session filters are hidden
  tunnelsView = false;
  compactMode: boolean;

  eConstants = constants;

  notificationService: NotificationService;

  private compactModeSubscription;
  private subscription0;
  private subscription1;
  private subscription2;
  private subscription3;
  private subscription4;
  private subscription5;
  private viewSubscription;
  private searchSubscription;

  private behaviouralSubjectService: BehaviouralSubjectService;

  constructor(
    public optionsService: OptionsService,
    private bsModalService: BsModalService,
    public appService: AppService,
    public updaterService: UpdaterService,
    public appNativeService: AppNativeService,
    private appProviderService: AppProviderService,
    private windowService: WindowService
  ) {
    this.behaviouralSubjectService = appProviderService.behaviouralSubjectService;

    this.filterExtended = false;
    this.compactMode = false;

    globalFilteredSessions.next(this.behaviouralSubjectService.sessions);

    globalColumns.next({
      role: true,
      provider: true,
      namedProfile: true,
      region: true,
    });

    this.setInitialArrayFilters();

    this.notificationService = this.appProviderService.notificationService;

    // Drop the Noovolari shutdown notice persisted by upstream Leapp builds
    this.notificationService.setNotifications(this.notificationService.getNotifications().filter((n) => n.uuid !== "noovolari-1000"));
  }

  private static changeSessionsTableHeight() {
    document.querySelector(".sessions").classList.toggle("filtered");
  }

  get notifications(): LeappNotification[] {
    return this.notificationService.getNotifications();
  }

  get isIssueButtonEnabled(): boolean {
    return !!this.appService.issueBody;
  }

  get isNotificationPending(): boolean {
    return (
      this.appProviderService.notificationService.getNotifications(true).length > 0 ||
      (this.updaterService.isReady() && this.updaterService.isUpdateNeeded())
    );
  }

  ngOnInit(): void {
    this.compactModeSubscription = compactMode.subscribe((value) => (this.compactMode = value));

    this.subscription0 = globalFilterGroup.subscribe((values: GlobalFilters) => {
      this.applyFiltersToSessions(values, this.behaviouralSubjectService.sessions);
    });

    this.subscription1 = this.filterForm.valueChanges.subscribe((values: GlobalFilters) => {
      values.pinnedFilter = globalFilterGroup.value ? globalFilterGroup.value.pinnedFilter : false;
      values.integrationFilter = globalFilterGroup.value ? globalFilterGroup.value.integrationFilter : [];
      globalFilterGroup.next(values);
    });

    this.subscription2 = globalHasFilter.subscribe((value) => {
      this.filterExtended = value;
    });

    this.subscription3 = globalResetFilter.subscribe(() => {
      this.setInitialArrayFilters();

      this.filterForm.get("searchFilter").setValue("");
      this.filterForm.get("dateFilter").setValue(true);
      this.filterForm.get("providerFilter").setValue(this.providers);
      this.filterForm.get("profileFilter").setValue(this.profiles);
      this.filterForm.get("regionFilter").setValue(this.regions);
      this.filterForm.get("typeFilter").setValue(this.types);

      const globalFilters = globalFilterGroup.value;
      globalFilters.pinnedFilter = false;
      globalFilters.integrationFilter = [];
      globalFilterGroup.next(globalFilters);
    });

    this.subscription4 = this.behaviouralSubjectService.sessions$.subscribe((sessions) => {
      const actualFilterValues: GlobalFilters = {
        dateFilter: this.filterForm.get("dateFilter").value,
        pinnedFilter: globalFilterGroup.value ? globalFilterGroup.value.pinnedFilter : false,
        integrationFilter: globalFilterGroup.value ? globalFilterGroup.value.integrationFilter : [],
        profileFilter: this.filterForm.get("profileFilter").value,
        providerFilter: this.filterForm.get("providerFilter").value,
        regionFilter: this.filterForm.get("regionFilter").value,
        searchFilter: this.filterForm.get("searchFilter").value,
        typeFilter: this.filterForm.get("typeFilter").value,
      };

      this.applyFiltersToSessions(actualFilterValues, sessions);
    });

    this.viewSubscription = mainView.subscribe((view) => {
      const tunnelsView = view !== "sessions";
      if (tunnelsView && this.filterExtended) {
        this.toggleFilters();
      }
      // Each view starts with an empty search
      if (tunnelsView !== this.tunnelsView && this.filterForm.get("searchFilter").value) {
        this.filterForm.get("searchFilter").setValue("");
      }
      this.tunnelsView = tunnelsView;
    });
    this.searchSubscription = this.filterForm.get("searchFilter").valueChanges.subscribe((text: string) => tunnelSearch.next(text ?? ""));

    this.subscription5 = globalSegmentFilter.subscribe((segment: Segment) => {
      if (segment) {
        const values = segment.filterGroup;
        // Update the form and chip lists first: filtering reads both, so emitting before would use stale chips
        this.updateFilterForm(values);
        globalFilterGroup.next(values);
      }
    });
  }

  ngOnDestroy(): void {
    this.compactModeSubscription?.unsubscribe();
    this.subscription0?.unsubscribe();
    this.subscription1?.unsubscribe();
    this.subscription2?.unsubscribe();
    this.subscription3?.unsubscribe();
    this.subscription4?.unsubscribe();
    this.subscription5?.unsubscribe();
    this.viewSubscription?.unsubscribe();
    this.searchSubscription?.unsubscribe();
  }

  ngAfterContentChecked(): void {
    if (this.parent && this.child) {
      const parentW = parseInt(this.parent.nativeElement.clientWidth, 10);
      const childW = parseInt(this.child.nativeElement.clientWidth, 10);
      this.overflowed = childW > parentW;
    }
  }

  showOptionDialog(): void {
    this.bsModalService.show(OptionsDialogComponent, { animated: false, class: "option-modal", backdrop: "static", keyboard: false });
  }

  showCreateDialog(): void {
    this.bsModalService.show(CreateDialogComponent, { animated: false, class: "create-modal", backdrop: "static", keyboard: false });
  }

  toggleSidebar(): void {
    sidebarToggleRequests.next();
  }

  toggleFilters(): void {
    this.filterExtended = !this.filterExtended;
    globalHasFilter.next(this.filterExtended);
    CommandBarComponent.changeSessionsTableHeight();
  }

  clearSearch(): void {
    // valueChanges re-applies the filters, so clearing the field restores the full session list
    this.filterForm.get("searchFilter").setValue("");
  }

  toggleDateFilter(): void {
    this.filterForm.get("dateFilter").setValue(!this.filterForm.get("dateFilter").value);
  }

  openSaveSegmentDialog(): void {
    this.bsModalService.show(SegmentDialogComponent, { animated: false, class: "segment-modal" });
  }

  checkFormIsDirty(): boolean {
    return (
      this.filterForm.get("dateFilter").value ||
      this.filterForm.get("providerFilter").value.length > 0 ||
      this.filterForm.get("profileFilter").value.length > 0 ||
      this.filterForm.get("regionFilter").value.length > 0 ||
      this.filterForm.get("typeFilter").value.length > 0
    );
  }

  syncAll(): void {
    syncAllEvent.next(true);
  }

  windowButtonDetectTheme(): string {
    if (
      this.optionsService.colorTheme === constants.darkTheme ||
      (this.optionsService.colorTheme === constants.systemDefaultTheme && this.appService.isDarkMode())
    ) {
      return "_dark";
    } else {
      return "";
    }
  }

  windowMaximizeAction(): void {
    if (this.windowService.getCurrentWindow().isMaximized()) {
      this.windowService.getCurrentWindow().restore();
    } else {
      this.windowService.getCurrentWindow().maximize();
    }
  }

  async goToWhatsNew(): Promise<void> {
    const title = "What's New";
    const releaseNotes = await this.updaterService.getInstalledReleaseNote();

    this.bsModalService.show(InfoDialogComponent, {
      animated: false,
      initialState: {
        title,
        description: releaseNotes,
      },
    });
  }

  goToGettingStarted(): void {
    this.windowService.openExternalUrl(`${constants.docsUrl}/getting-started/overview/`);
  }

  openAnIssue(): void {
    this.windowService.openExternalUrl(
      `https://github.com/sergioarojasm98/freeleapp/issues/new?labels=bug&body=${encodeURIComponent(this.appService.issueBody)}`
    );
  }

  requestAFeature(): void {
    this.windowService.openExternalUrl(
      `https://github.com/sergioarojasm98/freeleapp/issues/new?labels=enhancement&body=${encodeURIComponent(this.appService.featureBody)}`
    );
  }

  openInfoModal(notification: LeappNotification): void {
    this.notificationService.setNotificationAsRead(notification.uuid);
    this.bsModalService.show(InfoDialogComponent, {
      animated: false,
      class: "leapp-team-early-access-modal",
      initialState: {
        title: notification.title,
        description: notification.description,
        link: notification?.link,
        buttonName: notification.buttonActionName,
      },
    });
  }

  private applyFiltersToSessions(globalFilters: GlobalFilters, sessions: Session[]) {
    let filteredSessions = sessions;
    const searchText = this.filterForm.get("searchFilter").value;
    if (searchText !== "") {
      filteredSessions = filteredSessions.filter((session) => {
        let test = false;
        test ||= session.sessionName.toLowerCase().indexOf(searchText.toLowerCase()) > -1;
        test ||= session.type.toLowerCase().indexOf(searchText.toLowerCase()) > -1;
        test ||= session.region.toLowerCase().indexOf(searchText.toLowerCase()) > -1;
        test ||= (session as any).email?.toLowerCase().indexOf(searchText.toLowerCase()) > -1;
        test ||= (session as any).roleArn?.toLowerCase().indexOf(searchText.toLowerCase()) > -1;
        test ||= (session as any).idpArn?.toLowerCase().indexOf(searchText.toLowerCase()) > -1;
        test ||= (session as any).roleSessionName?.toLowerCase().indexOf(searchText.toLowerCase()) > -1;

        try {
          test ||=
            this.appProviderService.namedProfileService
              .getProfileName((session as any).profileId)
              ?.toLowerCase()
              .indexOf(searchText.toLowerCase()) > -1;
        } catch (e) {
          test ||= false;
        }
        return test;
      });
    }

    if (this.filterForm.get("dateFilter").value) {
      filteredSessions = this.orderByDate(filteredSessions);
    } else {
      filteredSessions = filteredSessions.sort((a, b) => a.sessionName.localeCompare(b.sessionName));
    }

    if (this.filterForm.get("providerFilter").value.filter((v) => v.value).length > 0) {
      filteredSessions = filteredSessions.filter((session) => {
        let test = false;
        this.providers.forEach((provider) => {
          if (provider.value) {
            test ||= session.type.indexOf(provider.id) > -1;
          }
        });
        return test;
      });
    }

    if (this.filterForm.get("profileFilter").value.filter((v) => v.value).length > 0) {
      filteredSessions = filteredSessions.filter((session) => {
        let test = false;
        this.profiles.forEach((profile) => {
          if (profile.value) {
            if ((session as any).profileId) {
              test ||= (session as any).profileId.indexOf(profile.id) > -1;
            }
          }
        });
        return test;
      });
    }

    if (this.filterForm.get("regionFilter").value.filter((v) => v.value).length > 0) {
      filteredSessions = filteredSessions.filter((session) => {
        let test = false;
        this.regions.forEach((region) => {
          if (region.value) {
            test ||= session.region.indexOf(region.name) > -1;
          }
        });
        return test;
      });
    }

    if (this.filterForm.get("typeFilter").value.filter((v) => v.value).length > 0) {
      filteredSessions = filteredSessions.filter((session) => {
        let test = false;
        this.types.forEach((type) => {
          if (type.value) {
            test ||= session.type.indexOf(type.id) > -1;
          }
        });
        return test;
      });
    }

    filteredSessions = filteredSessions.sort((x, y) => {
      const pinnedList = this.optionsService.pinned;
      if ((pinnedList.indexOf(x.sessionId) !== -1) === (pinnedList.indexOf(y.sessionId) !== -1)) {
        return 0;
      } else if (this.optionsService.pinned.indexOf(x.sessionId) !== -1) {
        return -1;
      } else {
        return 1;
      }
    });

    // Filtering using globalFilters
    if (globalFilters && globalFilters.pinnedFilter) {
      filteredSessions = filteredSessions.filter((s: Session) => this.optionsService.pinned.includes(s.sessionId));
    }

    if (globalFilters && globalFilters.integrationFilter.length > 0) {
      const allowedIntegrationIds = globalFilters.integrationFilter.filter((filter) => filter.value).map((filter) => filter.name);
      filteredSessions = filteredSessions.filter((session) => {
        const sessionIntegrationId = (session as AwsSsoRoleSession).awsSsoConfigurationId || (session as AzureSession).azureIntegrationId;
        return allowedIntegrationIds.includes(sessionIntegrationId);
      });
    }

    return globalFilteredSessions.next(filteredSessions);
  }

  // Started sessions by start time, then the others by name. Only started sessions have a start time: comparing
  // the missing ones (NaN) left the list in the order the sessions were created.
  private orderByDate(filteredSession: Session[]) {
    return filteredSession.sort((a, b) => {
      if (a.startDateTime && b.startDateTime) {
        return new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime();
      }
      if (a.startDateTime || b.startDateTime) {
        return a.startDateTime ? -1 : 1;
      }
      return a.sessionName.localeCompare(b.sessionName);
    });
  }

  private updateFilterForm(values: GlobalFilters) {
    if (values.providerFilter.length > 0) {
      this.providers = values.providerFilter;
      this.providers.forEach((provider) => {
        provider.show = true;
      });
    }
    if (values.profileFilter.length > 0) {
      this.profiles = values.profileFilter;
      this.profiles.forEach((profile) => {
        profile.show = true;
      });
    }
    if (values.regionFilter.length > 0) {
      this.regions = values.regionFilter;
      this.regions.forEach((region) => {
        region.show = true;
      });
    }
    if (values.typeFilter.length > 0) {
      this.types = values.typeFilter;
      this.types.forEach((type) => {
        type.show = true;
      });
    }

    // Set every field without emitting, so the list is filtered once with the complete saved filter
    this.filterForm.patchValue(
      {
        searchFilter: values.searchFilter,
        dateFilter: values.dateFilter,
        providerFilter: values.providerFilter,
        profileFilter: values.profileFilter,
        regionFilter: values.regionFilter,
        typeFilter: values.typeFilter,
      },
      { emitEvent: false }
    );
  }

  private setInitialArrayFilters() {
    this.providers = [
      { show: true, id: "aws", name: "Amazon AWS", value: false },
      { show: true, id: "azure", name: "Microsoft Azure", value: false },
    ];

    this.types = [
      { show: true, id: SessionType.awsIamRoleFederated, category: "Amazon AWS", name: "IAM Role Federated", value: false },
      { show: true, id: SessionType.awsIamUser, category: "Amazon AWS", name: "IAM User", value: false },
      { show: true, id: SessionType.awsIamRoleChained, category: "Amazon AWS", name: "IAM Role Chained", value: false },
      { show: true, id: SessionType.awsSsoRole, category: "Amazon AWS", name: "IAM Single Sign-On", value: false },
      { show: true, id: SessionType.azure, category: "Microsoft Azure", name: "Azure Subscription", value: false },
    ];

    this.profiles = this.appProviderService.namedProfileService
      .getNamedProfiles()
      .map((element) => ({ name: element.name, id: element.id, value: false, show: true }));

    this.regions = this.appProviderService.awsCoreService.getRegions().map((element) => ({ name: element.region, value: false, show: true }));
  }
}
