import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createAccessToken,
  createAuthMiddleware,
  hashPassword,
  verifyAccessToken,
  verifyPassword,
} from '../src/auth.js'

const secret = 'test-only-secret-that-is-long-enough-for-hmac'

test('password hashes are salted and verify only the original password', async () => {
  const first = await hashPassword('correct horse battery staple')
  const second = await hashPassword('correct horse battery staple')

  assert.notEqual(first, second)
  assert.equal(await verifyPassword('correct horse battery staple', first), true)
  assert.equal(await verifyPassword('incorrect password', first), false)
  assert.equal(await verifyPassword('correct horse battery staple', 'invalid'), false)
})

test('password hashing rejects weak or oversized passwords', async () => {
  await assert.rejects(hashPassword('short'), /12 and 128/)
  await assert.rejects(hashPassword('x'.repeat(129)), /12 and 128/)
})

test('access tokens include an expiry and verify their identity', () => {
  const now = 1_800_000_000_000
  const token = createAccessToken({ id: 'user-1', email: 'owner@example.com' }, secret, now)

  assert.deepEqual(verifyAccessToken(token, secret, now), {
    userId: 'user-1',
    email: 'owner@example.com',
    expiresAt: Math.floor(now / 1000) + ACCESS_TOKEN_TTL_SECONDS,
  })
})

test('access tokens reject tampering, wrong secrets, malformed tokens, and expiry', () => {
  const now = 1_800_000_000_000
  const token = createAccessToken({ id: 'user-1', email: 'owner@example.com' }, secret, now)
  const [header, payload, signature] = token.split('.')
  const payloadValue = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  payloadValue.sub = 'user-2'
  const changedPayload = Buffer.from(JSON.stringify(payloadValue)).toString('base64url')

  assert.equal(verifyAccessToken(token, 'different-secret-that-is-also-long-enough', now), null)
  assert.equal(verifyAccessToken(`${header}.${changedPayload}.${signature}`, secret, now), null)
  assert.equal(verifyAccessToken('not-a-token', secret, now), null)
  assert.equal(verifyAccessToken(token, secret, now + ACCESS_TOKEN_TTL_SECONDS * 1000), null)
  assert.equal(verifyAccessToken(token, 'short', now), null)
})

test('auth middleware requires a valid bearer token', () => {
  const middleware = createAuthMiddleware(secret)
  const response = {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) { this.headers[name] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
  let nextCalled = false

  middleware({ get: () => undefined }, response, () => { nextCalled = true })
  assert.equal(response.statusCode, 401)
  assert.equal(response.body.error.code, 'UNAUTHENTICATED')
  assert.equal(nextCalled, false)
})
