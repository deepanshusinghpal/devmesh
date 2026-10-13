const DEFAULT_WINDOW_MS = 15 * 60 * 1000
const DEFAULT_MAX_REQUESTS = 600

export function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Resource-Policy': 'same-site',
  })
  next()
}

export function createRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  now = Date.now,
} = {}) {
  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new TypeError('windowMs must be a positive integer')
  }
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new TypeError('maxRequests must be a positive integer')
  }

  const clients = new Map()

  return function rateLimit(req, res, next) {
    const currentTime = now()
    const key = req.ip || req.socket?.remoteAddress || 'unknown'
    let client = clients.get(key)

    if (!client || currentTime - client.startedAt >= windowMs) {
      client = { startedAt: currentTime, count: 0 }
      clients.set(key, client)
    }

    // Keep a burst of unique client addresses from growing this map forever.
    if (clients.size > 10000) {
      for (const [clientKey, entry] of clients) {
        if (currentTime - entry.startedAt >= windowMs) clients.delete(clientKey)
      }
    }

    client.count += 1
    const remaining = Math.max(0, maxRequests - client.count)
    const resetSeconds = Math.max(1, Math.ceil((client.startedAt + windowMs - currentTime) / 1000))

    res.set({
      'RateLimit-Limit': String(maxRequests),
      'RateLimit-Remaining': String(remaining),
      'RateLimit-Reset': String(resetSeconds),
    })

    if (client.count > maxRequests) {
      res.set('Retry-After', String(resetSeconds))
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      })
    }

    return next()
  }
}
