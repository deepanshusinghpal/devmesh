import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const baseUrl = process.env.DEVMESH_API_URL ?? 'http://127.0.0.1:4000'
const suffix = randomUUID()
const password = 'integration-test-password-123'

async function request(path, { token, method = 'GET', body } = {}) {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = await response.json()
  return { status: response.status, payload }
}

function assertStatus(result, expected, label) {
  assert.equal(
    result.status,
    expected,
    `${label}: expected HTTP ${expected}, got ${result.status}: ${JSON.stringify(result.payload)}`,
  )
}

async function register(email, displayName) {
  const result = await request('/api/v1/auth/register', {
    method: 'POST',
    body: { email, displayName, password },
  })
  assertStatus(result, 201, 'register')
  assert.ok(result.payload.data.token)
  assert.equal(result.payload.data.user.email, email)
  return result.payload.data
}

const unauthenticatedProjects = await request('/api/v1/projects')
assertStatus(unauthenticatedProjects, 401, 'protected endpoint without a token')

const userA = await register(`owner-a-${suffix}@example.test`, 'Owner A')
const userB = await register(`owner-b-${suffix}@example.test`, 'Owner B')

const currentUser = await request('/api/v1/auth/me', { token: userA.token })
assertStatus(currentUser, 200, 'current account')
assert.equal(currentUser.payload.data.id, userA.user.id)

const wrongPassword = await request('/api/v1/auth/login', {
  method: 'POST',
  body: { email: userA.user.email, password: 'this-is-the-wrong-password' },
})
assertStatus(wrongPassword, 401, 'wrong password')

const duplicateEmail = await request('/api/v1/auth/register', {
  method: 'POST',
  body: { email: userA.user.email, displayName: 'Duplicate', password },
})
assertStatus(duplicateEmail, 409, 'duplicate account')

const projectsA = await request('/api/v1/projects', { token: userA.token })
const projectsB = await request('/api/v1/projects', { token: userB.token })
assertStatus(projectsA, 200, 'list owner A projects')
assertStatus(projectsB, 200, 'list owner B projects')
assert.equal(projectsA.payload.data.length, 1)
assert.equal(projectsB.payload.data.length, 1)

const projectA = projectsA.payload.data[0]
const projectB = projectsB.payload.data[0]
assert.notEqual(projectA.id, projectB.id)

const createJob = await request('/api/v1/jobs', {
  token: userA.token,
  method: 'POST',
  body: {
    name: 'Private integration job',
    type: 'file.process',
    projectId: projectA.id,
    payload: { text: 'private to owner A' },
  },
})
assertStatus(createJob, 202, 'create owner A job')
const jobA = createJob.payload.data

const jobsA = await request('/api/v1/jobs', { token: userA.token })
const jobsB = await request('/api/v1/jobs', { token: userB.token })
assertStatus(jobsA, 200, 'list owner A jobs')
assertStatus(jobsB, 200, 'list owner B jobs')
assert.ok(jobsA.payload.data.some(job => job.id === jobA.id))
assert.equal(jobsB.payload.data.some(job => job.id === jobA.id), false)

const privateJob = await request(`/api/v1/jobs/${jobA.id}`, { token: userB.token })
assertStatus(privateJob, 404, 'read another user job')

const crossProjectJob = await request('/api/v1/jobs', {
  token: userB.token,
  method: 'POST',
  body: {
    name: 'Cross-project attempt',
    type: 'file.process',
    projectId: projectA.id,
    payload: { text: 'should not be accepted' },
  },
})
assertStatus(crossProjectJob, 404, 'create a job in another user project')

const createWorkflow = await request('/api/v1/workflows', {
  token: userA.token,
  method: 'POST',
  body: {
    name: 'Private integration workflow',
    projectId: projectA.id,
    steps: [{
      name: 'Prepare input',
      type: 'file.process',
      payload: { text: 'workflow owned by A' },
    }],
  },
})
assertStatus(createWorkflow, 201, 'create owner A workflow')
const workflowA = createWorkflow.payload.data

const hiddenWorkflows = await request(
  `/api/v1/workflows?projectId=${encodeURIComponent(projectA.id)}`,
  { token: userB.token },
)
assertStatus(hiddenWorkflows, 200, 'list another user workflow')
assert.equal(hiddenWorkflows.payload.data.length, 0)

const runForeignWorkflow = await request(`/api/v1/workflows/${workflowA.id}/run`, {
  token: userB.token,
  method: 'POST',
})
assertStatus(runForeignWorkflow, 404, 'run another user workflow')

const eventsA = await request('/api/v1/events?limit=100', { token: userA.token })
const eventsB = await request('/api/v1/events?limit=100', { token: userB.token })
assertStatus(eventsA, 200, 'list owner A events')
assertStatus(eventsB, 200, 'list owner B events')
assert.ok(eventsA.payload.data.some(event => event.jobId === jobA.id))
assert.equal(eventsB.payload.data.some(event => event.jobId === jobA.id), false)

const metricsA = await request('/api/v1/metrics', { token: userA.token })
const metricsB = await request('/api/v1/metrics', { token: userB.token })
assertStatus(metricsA, 200, 'owner A metrics')
assertStatus(metricsB, 200, 'owner B metrics')
assert.equal(metricsA.payload.data.totalJobs, 1)
assert.equal(metricsB.payload.data.totalJobs, 0)

const foreignCancel = await request(`/api/v1/jobs/${jobA.id}/cancel`, {
  token: userB.token,
  method: 'POST',
})
assertStatus(foreignCancel, 404, 'cancel another user job')

const ownCancel = await request(`/api/v1/jobs/${jobA.id}/cancel`, {
  token: userA.token,
  method: 'POST',
})
assertStatus(ownCancel, 200, 'cancel own queued job')

console.log('API integration smoke tests passed: authentication, account isolation, job/workflow access, events, metrics, and cancellation.')
