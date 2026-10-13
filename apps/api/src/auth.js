import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const PASSWORD_KEY_BYTES = 64
const PASSWORD_SALT_BYTES = 16
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
export const ACCESS_TOKEN_TTL_SECONDS = 8 * 60 * 60

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest()
}

function validSecret(secret) {
  return typeof secret === 'string' && Buffer.byteLength(secret, 'utf8') >= 32
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new TypeError('Password must be between 12 and 128 characters')
  }

  const salt = randomBytes(PASSWORD_SALT_BYTES)
  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS)
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derivedKey).toString('base64url')}`
}

export async function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') return false

  const [algorithm, saltText, keyText, extra] = passwordHash.split('$')
  if (algorithm !== 'scrypt' || !saltText || !keyText || extra !== undefined) return false

  try {
    const salt = Buffer.from(saltText, 'base64url')
    const expected = Buffer.from(keyText, 'base64url')
    if (salt.length !== PASSWORD_SALT_BYTES || expected.length !== PASSWORD_KEY_BYTES) return false

    const actual = Buffer.from(await scrypt(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS))
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function createAccessToken(user, secret, now = Date.now()) {
  if (!validSecret(secret)) throw new TypeError('AUTH_TOKEN_SECRET must contain at least 32 bytes')
  if (!user?.id || !user?.email) throw new TypeError('A user ID and email are required')

  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const issuedAt = Math.floor(now / 1000)
  const payload = encode({
    sub: user.id,
    email: user.email,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
  })
  const content = `${header}.${payload}`
  return `${content}.${sign(content, secret).toString('base64url')}`
}

export function verifyAccessToken(token, secret, now = Date.now()) {
  if (!validSecret(secret) || typeof token !== 'string' || token.length > 4096) return null

  const parts = token.split('.')
  if (parts.length !== 3 || parts.some(part => !part)) return null

  try {
    const [headerText, payloadText, signatureText] = parts
    const header = JSON.parse(Buffer.from(headerText, 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8'))
    const actualSignature = Buffer.from(signatureText, 'base64url')
    const expectedSignature = sign(`${headerText}.${payloadText}`, secret)

    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null
    if (actualSignature.length !== expectedSignature.length) return null
    if (!timingSafeEqual(actualSignature, expectedSignature)) return null
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    if (typeof payload.email !== 'string' || !payload.email) return null
    if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null
    if (!Number.isInteger(payload.iat) || payload.iat > Math.floor(now / 1000) + 60) return null

    return { userId: payload.sub, email: payload.email, expiresAt: payload.exp }
  } catch {
    return null
  }
}

export function createAuthMiddleware(secret) {
  return function requireAuth(req, res, next) {
    const authorization = req.get('authorization') ?? ''
    const match = /^Bearer ([^\s]+)$/.exec(authorization)
    const identity = match ? verifyAccessToken(match[1], secret) : null

    if (!identity) {
      res.set('WWW-Authenticate', 'Bearer realm="devmesh"')
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Sign in to access this resource',
        },
      })
    }

    req.auth = identity
    return next()
  }
}
