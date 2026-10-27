import { ChangeDetectionStrategy, Component, NgZone, OnDestroy, OnInit } from "@angular/core";
import {
  globalFilteredSessions,
  globalFilterGroup,
  globalHasFilter,
  globalResetFilter,
  globalSegmentFilter,
} from "../command-bar/command-bar.component";
import { BehaviorSubject } from "rxjs";
import { BsModalRef, BsModalService } from "ngx-bootstrap/modal";
import { ConfirmationDialogComponent } from "../dialogs/confirmation-dialog/confirmation-dialog.component";
import Segment from "@noovolari/leapp-core/models/segment";
import Folder from "@noovolari/leapp-core/models/folder";
import { BehaviouralSubjectService } from "@noovolari/leapp-core/services/behavioural-subject-service";
import { AppProviderService } from "../../services/app-provider.service";
import { constants } from "@noovolari/leapp-core/models/constants";
import { integrationHighlight } from "../integration-bar/integration-bar.component";
import { SessionStatus } from "@noovolari/leapp-core/models/session-status";
import { UpdaterService } from "../../services/updater.service";

export interface SelectedSegment {
  name: string;
  selected: boolean;
}

export interface HighlightSettings {
  showAll: boolean;
  showPinned: boolean;
  selectedSegment?: number;
  // The Tunnels view replaces the session list; pinnedTunnels shows only the pinned ones
  showTunnels?: boolean;
  pinnedTunnels?: boolean;
}

export const segmentFilter = new BehaviorSubject<Segment[]>([]);
export const sidebarHighlight = new BehaviorSubject<HighlightSettings>({ showAll: false, showPinned: true, selectedSegment: -1 });

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: "app-side-bar",
  templateUrl: "./side-bar.component.html",
  styleUrls: ["./side-bar.component.scss"],
})
export class SideBarComponent implements OnInit, OnDestroy {
  folders: Folder[];
  segments: Segment[];
  selectedS: SelectedSegment[];
  showAll: boolean;
  showPinned: boolean;
  showTunnels = false;
  showPinnedTunnels = false;
  runningTunnels = 0;
  activeSessions = 0;
  modalRef: BsModalRef;

  private unsubscribe: () => void;
  private behaviouralSubjectService: BehaviouralSubjectService;

  constructor(
    private bsModalService: BsModalService,
    private appProviderService: AppProviderService,
    private ngZone: NgZone,
    public updaterService: UpdaterService
  ) {
    this.behaviouralSubjectService = appProviderService.behaviouralSubjectService;
    this.showAll = true;
    this.showPinned = false;
  }

  ngOnInit(): void {
    const segmentFilterSubscription = segmentFilter.subscribe((segments) => {
      this.segments = segments;
      this.selectedS = this.segments.map((segment) => ({ name: segment.name, selected: false }));
    });
    segmentFilter.next(this.appProviderService.segmentService.list());

    const sidebarHighlightSubscription = sidebarHighlight.subscribe((value) => {
      this.highlightSelectedRow(value.showAll, value.showPinned, value.selectedSegment);
      this.showTunnels = !!value.showTunnels;
      this.showPinnedTunnels = !!value.showTunnels && !!value.pinnedTunnels;
    });
    // Tunnel processes report outside Angular's zone
    const sessionsSubscription = this.behaviouralSubjectService.sessions$.subscribe(
      (sessions) => (this.activeSessions = sessions.filter((session) => session.status === SessionStatus.active).length)
    );
    const tunnelsSubscription = this.appProviderService.ssmTunnelService.states$.subscribe(() =>
      this.ngZone.run(() => (this.runningTunnels = this.appProviderService.ssmTunnelService.runningCount))
    );
    sidebarHighlight.next({ showAll: true, showPinned: false, selectedSegment: -1 });

    this.unsubscribe = () => {
      segmentFilterSubscription.unsubscribe();
      sidebarHighlightSubscription.unsubscribe();
      tunnelsSubscription.unsubscribe();
      sessionsSubscription.unsubscribe();
    };
  }

  ngOnDestroy(): void {
    this.unsubscribe();
  }

  resetFilters(): void {
    document.querySelector(".sessions").classList.remove("filtered");
    sidebarHighlight.next({ showAll: true, showPinned: false, selectedSegment: -1 });
    globalFilteredSessions.next(this.behaviouralSubjectService.sessions);
    globalHasFilter.next(false);
    globalResetFilter.next(true);
  }

  showOnlyPinned(): void {
    // Pinned Sessions is a view of its own, like Sessions: clear a saved filter or search first, otherwise the list shows
    // only the pinned sessions that also match it (usually none)
    this.resetFilters();
    sidebarHighlight.next({ showAll: false, showPinned: true, selectedSegment: -1 });
    const globalFilters = globalFilterGroup.value;
    globalFilters.integrationFilter = [];
    globalFilters.pinnedFilter = true;
    globalFilterGroup.next(globalFilters);
  }

  // Keeps the badge a small circle; its tooltip gives the exact number
  badge(count: number): string {
    return count > 9 ? "9+" : `${count}`;
  }

  showTunnelsView(pinnedOnly: boolean): void {
    this.behaviouralSubjectService.unselectSessions();
    sidebarHighlight.next({ showAll: false, showPinned: false, selectedSegment: -1, showTunnels: true, pinnedTunnels: pinnedOnly });
  }

  applySegmentFilter(segment: Segment, event: any): void {
    event.preventDefault();
    event.stopPropagation();

    const selectedIndex = this.selectedS.findIndex((s) => s.name === segment.name);
    this.selectedS[selectedIndex].selected = true;
    this.behaviouralSubjectService.unselectSessions();
    sidebarHighlight.next({ showAll: false, showPinned: false, selectedSegment: selectedIndex });
    globalSegmentFilter.next(JSON.parse(JSON.stringify(segment)));
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  deleteSegment(segment: Segment, event: any): void {
    event.preventDefault();
    event.stopPropagation();

    this.appProviderService.segmentService.removeSegment(segment);
    this.segments = JSON.parse(JSON.stringify(this.appProviderService.segmentService.list()));
  }

  selectedSegmentCheck(segment: Segment): string {
    const index = this.selectedS.findIndex((s) => s.name === segment.name);
    return this.selectedS[index].selected ? "selected-segment" : "";
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  showConfirmationDialog(segment: Segment, event: any): void {
    const message = `Are you sure you want to delete the saved filter "${segment.name}"?`;
    const confirmText = "Delete";
    const callback = (answerString: string) => {
      if (answerString === constants.confirmed.toString()) {
        this.deleteSegment(segment, event);
      }
    };
    this.modalRef = this.bsModalService.show(ConfirmationDialogComponent, {
      animated: false,
      initialState: {
        message,
        callback,
        confirmText,
      },
    });
  }

  highlightSelectedRow(showAll: boolean, showPinned: boolean, selectedSegmentIndex?: number): void {
    this.showAll = showAll;
    this.showPinned = showPinned;
    this.selectedS.forEach((s) => (s.selected = false));
    if (selectedSegmentIndex >= 0) {
      this.selectedS[selectedSegmentIndex].selected = true;
    }
    integrationHighlight.next(-1);
  }
}
