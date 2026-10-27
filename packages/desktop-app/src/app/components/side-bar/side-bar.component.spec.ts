import { BehaviorSubject } from "rxjs";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SideBarComponent } from "./side-bar.component";
import { mustInjected } from "../../../base-injectables";
import { AppProviderService } from "../../services/app-provider.service";
import { MatMenuModule } from "@angular/material/menu";
import { RouterTestingModule } from "@angular/router/testing";
import { globalFilterGroup, globalResetFilter } from "../command-bar/command-bar.component";

describe("SideBarComponent", () => {
  let component: SideBarComponent;
  let fixture: ComponentFixture<SideBarComponent>;

  beforeEach(async () => {
    const spyRepositoryService = jasmine.createSpyObj("Repository", {
      getProfiles: [],
      getSessions: [],
      getSegments: [],
    });
    const spyLeappCoreService = jasmine.createSpyObj("LeappCoreService", [], {
      repository: spyRepositoryService,
      segmentService: { list: () => [] },
      awsCoreService: { getRegions: () => [] },
      behaviouralSubjectService: { sessions: [], sessions$: new BehaviorSubject([]), unselectSessions: () => {} },
      ssmTunnelService: { states$: new BehaviorSubject(new Map()), runningCount: 0 },
    });

    await TestBed.configureTestingModule({
      declarations: [SideBarComponent],
      imports: [MatMenuModule, RouterTestingModule],
      providers: [].concat(mustInjected().concat({ provide: AppProviderService, useValue: spyLeappCoreService })),
    }).compileComponents();

    fixture = TestBed.createComponent(SideBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("clears a saved filter before showing only the pinned sessions", () => {
    const events: string[] = [];
    const resetSubscription = globalResetFilter.subscribe((value) => value && events.push("reset"));
    globalFilterGroup.next({ pinnedFilter: false, integrationFilter: [{ name: "sso", value: true }] } as any);
    const filterSubscription = globalFilterGroup.subscribe((filters) => filters && events.push(filters.pinnedFilter ? "pinned" : "unpinned"));
    events.length = 0;
    document.body.insertAdjacentHTML("beforeend", '<div class="sessions filtered"></div>');

    component.showOnlyPinned();

    expect(events[0]).toBe("reset");
    expect(events[events.length - 1]).toBe("pinned");
    expect(globalFilterGroup.value.integrationFilter).toEqual([]);
    expect(component.showPinned).toBeTrue();
    expect(component.showAll).toBeFalse();

    resetSubscription.unsubscribe();
    filterSubscription.unsubscribe();
    document.querySelector(".sessions").remove();
  });
});
