import { waitForAsync, ComponentFixture, TestBed } from "@angular/core/testing";

import { IntegrationBarComponent, integrationHighlight } from "./integration-bar.component";
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from "@angular/material/snack-bar";
import { mustInjected } from "../../../base-injectables";
import { RouterTestingModule } from "@angular/router/testing";
import { AppProviderService } from "../../services/app-provider.service";
import { AwsSsoIntegration } from "@noovolari/leapp-core/models/aws/aws-sso-integration";
import { IntegrationFactory } from "@noovolari/leapp-core/services/integration-factory";
import { BehaviorSubject } from "rxjs";

describe("IntegrationBarComponent", () => {
  let component: IntegrationBarComponent;
  let fixture: ComponentFixture<IntegrationBarComponent>;

  beforeEach(waitForAsync(() => {
    const spyRepositoryService = jasmine.createSpyObj("Repository", {
      getProfiles: [],
      getSessions: [],
      getSegments: [],
      listAwsSsoIntegrations: [],
      listAzureIntegrations: [],
      getDefaultLocation: () => "defaultLocation",
    });
    const spyBehaviouralSubjectService = jasmine.createSpyObj("BehaviouralSubjectService", [], {
      integrations: [],
      integrations$: new BehaviorSubject([]),
      setIntegrations: (_awsSsoIntegrations: AwsSsoIntegration[]) => void {},
      getIntegrations: () => [],
    });

    const spyIntegrationFactory = jasmine.createSpyObj("IntegrationFactory", {
      getIntegrations: [],
    });

    const spyLeappCoreService = jasmine.createSpyObj("AppProviderService", [], {
      repository: spyRepositoryService,
      awsCoreService: { getRegions: () => ["mocked-region-1", "mocked-region-2"] },
      awsSsoOidcService: { listeners: [] },
      behaviouralSubjectService: spyBehaviouralSubjectService,
      awsSsoIntegrationService: { getIntegrations: () => [] },
      azureIntegrationService: { getIntegrations: () => [] },
      integrationFactory: spyIntegrationFactory,
    });

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [IntegrationBarComponent],
      providers: [
        { provide: MAT_SNACK_BAR_DATA, useValue: {} },
        { provide: MatSnackBarRef, useValue: {} },
      ].concat(
        mustInjected().concat([
          { provide: IntegrationFactory, useValue: spyIntegrationFactory },
          { provide: AppProviderService, useValue: spyLeappCoreService },
        ])
      ),
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(IntegrationBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("unsubscribes from integration highlights when the view is destroyed", () => {
    const selection = { id: "fake-integration", selected: true };
    component.selectedIntegrations = [selection];
    fixture.destroy();
    integrationHighlight.next(-1);
    expect(selection.selected).toBeTrue();
  });
});
