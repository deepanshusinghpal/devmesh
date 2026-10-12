import test from 'node:test'
import assert from 'node:assert/strict'
import { validateJobPayload } from '../src/job-validation.js'

test('accepts a valid file processing payload and omitted optional text', () => {
  assert.equal(validateJobPayload('file.process', { text: 'hello' }), null)
  assert.equal(validateJobPayload('file.process', {}), null)
})

test('rejects invalid or oversized file text', () => {
  assert.match(validateJobPayload('file.process', { text: 10 }), /must be a string/)
  assert.match(validateJobPayload('file.process', { text: '  ' }), /must not be empty/)
  assert.match(validateJobPayload('file.process', { text: 'x'.repeat(100001) }), /100000 characters/)
})

test('validates report records and size', () => {
  assert.equal(validateJobPayload('report.generate', { records: [{ score: 1 }] }), null)
  assert.match(validateJobPayload('report.generate', {}), /records must be an array/)
  assert.match(validateJobPayload('report.generate', { records: [null] }), /contain objects/)
  assert.match(validateJobPayload('report.generate', { records: Array(10001).fill({}) }), /at most 10000/)
})

test('validates catalog products and size', () => {
  assert.equal(validateJobPayload('catalog.sync', { products: [{ sku: 'A' }] }), null)
  assert.match(validateJobPayload('catalog.sync', { products: {} }), /products must be an array/)
  assert.match(validateJobPayload('catalog.sync', { products: [[]] }), /contain objects/)
  assert.match(validateJobPayload('catalog.sync', { products: Array(10001).fill({}) }), /at most 10000/)
})

test('validates notification field types, empty values, and length limits', () => {
  assert.equal(validateJobPayload('notification.send', { to: 'demo@example.com', message: 'hello' }), null)
  assert.equal(validateJobPayload('notification.send', {}), null)
  assert.match(validateJobPayload('notification.send', { to: 42 }), /to must be a string/)
  assert.match(validateJobPayload('notification.send', { to: '   ' }), /to must not be empty/)
  assert.match(validateJobPayload('notification.send', { to: 'x'.repeat(321) }), /320 characters/)
  assert.match(validateJobPayload('notification.send', { message: 42 }), /message must be a string/)
  assert.match(validateJobPayload('notification.send', { message: '   ' }), /message must not be empty/)
  assert.match(validateJobPayload('notification.send', { message: 'x'.repeat(10001) }), /10000 characters/)
})

test('rejects non-object payloads and unsupported job types', () => {
  assert.match(validateJobPayload('report.generate', null), /JSON object/)
  assert.match(validateJobPayload('report.generate', []), /JSON object/)
  assert.match(validateJobPayload('unknown', {}), /Unsupported job type/)
})
