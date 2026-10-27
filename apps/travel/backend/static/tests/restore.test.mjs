import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreBody } from '../../../frontend/src/restore-model.mjs';

test('Undo preserves captured transport data without replaying server identity', () => {
  const row = { id: 4, trip_id: 8, user_id: 9, created_at: 'server-owned', role: 'outbound', mode: 'train', depart_place: 'Tokyo', arrive_place: 'Kyoto', paid: false, cost: '0', status: 'planned', fa_ident: 'UAL837', fa_gate_origin: 'G4' };
  const body = restoreBody('transport', row);
  assert.equal(body.depart_place, 'Tokyo');
  assert.equal(body.arrive_place, 'Kyoto');
  assert.equal(body.mode, 'train');
  assert.equal(body.paid, false);
  assert.equal(body.cost, '0');
  assert.equal(body.fa_ident, 'UAL837');
  assert.equal(body.fa_gate_origin, 'G4');
  for (const key of ['id', 'trip_id', 'user_id', 'created_at']) assert.equal(Object.hasOwn(body, key), false);
  assert.equal(row.id, 4);
});

test('Undo retains nullable fields, coordinates and false flags across row kinds', () => {
  const stay = restoreBody('stay', { city: 'Kyoto', lat: 0, lng: 0, notes: null });
  assert.equal(stay.city, 'Kyoto');
  assert.equal(stay.lat, 0);
  assert.equal(stay.lng, 0);
  assert.equal(stay.notes, null);
  const parking = restoreBody('parking', { place_name: 'Lot', necessary: 'yes', booked: false, paid: false, arrangement: 'self_park' });
  assert.equal(parking.booked, false);
  assert.equal(parking.paid, false);
  assert.equal(parking.place_name, 'Lot');
  assert.equal(parking.necessary, 'yes');
  assert.equal(parking.arrangement, 'self_park');
  assert.equal(restoreBody('plan', { title: 'Walk', stay_id: 12 }).stay_id, 12);
  assert.deepEqual(restoreBody('note', { body: 'Remember', on_date: null }), { body: 'Remember', on_date: null });
  assert.equal(restoreBody('reminder', { title: 'Pack', done: false }).done, false);
  assert.equal(restoreBody('budget', { label: 'Free', amount: '0', paid: false }).amount, '0');
  assert.deepEqual(restoreBody('unknown', { id: 1 }), {});
});
