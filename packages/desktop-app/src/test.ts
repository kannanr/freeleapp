// Initializes the Angular testing environment; spec files are picked up by the "include" option in angular.json
import "zone.js/testing";
import { getTestBed } from "@angular/core/testing";
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from "@angular/platform-browser-dynamic/testing";
import { NgModule, provideZoneChangeDetection } from "@angular/core";

// Match the production NgModule's zone-based behavior, not Angular 22's zoneless default.
@NgModule({ providers: [provideZoneChangeDetection()] })
class ZoneBasedTestModule {}

getTestBed().initTestEnvironment([BrowserDynamicTestingModule, ZoneBasedTestModule], platformBrowserDynamicTesting());
