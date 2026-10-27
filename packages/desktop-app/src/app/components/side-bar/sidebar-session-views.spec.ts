import { ChangeDetectionStrategy, Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import { MatListModule } from "@angular/material/list";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatTooltipModule } from "@angular/material/tooltip";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { SideBarComponent, sidebarHighlight } from "./side-bar.component";
import { CommandBarComponent, globalFilteredSessions, globalFilterGroup, globalResetFilter } from "../command-bar/command-bar.component";
import { SessionsComponent } from "../sessions/sessions.component";
import { AppProviderService } from "../../services/app-provider.service";
import { OptionsService } from "../../services/options.service";
import { SessionStatus } from "@noovolari/leapp-core/models/session-status";
import { SessionType } from "@noovolari/leapp-core/models/session-type";
import { mustInjected } from "../../../base-injectables";

@Component({ standalone: false, selector: "app-integration-bar", template: "" })
class IntegrationPlaceholderComponent {}

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
  template:
    '<app-command-bar></app-command-bar><div class="side-bar"><app-side-bar></app-side-bar></div><div class="sessions"><app-session></app-session></div>',
})
class SessionViewsFixtureComponent {}

describe("Sidebar session-view rendering", () => {
  let fixture: ComponentFixture<SessionViewsFixtureComponent>;

  beforeEach(async () => {
    const sessions = ["Pinned fixture", "Unpinned fixture"].map((name, index) => ({
      sessionId: `fixture-${index}`,
      sessionName: name,
      type: SessionType.awsIamUser,
      status: SessionStatus.inactive,
      region: "us-east-1",
      profileId: "fixture-profile",
    }));
    const core = {
      behaviouralSubjectService: {
        sessions,
        sessions$: new BehaviorSubject(sessions),
        sessionSelections$: new BehaviorSubject([]),
        unselectSessions: () => {},
      },
      segmentService: { list: () => [] },
      ssmTunnelService: { states$: new BehaviorSubject(new Map()), runningCount: 0 },
      namedProfileService: { getNamedProfiles: () => [] },
      awsCoreService: { getRegions: () => [{ region: "us-east-1" }] },
      notificationService: { getNotifications: () => [], setNotifications: () => {} },
    };
    globalFilterGroup.next(null);
    globalFilteredSessions.next([]);
    globalResetFilter.next(false);
    await TestBed.configureTestingModule({
      declarations: [SessionViewsFixtureComponent, IntegrationPlaceholderComponent, SideBarComponent, CommandBarComponent, SessionsComponent],
      imports: [CommonModule, MatListModule, MatExpansionModule, MatTooltipModule, NoopAnimationsModule],
      providers: mustInjected().concat([
        { provide: AppProviderService, useValue: core },
        { provide: OptionsService, useValue: { pinned: ["fixture-0"], colorTheme: "dark-theme" } },
      ]),
    })
      .overrideComponent(CommandBarComponent, { set: { template: "" } })
      .overrideComponent(SessionsComponent, {
        set: { template: '<span class="fixture-session-row" *ngFor="let session of orderedSessions">{{session.sessionName}}</span>' },
      })
      .compileComponents();
    fixture = TestBed.createComponent(SessionViewsFixtureComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    document.body.classList.remove("dark-theme");
    globalFilterGroup.next(null);
    globalFilteredSessions.next([]);
    globalResetFilter.next(false);
    sidebarHighlight.next({ showAll: true, showPinned: false, selectedSegment: -1 });
  });

  const rows = (view: ComponentFixture<SessionViewsFixtureComponent>) =>
    Array.from(view.nativeElement.querySelectorAll(".fixture-session-row")).map((row: HTMLElement) => row.textContent.trim());

  const click = (view: ComponentFixture<SessionViewsFixtureComponent>, label: string) => {
    const item = Array.from(view.nativeElement.querySelectorAll("app-side-bar mat-list-item")).find(
      (node: HTMLElement) => node.textContent.trim() === label
    ) as HTMLElement;
    item.click();
    view.detectChanges();
  };

  it("switches Sessions and Pinned Sessions repeatedly without visiting Tunnels", () => {
    expect(rows(fixture)).toEqual(["Pinned fixture", "Unpinned fixture"]);
    click(fixture, "Pinned Sessions");
    expect(rows(fixture)).toEqual(["Pinned fixture"]);
    click(fixture, "Sessions");
    expect(rows(fixture)).toEqual(["Pinned fixture", "Unpinned fixture"]);
    click(fixture, "Pinned Sessions");
    expect(rows(fixture)).toEqual(["Pinned fixture"]);
  });

  it("keeps sidebar labels and icons readable in dark mode", () => {
    document.body.classList.add("dark-theme");
    const label = fixture.nativeElement.querySelector("app-side-bar mat-list-item .sidebar-row-label") as HTMLElement;
    const icon = fixture.nativeElement.querySelector("app-side-bar mat-list-item i") as HTMLElement;
    const brightness = (element: HTMLElement) => {
      const channels = getComputedStyle(element).color.match(/\d+/g).slice(0, 3).map(Number);
      return channels.reduce((sum, channel) => sum + channel, 0) / 3;
    };
    expect(brightness(label)).toBeGreaterThan(160);
    expect(brightness(icon)).toBeGreaterThan(160);
  });

  it("aligns selected and unselected sidebar labels without an indentation jump", () => {
    const label = (text: string) =>
      Array.from(fixture.nativeElement.querySelectorAll("app-side-bar mat-list-item .sidebar-row-label")).find(
        (node: HTMLElement) => node.textContent === text
      ) as HTMLElement;
    const sessionsX = label("Sessions").getBoundingClientRect().left;
    const pinnedX = label("Pinned Sessions").getBoundingClientRect().left;
    expect(Math.abs(sessionsX - pinnedX)).toBeLessThanOrEqual(2);
  });

  it("centres a sidebar label vertically within its row", () => {
    const item = fixture.nativeElement.querySelector("app-side-bar mat-list-item") as HTMLElement;
    const label = item.querySelector(".sidebar-row-label") as HTMLElement;
    const row = item.getBoundingClientRect();
    const text = label.getBoundingClientRect();
    expect(Math.abs((row.top + row.bottom) / 2 - (text.top + text.bottom) / 2)).toBeLessThanOrEqual(2);
  });
});
