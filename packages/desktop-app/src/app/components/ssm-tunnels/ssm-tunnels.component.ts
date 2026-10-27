import { ChangeDetectionStrategy, Component, Input, NgZone, OnChanges, OnDestroy, OnInit } from "@angular/core";
import { Subscription } from "rxjs";
import { BsModalService } from "ngx-bootstrap/modal";
import { SsmTunnel, SsmTunnelState, SsmTunnelStatus } from "@noovolari/leapp-core/models/ssm-tunnel";
import { ssmCommandForProfile } from "@noovolari/leapp-core/services/ssm-service";
import { SsmTunnelService } from "@noovolari/leapp-core/services/ssm-tunnel-service";
import { constants } from "@noovolari/leapp-core/models/constants";
import { AppProviderService } from "../../services/app-provider.service";
import { AppService } from "../../services/app.service";
import { MessageToasterService, ToastLevel } from "../../services/message-toaster.service";
import { ConfirmationDialogComponent } from "../dialogs/confirmation-dialog/confirmation-dialog.component";
import { SsmTunnelDialogComponent } from "../dialogs/ssm-tunnel-dialog/ssm-tunnel-dialog.component";
import { SessionStatus } from "@noovolari/leapp-core/models/session-status";
import { copiedCommandMessage } from "./tunnel-draft";
import { tunnelSearch } from "../../services/main-view";

const statusLabels: Record<SsmTunnelStatus, string> = {
  [SsmTunnelStatus.stopped]: "Stopped",
  [SsmTunnelStatus.starting]: "Starting",
  [SsmTunnelStatus.active]: "Active",
  [SsmTunnelStatus.reconnecting]: "Reconnecting",
  [SsmTunnelStatus.failed]: "Failed",
};

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: "app-ssm-tunnels",
  templateUrl: "./ssm-tunnels.component.html",
  styleUrls: ["./ssm-tunnels.component.scss"],
})
export class SsmTunnelsComponent implements OnInit, OnChanges, OnDestroy {
  // Pinned Tunnels in the sidebar lists only the pinned ones
  @Input() pinnedOnly = false;

  tunnels: SsmTunnel[] = [];
  // Tunnels before the search box filters them
  allTunnels: SsmTunnel[] = [];
  searchText = "";
  states = new Map<string, SsmTunnelState>();
  now = Date.now();

  private subscriptions: Subscription[] = [];
  private clock: ReturnType<typeof setInterval>;

  constructor(
    private appProviderService: AppProviderService,
    private appService: AppService,
    private messageToasterService: MessageToasterService,
    private modalService: BsModalService,
    private ngZone: NgZone
  ) {}

  get tunnelService(): SsmTunnelService {
    return this.appProviderService.ssmTunnelService;
  }

  ngOnInit(): void {
    // Tunnel processes report outside Angular's zone
    this.subscriptions.push(this.tunnelService.states$.subscribe((states) => this.ngZone.run(() => (this.states = states))));
    // Session names change, and deleted sessions take their tunnels with them
    this.subscriptions.push(this.appProviderService.behaviouralSubjectService.sessions$.subscribe(() => this.refresh()));
    this.subscriptions.push(
      tunnelSearch.subscribe((text) => {
        this.searchText = text;
        this.refresh();
      })
    );
    // Keeps "active for …" current
    this.clock = setInterval(() => (this.now = Date.now()), 30000);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    clearInterval(this.clock);
  }

  ngOnChanges(): void {
    this.refresh();
  }

  refresh(): void {
    this.allTunnels = this.appProviderService.repository
      .listSsmTunnels()
      .filter((tunnel) => !this.pinnedOnly || tunnel.pinned)
      .sort((a, b) => (!!a.pinned === !!b.pinned ? a.name.localeCompare(b.name) : a.pinned ? -1 : 1));
    const search = this.searchText.trim().toLowerCase();
    this.tunnels = search ? this.allTunnels.filter((tunnel) => this.searchableText(tunnel).includes(search)) : this.allTunnels;
  }

  togglePin(tunnel: SsmTunnel): void {
    this.appProviderService.repository.updateSsmTunnel({ ...tunnel, pinned: !tunnel.pinned });
    this.refresh();
    this.messageToasterService.toast(
      tunnel.pinned ? `"${tunnel.name}" is no longer under Pinned Tunnels.` : `"${tunnel.name}" is now under Pinned Tunnels.`,
      ToastLevel.success,
      tunnel.pinned ? "Tunnel Unpinned" : "Tunnel Pinned"
    );
  }

  trackById(_index: number, tunnel: SsmTunnel): string {
    return tunnel.id;
  }

  state(tunnel: SsmTunnel): SsmTunnelState {
    return this.states.get(tunnel.id) ?? { status: SsmTunnelStatus.stopped };
  }

  statusLabel(tunnel: SsmTunnel): string {
    return statusLabels[this.state(tunnel).status];
  }

  // How long an active tunnel has been up, shown under its status
  activeFor(tunnel: SsmTunnel): string {
    const state = this.state(tunnel);
    if (state.status !== SsmTunnelStatus.active || !state.activeSince) {
      return "";
    }
    const minutes = Math.floor((this.now - new Date(state.activeSince).getTime()) / 60000);
    return minutes < 1 ? "less than a minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  isRunning(tunnel: SsmTunnel): boolean {
    return this.tunnelService.isRunning(tunnel.id);
  }

  sessionName(tunnel: SsmTunnel): string {
    return this.appProviderService.repository.getSessionById(tunnel.sessionId)?.sessionName ?? "";
  }

  profileName(tunnel: SsmTunnel): string {
    const session = this.appProviderService.repository.getSessionById(tunnel.sessionId) as any;
    try {
      return session?.profileId ? this.appProviderService.namedProfileService.getProfileName(session.profileId) : "";
    } catch (_) {
      return "";
    }
  }

  async toggle(tunnel: SsmTunnel): Promise<void> {
    if (this.isRunning(tunnel)) {
      this.tunnelService.stop(tunnel.id);
      return;
    }
    if (await this.appService.checkSsmRequirements()) {
      await this.tunnelService.start(tunnel.id);
    }
  }

  copyLocalAddress(tunnel: SsmTunnel): void {
    this.appService.copyToClipboard(`localhost:${tunnel.localPort}`);
    this.messageToasterService.toast(`localhost:${tunnel.localPort}`, ToastLevel.success, "Address Copied");
  }

  // To run the same tunnel from a terminal, with the session's named profile
  copyCommand(tunnel: SsmTunnel): void {
    this.appService.copyToClipboard(ssmCommandForProfile(tunnel.instanceId, tunnel.region, this.profileName(tunnel), tunnel));
    const sessionActive = this.appProviderService.repository.getSessionById(tunnel.sessionId)?.status === SessionStatus.active;
    this.messageToasterService.toast(copiedCommandMessage(this.profileName(tunnel), sessionActive), ToastLevel.success, "Command Copied");
  }

  edit(tunnel: SsmTunnel): void {
    this.modalService.show(SsmTunnelDialogComponent, {
      animated: false,
      class: "ssm-tunnel-modal",
      initialState: { tunnel, onSaved: () => this.refresh() },
    });
  }

  delete(tunnel: SsmTunnel): void {
    this.modalService.show(ConfirmationDialogComponent, {
      animated: false,
      initialState: {
        message: `Delete the tunnel "${tunnel.name}"?`,
        confirmText: "Delete",
        callback: (answer: string) => {
          if (answer === constants.confirmed.toString()) {
            this.tunnelService.stop(tunnel.id);
            this.appProviderService.repository.deleteSsmTunnel(tunnel.id);
            this.refresh();
            this.messageToasterService.toast(`"${tunnel.name}" was deleted.`, ToastLevel.success, "Tunnel Deleted");
          }
        },
      },
    });
  }

  // Everything the search box matches: names, target, ports, region, session and profile
  private searchableText(tunnel: SsmTunnel): string {
    return [
      tunnel.name,
      tunnel.instanceName,
      tunnel.instanceId,
      tunnel.remoteHost,
      tunnel.remotePort,
      tunnel.localPort,
      tunnel.region,
      this.sessionName(tunnel),
      this.profileName(tunnel),
    ]
      .filter((value) => value !== undefined && value !== null)
      .join(" ")
      .toLowerCase();
  }
}
