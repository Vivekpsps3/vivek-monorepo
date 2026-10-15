import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlanningToolId } from '../models/planning.model';
import { PlanningQuickToolsComponent } from './planning-quick-tools.component';

@Component({
  standalone: true,
  imports: [PlanningQuickToolsComponent],
  template: `
    <section [hidden]="activeTool === 'simulation'">
      <app-planning-quick-tools [activeTool]="activeTool" />
    </section>
  `,
})
class QuickToolsHostComponent {
  activeTool: PlanningToolId = 'savings-goal';
}

describe('PlanningQuickToolsComponent state', () => {
  let fixture: ComponentFixture<QuickToolsHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickToolsHostComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(QuickToolsHostComponent);
    fixture.detectChanges();
  });

  it('keeps calculator drafts while their presentation is hidden for a simulation run', () => {
    const child = () => fixture.debugElement.query(By.directive(PlanningQuickToolsComponent))
      .componentInstance as PlanningQuickToolsComponent;
    const original = child();
    original.goal.name = 'First home';
    original.goal.currentSaved = 18_500;
    fixture.detectChanges();

    fixture.componentInstance.activeTool = 'simulation';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section').hidden).toBeTrue();
    expect(child()).toBe(original);

    fixture.componentInstance.activeTool = 'savings-goal';
    fixture.detectChanges();
    expect(child().goal.name).toBe('First home');
    expect(child().goal.currentSaved).toBe(18_500);
  });
});
