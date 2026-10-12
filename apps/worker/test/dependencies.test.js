import test from 'node:test'
import assert from 'node:assert/strict'
import { areDependenciesComplete } from '../src/dependencies.js'

test('treats an empty dependency list as ready', () => {
  assert.equal(areDependenciesComplete([]), true)
  assert.equal(areDependenciesComplete(), true)
})

test('allows a job only when every dependency is completed', () => {
  assert.equal(areDependenciesComplete([
    { dependencyJob: { id: 'a', status: 'COMPLETED' } },
    { dependencyJob: { id: 'b', status: 'COMPLETED' } },
  ]), true)

  for (const status of ['QUEUED', 'RUNNING', 'RETRYING', 'FAILED', 'CANCELLED']) {
    assert.equal(areDependenciesComplete([
      { dependencyJob: { id: 'a', status: 'COMPLETED' } },
      { dependencyJob: { id: 'b', status } },
    ]), false, `dependency with status ${status} must block execution`)
  }
})

test('fails closed when a dependency relation is missing', () => {
  assert.equal(areDependenciesComplete([{ dependencyJob: null }]), false)
  assert.equal(areDependenciesComplete([{}]), false)
})
