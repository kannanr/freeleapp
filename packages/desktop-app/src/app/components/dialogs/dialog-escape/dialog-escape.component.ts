import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, OnInit, Output } from "@angular/core";

const openPanels = "ng-dropdown-panel, .cdk-overlay-pane .mat-menu-panel, .cdk-overlay-pane .mat-mdc-menu-panel";

/**
 * Put at the top of a dialog: Escape then does what the dialog's Cancel or close button does. Only the dialog on top
 * reacts, and not while a dropdown or menu is open, since Escape closes that first.
 */
@Component({
  standalone: false,
  selector: "app-dialog-escape",
  template: "",
})
export class DialogEscapeComponent implements OnInit, OnDestroy {
  @Output() escape = new EventEmitter<void>();

  private panelOpen = false;

  constructor(private elementRef: ElementRef) {}

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.panelOpen) {
      return;
    }
    const dialogs = document.querySelectorAll("modal-container");
    if (dialogs.length > 0 && dialogs[dialogs.length - 1].contains(this.elementRef.nativeElement)) {
      this.escape.emit();
    }
  }

  ngOnInit(): void {
    document.addEventListener("keydown", this.beforeKeydown, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener("keydown", this.beforeKeydown, true);
  }

  // Checked before the dropdown sees the key: by the time this component does, it has closed its panel, and ng-select
  // marks every Escape as handled, even with its panel closed.
  private readonly beforeKeydown = (event: KeyboardEvent): void => {
    this.panelOpen = event.key === "Escape" && !!document.querySelector(openPanels);
  };
}
