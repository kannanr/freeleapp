import { ChangeDetectionStrategy, Component, Input, OnInit } from "@angular/core";
import { Session } from "@noovolari/leapp-core/models/session";
import { AppService } from "../../../services/app.service";
import { FormControl, FormGroup, Validators } from "@angular/forms";
import { AppProviderService } from "../../../services/app-provider.service";
import { MessageToasterService, ToastLevel } from "../../../services/message-toaster.service";
import { SessionType } from "@noovolari/leapp-core/models/session-type";
import * as uuid from "uuid";

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: "app-change-named-profile-dialog",
  templateUrl: "./change-named-profile-dialog.component.html",
  styleUrls: ["./change-named-profile-dialog.component.scss"],
})
export class ChangeNamedProfileDialogComponent implements OnInit {
  @Input()
  public session: Session;
  public form = new FormGroup({
    awsProfile: new FormControl("", [Validators.required]),
  });
  public selectedProfile: any;
  public profiles: { value: string; label: string }[];

  constructor(
    private appService: AppService,
    private appProviderService: AppProviderService,
    private messageToasterService: MessageToasterService
  ) {}

  ngOnInit(): void {
    this.profiles = this.appProviderService.namedProfileService.getNamedProfiles().map((p) => ({ label: p.name, value: p.id }));
    this.selectedProfile = this.session.type !== SessionType.azure ? (this.session as any).profileId : undefined;
  }

  closeModal(): void {
    this.appService.closeModal();
  }

  addNewUUID(): string {
    return uuid.v4();
  }

  async changeProfile(): Promise<void> {
    if (this.selectedProfile) {
      try {
        this.appProviderService.namedProfileService.getProfileName(this.selectedProfile.value);
      } catch (e) {
        this.selectedProfile.value = this.appProviderService.namedProfileService.createNamedProfile(this.selectedProfile.label).id;
      }

      try {
        await this.appProviderService.namedProfileService.changeNamedProfile(this.session, this.selectedProfile.value);
      } catch (error) {
        this.messageToasterService.toast(error.message, ToastLevel.warn, "Profile Not Changed");
        return;
      }

      this.messageToasterService.toast("Named Profile Changed", ToastLevel.success, "Profile changed!");
      this.closeModal();
    }
  }
}
