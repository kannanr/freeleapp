import { Component, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { BsModalService } from "ngx-bootstrap/modal";
import {
  compactMode,
  globalColumns,
  globalFilteredSessions,
  globalFilterGroup,
  globalHasFilter,
  IGlobalColumns,
} from "../command-bar/command-bar.component";
import { ColumnDialogComponent } from "../dialogs/column-dialog/column-dialog.component";
import { SessionCardComponent } from "./session-card/session-card.component";
import { Session } from "@noovolari/leapp-core/models/session";
import { GlobalFilters } from "@noovolari/leapp-core/models/segment";
import { BehaviouralSubjectService } from "@noovolari/leapp-core/services/behavioural-subject-service";
import { AppProviderService } from "../../services/app-provider.service";
import { SessionType } from "@noovolari/leapp-core/models/session-type";
import { AwsIamRoleFederatedSession } from "@noovolari/leapp-core/models/aws/aws-iam-role-federated-session";
import { AzureSession } from "@noovolari/leapp-core/models/azure/azure-session";
import { AwsSsoRoleSession } from "@noovolari/leapp-core/models/aws/aws-sso-role-session";
import { AwsIamRoleChainedSession } from "@noovolari/leapp-core/models/aws/aws-iam-role-chained-session";
import { SessionSelectionState } from "@noovolari/leapp-core/models/session-selection-state";
import { SessionStatus } from "@noovolari/leapp-core/models/session-status";
import { OptionsService } from "../../services/options.service";
import { AwsIamUserSession } from "@noovolari/leapp-core/models/aws/aws-iam-user-session";
import { FilteringPipe } from "./pipes/filtering.pipe";

export interface ArrowSettings {
  activeArrow: boolean;
  orderStyle: boolean;
}

@Component({
  standalone: false,
  selector: "app-session",
  templateUrl: "./sessions.component.html",
  styleUrls: ["./sessions.component.scss"],
})
export class SessionsComponent implements OnInit, OnDestroy {
  @ViewChild(SessionCardComponent) sessionCard;

  eGlobalFilterExtended: boolean;
  eGlobalFilteredSessions: Session[];
  eCompactMode: boolean;
  eGlobalFilterGroup: GlobalFilters;
  eGlobalColumns: IGlobalColumns;
  eGlobalColumnsCount: number;
  eSessionType = SessionType;
  eSessionStatus = SessionStatus;
  columnCount = 0;

  showOnly = "ALL";

  // For column ordering
  columnSettings: ArrowSettings[];

  selectedSession?: Session;

  private sortColumn: number | null = null;
  private sortDescending = false;
  private filteredSessions: Session[] = [];
  private subscriptions = [];
  private sessionFiltering;

  private behaviouralSubjectService: BehaviouralSubjectService;

  constructor(
    private modalService: BsModalService,
    private appProviderService: AppProviderService,
    public optionService: OptionsService,
    public bsModalService: BsModalService
  ) {
    this.sessionFiltering = new FilteringPipe();
    this.behaviouralSubjectService = this.appProviderService.behaviouralSubjectService;
    this.columnSettings = Array.from(Array(5)).map((): ArrowSettings => ({ activeArrow: false, orderStyle: false }));
    const subscription = globalHasFilter.subscribe((value) => {
      this.eGlobalFilterExtended = value;
    });
    const subscription2 = globalFilteredSessions.subscribe((value) => {
      // Session changes (start, stop, sync) emit a new list: keep the column order the user chose
      this.filteredSessions = value;
      this.eGlobalFilteredSessions = this.sortByColumn(value);
    });
    const subscription3 = compactMode.subscribe((value) => {
      this.eCompactMode = value;
    });
    const subscription4 = globalFilterGroup.subscribe((value) => {
      this.eGlobalFilterGroup = value;
    });
    const subscription5 = globalColumns.subscribe((value) => {
      this.columnCount = 0;
      this.eGlobalColumns = value;
      for (const [_, objValue] of Object.entries(this.eGlobalColumns)) {
        if (objValue === true) {
          this.columnCount++;
        }
      }
      this.eGlobalColumnsCount = this.columnCount;
    });
    const subscription6 = this.behaviouralSubjectService.sessionSelections$.subscribe((sessionSelections: SessionSelectionState[]) => {
      const sessionsCssClasses = document.querySelector(".sessions")?.classList;
      if (sessionSelections.length > 0) {
        this.selectedSession = this.eGlobalFilteredSessions.find((session) => session.sessionId === sessionSelections[0].sessionId);
        sessionsCssClasses?.add("option-bar-opened");
      } else {
        this.selectedSession = undefined;
        sessionsCssClasses?.remove("option-bar-opened");
      }
    });

    this.subscriptions.push(subscription, subscription2, subscription3, subscription4, subscription5, subscription6);
  }

  get orderedSessions(): Session[] {
    return [
      ...this.sessionFiltering.transform(this.eGlobalFilteredSessions, true),
      ...this.sessionFiltering.transform(this.eGlobalFilteredSessions, false),
    ];
  }

  ngOnInit(): void {}

  // Keeps each recycled row bound to the same session when the list is re-ordered
  trackBySessionId(_index: number, session: Session): string {
    return session.sessionId;
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
  }

  openFilterColumn(): void {
    this.modalService.show(ColumnDialogComponent, {
      initialState: { eGlobalColumns: this.eGlobalColumns },
      animated: false,
      class: "column-modal",
    });
  }

  setVisibility(name: string): void {
    if (this.showOnly === name) {
      this.showOnly = "ALL";
    } else {
      this.showOnly = name;
    }
  }

  /**
   * A click on a column header orders by that column: ascending, then descending, then back to the filter order
   */
  orderByColumn(column: number): void {
    if (this.sortColumn !== column) {
      this.sortColumn = column;
      this.sortDescending = false;
    } else if (!this.sortDescending) {
      this.sortDescending = true;
    } else {
      this.sortColumn = null;
    }
    this.columnSettings.forEach((settings, index) => {
      settings.activeArrow = index === this.sortColumn && !this.sortDescending;
      settings.orderStyle = index === this.sortColumn;
    });
    this.eGlobalFilteredSessions = this.sortByColumn(this.filteredSessions);
  }

  getRole(s: Session): string {
    switch (s.type) {
      case SessionType.awsIamRoleFederated:
        return (s as AwsIamRoleFederatedSession).roleArn.split("role/")[1];
      case SessionType.azure:
        return (s as AzureSession).subscriptionId;
      case SessionType.localstack:
        return "local";
      case SessionType.awsIamUser:
        return "";
      case SessionType.awsSsoRole:
        const splittedRoleArn = (s as AwsSsoRoleSession).roleArn.split("/");
        splittedRoleArn.splice(0, 1);
        return splittedRoleArn.join("/");
      case SessionType.awsIamRoleChained:
        return (s as AwsIamRoleChainedSession).roleArn.split("role/")[1];
      default:
        return "";
    }
  }

  private getProfileName(session: Session): string {
    try {
      return this.appProviderService.namedProfileService.getProfileName((session as AwsIamUserSession).profileId);
    } catch (e) {}
    return "";
  }

  private sortByColumn(sessions: Session[]): Session[] {
    if (this.sortColumn === null) {
      return sessions;
    }
    const sortKeys: ((session: Session) => string)[] = [
      (session) => session.sessionName,
      (session) => this.getRole(session),
      (session) => session.type,
      (session) => this.getProfileName(session),
      (session) => session.region,
    ];
    const sortKey = sortKeys[this.sortColumn];
    const direction = this.sortDescending ? -1 : 1;
    return [...sessions].sort((a, b) => {
      const keyA = sortKey(a) ?? "";
      const keyB = sortKey(b) ?? "";
      // Empty values (e.g. IAM users have no role) go last in ascending order
      if (!keyA !== !keyB) {
        return (keyA ? -1 : 1) * direction;
      }
      return keyA.localeCompare(keyB) * direction;
    });
  }
}
