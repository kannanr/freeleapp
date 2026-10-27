import { ComponentFixture, TestBed } from "@angular/core/testing";

import { LeappSelectComponent } from "./leapp-select.component";
import { mustInjected } from "../../../base-injectables";
import { NgSelectModule } from "@ng-select/ng-select";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";

describe("LeappSelectComponent", () => {
  let component: LeappSelectComponent;
  let fixture: ComponentFixture<LeappSelectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LeappSelectComponent],
      providers: [].concat(mustInjected()),
      imports: [NgSelectModule, ReactiveFormsModule],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LeappSelectComponent);
    component = fixture.componentInstance;
    component.form = new FormGroup({});
    component.items = [];
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
