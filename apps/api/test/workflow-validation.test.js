import test from 'node:test'
import assert from 'node:assert/strict'
import { validateWorkflowSteps } from '../src/workflow-validation.js'

test('accepts a valid sequence of file and report steps', () => {
  assert.equal(validateWorkflowSteps([
    { name: 'Prepare text', type: 'file.process', payload: { text: 'hello' } },
    { name: 'Summarize records', type: 'report.generate', payload: { records: [{ score: 10 }] } },
  ]), null)
})

test('requires between one and twenty steps', () => {
  assert.match(validateWorkflowSteps([]), /1 to 20/)
  assert.match(validateWorkflowSteps(Array.from({ length: 21 }, (_, i) => ({
    name: 'Step ' + i,
    type: 'file.process',
    payload: {},
  }))), /1 to 20/)
})

test('rejects invalid step payloads and unsupported job types', () => {
  assert.match(validateWorkflowSteps([
    { name: 'Bad report', type: 'report.generate', payload: {} },
  ]), /records must be an array/)
  assert.match(validateWorkflowSteps([
    { name: 'Unknown', type: 'unknown', payload: {} },
  ]), /unsupported job type/)
})

test('requires a valid name for each step', () => {
  assert.match(validateWorkflowSteps([
    { name: ' ', type: 'file.process', payload: {} },
  ]), /needs a name/)
})


test('rejects malformed steps and payloads', () => {
  for (const step of [null, [], 'step']) {
    assert.match(validateWorkflowSteps([step]), /must be an object/)
  }

  assert.match(validateWorkflowSteps([
    { name: 'Invalid payload', type: 'file.process', payload: 'text' },
  ]), /payload must be a JSON object/)
})

test('enforces the step name length and supported priorities', () => {
  assert.equal(validateWorkflowSteps([
    { name: 'x'.repeat(80), type: 'file.process', priority: 'HIGH' },
  ]), null)

  assert.match(validateWorkflowSteps([
    { name: 'x'.repeat(81), type: 'file.process' },
  ]), /needs a name/)

  assert.match(validateWorkflowSteps([
    { name: 'Valid name', type: 'file.process', priority: 'URGENT' },
  ]), /unsupported priority/)
})

test('accepts the maximum supported workflow length', () => {
  const steps = Array.from({ length: 20 }, (_, index) => ({
    name: 'Step ' + (index + 1),
    type: 'file.process',
  }))

  assert.equal(validateWorkflowSteps(steps), null)
})
