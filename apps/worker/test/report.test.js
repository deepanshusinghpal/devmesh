import test from 'node:test'
import assert from 'node:assert/strict'
import { generateReport } from '../src/report.js'

test('generates field summaries and numeric statistics', () => {
  const report = generateReport({
    records: [
      { name: 'Ada', score: 10 },
      { name: 'Lin', score: 20 },
      { name: 'Grace', score: 30 },
    ],
  })

  assert.equal(report.type, 'report.generate')
  assert.equal(report.recordCount, 3)
  assert.deepEqual(report.fields, ['name', 'score'])
  assert.deepEqual(report.fieldSummaries.find(item => item.field === 'score').numeric, {
    count: 3,
    sum: 60,
    average: 20,
    min: 10,
    max: 30,
  })
  assert.equal(report.fieldSummaries.find(item => item.field === 'name').distinctCount, 3)
  assert.equal(report.summary.uniqueFields, 2)
})

test('counts missing values and ignores null values for type statistics', () => {
  const report = generateReport({
    records: [{ value: 1 }, { value: null }, {}],
  })
  const summary = report.fieldSummaries[0]

  assert.equal(summary.presentCount, 1)
  assert.equal(summary.missingCount, 2)
  assert.deepEqual(summary.valueTypes, ['number'])
})

test('returns an empty report for an explicitly empty records array', () => {
  const report = generateReport({ records: [] })
  assert.equal(report.recordCount, 0)
  assert.deepEqual(report.fields, [])
  assert.deepEqual(report.fieldSummaries, [])
})

test('rejects missing or non-array records', () => {
  assert.throws(() => generateReport({}), /payload\.records must be an array/)
  assert.throws(() => generateReport({ records: {} }), /payload\.records must be an array/)
})

test('rejects arrays containing non-object records', () => {
  assert.throws(() => generateReport({ records: [{ ok: true }, null] }), /must contain objects/)
  assert.throws(() => generateReport({ records: [[1, 2]] }), /must contain objects/)
})

test('rejects more than 10000 records', () => {
  assert.throws(
    () => generateReport({ records: Array.from({ length: 10001 }, () => ({})) }),
    /at most 10000 records/,
  )
})

test('limits the returned sample to five records', () => {
  const report = generateReport({
    records: Array.from({ length: 8 }, (_, index) => ({ index })),
  })
  assert.equal(report.sample.length, 5)
})
