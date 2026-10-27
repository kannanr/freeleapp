import { ChangeDetectionStrategy, Component, Input, OnInit } from "@angular/core";
import { SsmTunnel } from "@noovolari/leapp-core/models/ssm-tunnel";
import { validatePortForwarding } from "@noovolari/leapp-core/services/ssm-service";
import { constants } from "@noovolari/leapp-core/models/constants";
import { AppService } from "../../../services/app.service";
import { AppProviderService } from "../../../services/app-provider.service";
import { MessageToasterService, ToastLevel } from "../../../services/message-toaster.service";
import { defaultTunnelName, resolveForwarding, TunnelDraft, tunnelDraftFrom } from "../../ssm-tunnels/tunnel-draft";

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: "app-ssm-tunnel-dialog",
  templateUrl: "./ssm-tunnel-dialog.component.html",
  styleUrls: ["./ssm-tunnel-dialog.component.scss"],
})
export class SsmTunnelDialogComponent implements OnInit {
  @Input() tunnel: SsmTunnel;
  @Input() onSaved: () => void;

  draft: TunnelDraft;
  error: string;

  constructor(
    private appService: AppService,
    private appProviderService: AppProviderService,
    private messageToasterService: MessageToasterService
  ) {}

  get suggestLocalPort(): () => Promise<number> {
    return () => this.appProviderService.ssmTunnelService.suggestLocalPort();
  }

  get freeLocalPortByDefault(): boolean {
    return this.appProviderService.repository.getWorkspace().ssmLocalPort === constants.ssmLocalPortFree;
  }

  ngOnInit(): void {
    this.draft = tunnelDraftFrom(this.tunnel);
  }

  closeModal(): void {
    this.appService.closeModal();
  }

  async save(): Promise<void> {
    // The tunnel's own port stays: while it runs, it is the one that looks taken
    const forwarding = await resolveForwarding(this.draft, (remotePort) =>
      remotePort === this.tunnel.localPort ? Promise.resolve(remotePort) : this.appProviderService.ssmTunnelService.defaultLocalPort(remotePort)
    );
    this.error = validatePortForwarding(forwarding);
    if (this.error) {
      return;
    }
    const tunnel: SsmTunnel = {
      ...this.tunnel,
      ...forwarding,
      name: this.draft.name.trim() || defaultTunnelName(this.tunnel.instanceName, forwarding),
      autoStart: this.draft.autoStart,
    };
    this.appProviderService.repository.updateSsmTunnel(tunnel);
    this.onSaved?.();
    this.closeModal();

    const tunnelService = this.appProviderService.ssmTunnelService;
    const changed =
      this.tunnel.remoteHost !== tunnel.remoteHost || this.tunnel.remotePort !== tunnel.remotePort || this.tunnel.localPort !== tunnel.localPort;
    const restart = changed && tunnelService.isRunning(tunnel.id);
    this.messageToasterService.toast(
      restart ? `"${tunnel.name}" is restarting with its new settings.` : `"${tunnel.name}" was saved.`,
      ToastLevel.success,
      "Tunnel Saved"
    );
    if (restart) {
      await tunnelService.restart(tunnel.id);
    }
  }
}
