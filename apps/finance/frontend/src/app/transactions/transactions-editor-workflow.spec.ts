import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute,Router } from '@angular/router';
import { todayIsoDate } from '@vivek/browser';
import { ToastService } from '@vivek/ui';
import { of,throwError } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { TransactionsEditorWorkflow } from './transactions-editor-workflow';
import { RECENT_PAST_TRIP_LIMIT } from './trip-tag';

function editor(http?: { get: jasmine.Spy }) {
  const finance = jasmine.createSpyObj('FinanceService', ['updateTransaction', 'addTransaction']);
  finance.updateTransaction.and.returnValue(of({}));
  finance.addTransaction.and.returnValue(of({}));
  const toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
  const route = { snapshot: { queryParamMap: { get: () => null, has: () => false } } };
  const router = { navigate: () => Promise.resolve(true) };
  TestBed.configureTestingModule({
    providers: [
      TransactionsEditorWorkflow,
      { provide: FinanceService, useValue: finance },
      { provide: ToastService, useValue: toast },
      { provide: ChangeDetectorRef, useValue: { markForCheck() {} } },
      { provide: ActivatedRoute, useValue: route },
      { provide: Router, useValue: router },
      ...(http ? [{ provide: HttpClient, useValue: http }] : []),
    ],
  });
  const workflow = TestBed.inject(TransactionsEditorWorkflow);
  return { workflow, finance, toast };
}

function home() {
  return {
    in_progress: [{ id: 2, title: 'Now' }],
    upcoming: [{ id: 3, title: 'Soon' }],
    past: Array.from({ length: RECENT_PAST_TRIP_LIMIT + 1 }, (_, index) => ({ id: 10 + index, title: `Past ${index}` })),
  };
}

describe('TransactionsEditorWorkflow', () => {
  it('saves the chosen manual date and defaults an unselected date to browser today', () => {
    const { workflow, finance } = editor();
    for (const date of ['2026-12-31', todayIsoDate()]) {
      workflow.openAddModal(date === '2026-12-31' ? date : null);
      expect(workflow.newTx.date).toBe(date);
      workflow.newTx.category = 'Food';
      workflow.newTx.amount = 12;
      workflow.saveTransaction();
      expect(finance.addTransaction.calls.mostRecent().args[0].date).toBe(date);
    }
  });


  it('adds, clears, and reopens a trip tag, and saves without one when the trip list fails', () => {
    const http = { get: jasmine.createSpy('get').and.returnValue(of(home())) };
    const { workflow, finance } = editor(http);
    workflow.openAddModal(null);
    expect(http.get).toHaveBeenCalledWith('/travel/api/home', jasmine.any(Object));
    expect(workflow.tripChoices.map(choice => choice.label)).toEqual([
      'No trip', 'Now', 'Soon',
      ...Array.from({ length: RECENT_PAST_TRIP_LIMIT }, (_, index) => `Past ${index}`),
    ]);
    workflow.newTx.category = 'Food';
    workflow.newTx.amount = 12;
    workflow.newTx.trip_id = 2;
    workflow.saveTransaction();
    expect(finance.addTransaction.calls.mostRecent().args[0].trip_id).toBe(2);

    const older = 10 + RECENT_PAST_TRIP_LIMIT;
    workflow.openTransactionEditor({
      id: 4, amount: 12, date: '2026-01-02', type: 'expense', category: 'Food',
      description: 'Lunch', kind: 'purchase', trip_id: older,
    } as never);
    expect(workflow.tripChoices.at(-1)?.label).toBe('Earlier trip');
    expect(workflow.newTx.trip_id).toBe(older);
    workflow.newTx.trip_id = null;
    workflow.saveTransaction();
    expect(finance.updateTransaction.calls.mostRecent().args[1].trip_id).toBeNull();

    http.get.and.returnValue(throwError(() => new Error('offline')));
    workflow.openAddModal(null);
    expect(workflow.tripListNote).toContain('save without a trip tag');
    workflow.newTx.category = 'Food';
    workflow.newTx.amount = 8;
    workflow.saveTransaction();
    expect(finance.addTransaction.calls.mostRecent().args[0].trip_id).toBeNull();

    workflow.openTransactionEditor({
      id: 5, amount: 8, date: '2026-01-03', type: 'expense', category: 'Food',
      description: '', kind: 'purchase', trip_id: 9,
    } as never);
    expect(workflow.tripListNote).toContain('save without a trip tag');
    expect(workflow.tripChoices.map(choice => choice.label)).toEqual(['No trip', 'Earlier trip']);
  });
});
