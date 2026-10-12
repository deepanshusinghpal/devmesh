import test from 'node:test'
import assert from 'node:assert/strict'
import { areDependenciesComplete } from '../src/dependencies.js'

test('a job with no dependencies is ready', () => {
  assert.equal(areDependenciesComplete([]), true)
  assert.equal(areDependenciesComplete(), true)
})

test('a job is ready only when every dependency completed', () => {
  assert.equal(
    areDependenciesComplete([
      { dependencyJob: { status: 'COMPLETED' } },
      { dependencyJob: { status: 'COMPLETED' } },
    ]),
    true,
  )

  for (const status of ['QUEUED', 'RUNNING', 'RETRYING', 'FAILED', 'CANCELLED']) {
    assert.equal(
      areDependenciesComplete([
        { dependencyJob: { status: 'COMPLETED' } },
        { dependencyJob: { status } },
      ]),
      false,
      `dependency with status ${status} must block execution`,
    )
  }
})

test('missing dependency records are not considered complete', () => {
  assert.equal(areDependenciesComplete([{ dependencyJob: null }]), false)
  assert.equal(areDependenciesComplete([{}]), false)
})
