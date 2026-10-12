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
