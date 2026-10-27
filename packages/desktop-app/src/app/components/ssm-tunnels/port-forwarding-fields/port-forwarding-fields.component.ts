import { Component, Input } from "@angular/core";
import { TunnelDraft } from "../tunnel-draft";

// Remote ports offered as one-click choices
export const commonPorts = [
  { name: "PostgreSQL", port: 5432 },
  { name: "MySQL", port: 3306 },
  { name: "Redis", port: 6379 },
  { name: "RabbitMQ", port: 5672 },
  { name: "RabbitMQ UI", port: 15672 },
  { name: "SSH", port: 22 },
  { name: "RDP", port: 3389 },
];

@Component({
  standalone: false,
  selector: "app-port-forwarding-fields",
  templateUrl: "./port-forwarding-fields.component.html",
  styleUrls: ["./port-forwarding-fields.component.scss"],
})
export class PortForwardingFieldsComponent {
  @Input() draft: TunnelDraft;
  @Input() namePlaceholder = "e.g. rabbitmq-prod:15672";
  // Returns a local port that is free right now
  @Input() suggestLocalPort: () => Promise<number>;
  // The Default Local Port setting picks a free port when the remote one is taken
  @Input() freeLocalPortByDefault = false;

  readonly commonPorts = commonPorts;

  async useFreePort(): Promise<void> {
    this.draft.localPort = `${await this.suggestLocalPort()}`;
  }

  useCommonPort(port: number): void {
    this.draft.remotePort = `${port}`;
  }

  isCommonPortSelected(port: number): boolean {
    return this.draft.remotePort.trim() === `${port}`;
  }
}
