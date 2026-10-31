import assert from 'node:assert/strict';
import test from 'node:test';
import { createReportPdf } from './reportPdf.js';

test('creates a downloadable PDF summary for a medical report', () => {
  const pdf = createReportPdf({
    testName: 'Complete Blood Count (CBC)',
    summary: 'Fictional test result.',
    releasedAt: '2026-11-01T04:00:00.000Z',
  }, { token: 'T-000', patientName: 'Demo Patient' });

  const output = pdf.output();
  assert.ok(output.startsWith('%PDF-'));
  assert.ok(output.includes('DEMO SAMPLE'));
  assert.ok(output.includes('NOT A REAL MEDICAL RECORD'));
  assert.ok(output.includes('Fictional test result.'));
});
