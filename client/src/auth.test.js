import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticate, hasDemoRole } from './auth.js';

test('doctor credentials authenticate only the doctor role', () => {
  const user = authenticate('doctor', 'doctor@visitweave.demo', 'Demo@123');
  assert.equal(user?.role, 'doctor');
  assert.equal(hasDemoRole(user, 'doctor'), true);
  assert.equal(hasDemoRole(user, 'patient'), false);
});

test('doctor credentials do not authenticate as a patient', () => {
  const user = authenticate('patient', 'doctor@visitweave.demo', 'Demo@123');
  assert.equal(user, null);
  assert.equal(hasDemoRole({ role: 'patient' }, 'patient'), true);
  assert.equal(hasDemoRole({ role: 'patient' }, 'doctor'), false);
});

test('wrong credentials and unknown roles are rejected', () => {
  assert.equal(authenticate('doctor', 'doctor@visitweave.demo', 'wrong'), null);
  assert.equal(authenticate('admin', 'admin', 'admin'), null);
});