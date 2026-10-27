import { Component, HostListener, OnDestroy, OnInit } from "@angular/core";
import { combineLatest, BehaviorSubject, Subscription } from "rxjs";
import { compactMode, sidebarCollapsed, sidebarToggleRequests } from "../../components/command-bar/command-bar.component";
import { AppProviderService } from "../../services/app-provider.service";
import { AppNativeService } from "../../services/app-native.service";
import { sidebarHighlight } from "../../components/side-bar/side-bar.component";
import { mainView } from "../../services/main-view";

// Below this window width the sidebar hides itself so the session list keeps usable space
export const sidebarAutoHideWidth = 900;
// Below this session list width the table switches to the compact layout
export const compactListWidth = 700;
// How long the overlay sidebar stays open without the pointer over it
export const sidebarOverlayIdleMs = 2000;
// Keep in sync with $menubar-width in global.scss
const sidebarWidth = 240;

@Component({
  standalone: false,
  selector: "app-main-layout",
  templateUrl: "./main-layout.component.html",
  styleUrls: ["./main-layout.component.scss"],
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  compactMode: boolean;
  sidebarVisible = true;
  // On narrow windows the sidebar button shows the sidebar on top of the list instead of docking it
  sidebarOverlay = false;
  // Tunnels in the sidebar shows the tunnel list instead of the sessions
  showTunnels = false;
  pinnedTunnelsOnly = false;

  private windowWidth$ = new BehaviorSubject<number>(window.innerWidth);
  private subscriptions: Subscription[] = [];
  private overlayTimer: ReturnType<typeof setTimeout>;

  constructor(
    private appProviderService: AppProviderService,
    private appNativeService: AppNativeService
  ) {}

  @HostListener("window:resize")
  onWindowResize(): void {
    this.windowWidth$.next(window.innerWidth);
  }

  ngOnInit(): void {
    this.subscriptions.push(
      combineLatest([sidebarCollapsed, this.windowWidth$]).subscribe(([collapsed, windowWidth]) => {
        this.sidebarVisible = !collapsed && windowWidth >= sidebarAutoHideWidth;
        if (windowWidth >= sidebarAutoHideWidth) {
          this.closeSidebarOverlay();
        }
        const listWidth = windowWidth - (this.sidebarVisible ? sidebarWidth : 0);
        const compact = listWidth < compactListWidth;
        if (compact !== compactMode.value) {
          compactMode.next(compact);
        }
        this.compactMode = compact;
      })
    );
    this.subscriptions.push(sidebarToggleRequests.subscribe(() => this.toggleSidebar()));
    this.subscriptions.push(
      sidebarHighlight.subscribe((highlight) => {
        this.showTunnels = !!highlight.showTunnels;
        this.pinnedTunnelsOnly = this.showTunnels && !!highlight.pinnedTunnels;
        const view = this.showTunnels ? (this.pinnedTunnelsOnly ? "pinnedTunnels" : "tunnels") : "sessions";
        if (view !== mainView.value) {
          mainView.next(view);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    clearTimeout(this.overlayTimer);
  }

  toggleSidebar(): void {
    if (this.windowWidth$.value >= sidebarAutoHideWidth) {
      sidebarCollapsed.next(!sidebarCollapsed.value);
    } else if (this.sidebarOverlay) {
      this.closeSidebarOverlay();
    } else {
      this.sidebarOverlay = true;
      this.scheduleSidebarOverlayClose();
    }
  }

  scheduleSidebarOverlayClose(): void {
    if (!this.sidebarOverlay) {
      return;
    }
    clearTimeout(this.overlayTimer);
    this.overlayTimer = setTimeout(() => this.closeSidebarOverlay(), sidebarOverlayIdleMs);
  }

  cancelSidebarOverlayClose(): void {
    clearTimeout(this.overlayTimer);
  }

  closeSidebarOverlay(): void {
    clearTimeout(this.overlayTimer);
    this.sidebarOverlay = false;
  }

  onTitleBarDoubleClick(event: MouseEvent): void {
    // Only the empty areas of the bar act as a title bar, not its buttons or the search field
    if ((event.target as HTMLElement).closest("button, a, input, textarea, ng-select, .window-buttons")) {
      return;
    }
    this.appNativeService.ipcRenderer.send("title-bar-double-click");
  }

  clearOptionBarIds(): void {
    this.appProviderService.behaviouralSubjectService.unselectSessions();
  }
}
