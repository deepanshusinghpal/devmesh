import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter, securityHeaders } from '../src/security.js'

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(values, value) {
      if (typeof values === 'string') this.headers[values] = value
      else Object.assign(this.headers, values)
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

test('rate limiter permits requests up to the configured limit', () => {
  const limit = createRateLimiter({ windowMs: 1000, maxRequests: 2, now: () => 100 })
  const req = { ip: '127.0.0.1' }
  const first = responseRecorder()
  const second = responseRecorder()
  let nextCalls = 0

  limit(req, first, () => { nextCalls += 1 })
  limit(req, second, () => { nextCalls += 1 })

  assert.equal(nextCalls, 2)
  assert.equal(first.headers['RateLimit-Remaining'], '1')
  assert.equal(second.headers['RateLimit-Remaining'], '0')
})

test('rate limiter blocks excess requests and reports a retry delay', () => {
  const limit = createRateLimiter({ windowMs: 5000, maxRequests: 1, now: () => 1000 })
  const req = { ip: '192.0.2.1' }
  limit(req, responseRecorder(), () => {})
  const response = responseRecorder()
  let nextCalled = false

  limit(req, response, () => { nextCalled = true })

  assert.equal(nextCalled, false)
  assert.equal(response.statusCode, 429)
  assert.equal(response.headers['Retry-After'], '5')
  assert.equal(response.body.error.code, 'RATE_LIMITED')
})

test('rate limiter resets after its window and separates client addresses', () => {
  let time = 0
  const limit = createRateLimiter({ windowMs: 100, maxRequests: 1, now: () => time })
  const firstReq = { ip: '198.51.100.1' }
  let nextCalls = 0

  limit(firstReq, responseRecorder(), () => { nextCalls += 1 })
  limit({ ip: '198.51.100.2' }, responseRecorder(), () => { nextCalls += 1 })
  limit(firstReq, responseRecorder(), () => { nextCalls += 1 })
  time = 100
  limit(firstReq, responseRecorder(), () => { nextCalls += 1 })

  assert.equal(nextCalls, 3)
})

test('security headers are applied to a response', () => {
  const response = responseRecorder()
  let nextCalls = 0

  securityHeaders({}, response, () => { nextCalls += 1 })

  assert.equal(nextCalls, 1)
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(response.headers['X-Frame-Options'], 'DENY')
  assert.equal(response.headers['Referrer-Policy'], 'no-referrer')
  assert.equal(response.headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()')
})
