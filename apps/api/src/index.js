
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { z } from 'zod'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../.env',
  ),
})

const { prisma } = await import('@devmesh/database')

const app = express()
const port = Number(process.env.API_PORT ?? 4000)

const redis = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
  },
)

const queue = new Queue('devmesh-jobs', {
  connection: redis,
})

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  }),
)
app.use(express.json({ limit: '256kb' }))

// Health check: verify PostgreSQL and Redis.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redis.ping()

    return res.json({
      status: 'ok',
      service: 'devmesh-api',
      database: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[health]', error)

    return res.status(503).json({
      status: 'error',
      message: 'A required service is unavailable',
    })
  }
})


// Return metrics backed by PostgreSQL, BullMQ, and worker heartbeats.
async function getLiveWorkers() {
  const keys = []
  let cursor = '0'

  do {
    const [nextCursor, batch] = await redis.scan(
      cursor,
      'MATCH',
      'devmesh:workers:*',
      'COUNT',
      100,
    )
    cursor = nextCursor
    keys.push(...batch)
  } while (cursor !== '0')

  if (keys.length === 0) return []

  const values = await redis.mget(...keys)
  const now = Date.now()

  return values.flatMap(value => {
    if (!value) return []

    try {
      const worker = JSON.parse(value)
      const heartbeatTime = Date.parse(worker.lastHeartbeatAt)
      if (!Number.isFinite(heartbeatTime) || now - heartbeatTime > 45000) {
        return []
      }
      return [worker]
    } catch {
      return []
    }
  })
}

app.get('/api/v1/metrics', async (_req, res) => {
  res.set('Cache-Control', 'no-store')

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [
      totalJobs,
      statusGroups,
      recentCompleted,
      recentFailed,
      durationStats,
      queueCounts,
      workers,
    ] = await Promise.all([
      prisma.job.count(),
      prisma.job.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.job.count({
        where: { status: 'COMPLETED', completedAt: { gte: since } },
      }),
      prisma.job.count({
        where: { status: 'FAILED', completedAt: { gte: since } },
      }),
      prisma.jobAttempt.aggregate({
        where: { durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
      queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
      getLiveWorkers(),
    ])

    const statusCounts = Object.fromEntries(
      statusGroups.map(group => [group.status, group._count._all]),
    )
    const finishedRecent = recentCompleted + recentFailed

    return res.json({
      data: {
        generatedAt: new Date().toISOString(),
        totalJobs,
        statusCounts,
        successRate24h: finishedRecent
          ? Number(((recentCompleted / finishedRecent) * 100).toFixed(1))
          : null,
        averageDurationMs: durationStats._avg.durationMs == null
          ? null
          : Math.round(durationStats._avg.durationMs),
        completedLast24h: recentCompleted,
        failedLast24h: recentFailed,
        queue: queueCounts,
        workers: {
          active: workers.length,
          processing: workers.reduce((sum, worker) => sum + (Number(worker.activeJobs) || 0), 0),
          instances: workers,
        },
      },
    })
  } catch (error) {
    console.error('[metrics]', error)
    return res.status(500).json({
      error: { message: 'Unable to fetch system metrics' },
    })
  }
})

// List the latest jobs.
app.get('/api/v1/jobs', async (_req, res) => {
  // Prevent the browser from reusing a cached jobs response.
  res.set('Cache-Control', 'no-store')
  res.set('Pragma', 'no-cache')

  try {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return res.json({
      data: jobs,
      meta: {
        total: jobs.length,
        mode: 'database',
      },
    })
  } catch (error) {
    console.error('[jobs:list]', error)

    return res.status(500).json({
      error: { message: 'Unable to fetch jobs' },
    })
  }
})


// Get one job with its execution attempts and events.
app.get('/api/v1/jobs/:id', async (req, res) => {
  res.set('Cache-Control', 'no-store')

  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        attempts: {
          orderBy: { attempt: 'asc' },
        },
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!job) {
      return res.status(404).json({
        error: { message: 'Job not found' },
      })
    }

    return res.json({ data: job })
  } catch (error) {
    console.error('[jobs:detail]', error)

    return res.status(500).json({
      error: { message: 'Unable to fetch job details' },
    })
  }
})



const createJobSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum([
    'file.process',
    'report.generate',
    'notification.send',
    'catalog.sync',
  ]),
  projectId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
})

// Create a database job and submit it to BullMQ.
app.post('/api/v1/jobs', async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid job request',
        details: parsed.error.flatten(),
      },
    })
  }

  const {
    name,
    type,
    projectId,
    payload = {},
    priority = 'NORMAL',
  } = parsed.data

  let job

  try {
    job = await prisma.job.create({
      data: {
        name,
        type,
        projectId,
        payload,
        priority,
        status: 'QUEUED',
        events: {
          create: {
            eventType: 'QUEUED',
            message: 'Job created and queued',
          },
        },
      },
    })
  } catch (error) {
    console.error('[jobs:create:database]', error)

    return res.status(500).json({
      error: { message: 'Unable to create job in database' },
    })
  }

  try {
    await queue.add(
      type,
      { jobId: job.id },
      {
        jobId: job.id,
        attempts: job.maxAttempts,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    )

    return res.status(202).json({
      data: job,
      meta: { mode: 'database+redis' },
    })
  } catch (error) {
    console.error('[jobs:create:queue]', error)

    // The database job already exists. Record the queue failure.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Unable to enqueue job',
            completedAt: new Date(),
          },
        })

        await tx.jobEvent.create({
          data: {
            jobId: job.id,
            eventType: 'FAILED',
            message: 'Unable to enqueue job',
            metadata: {
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          },
        })
      })
    } catch (persistenceError) {
      console.error(
        '[jobs:create:queue-failure-persistence]',
        persistenceError,
      )
    }

    return res.status(503).json({
      error: {
        message: 'Job was created but could not be queued',
        jobId: job.id,
      },
    })
  }
})


app.patch('/api/v1/jobs/:id/input', async (req, res) => {
  const jobId = req.params.id
  const { text } = req.body ?? {}

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({
      error: { message: 'Input text must not be empty' },
    })
  }

  try {
    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
    })

    if (!existingJob) {
      return res.status(404).json({
        error: { message: 'Job not found' },
      })
    }

    if (existingJob.status !== 'FAILED') {
      return res.status(409).json({
        error: {
          message: 'Only failed jobs can have their input edited',
          currentStatus: existingJob.status,
        },
      })
    }

    const oldPayload =
      existingJob.payload &&
      typeof existingJob.payload === 'object' &&
      !Array.isArray(existingJob.payload)
        ? existingJob.payload
        : {}

    const updatedJob = await prisma.$transaction(async tx => {
      const updated = await tx.job.update({
        where: { id: jobId },
        data: {
          payload: { ...oldPayload, text },
        },
      })

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'INPUT_UPDATED',
          message: 'Job input updated before retry',
        },
      })

      return updated
    })

    return res.status(200).json({ data: updatedJob })
  } catch (error) {
    console.error('[jobs:input:update]', error)

    return res.status(500).json({
      error: { message: 'Unable to update job input' },
    })
  }
})



 // Manually retry a failed job.
app.post('/api/v1/jobs/:id/retry', async (req, res) => {
  const jobId = req.params.id

  try {
    const outcome = await prisma.$transaction(async tx => {
      // Lock this job row so retry requests are checked one at a time.
      const lockedRows = await tx.$queryRaw`
        SELECT "id"
        FROM "Job"
        WHERE "id" = ${jobId}
        FOR UPDATE
      `

      if (lockedRows.length === 0) {
        return { conflict: 'not-found' }
      }

      const existingJob = await tx.job.findUnique({
        where: { id: jobId },
      })

      if (!existingJob) {
        return { conflict: 'not-found' }
      }

      if (existingJob.status !== 'FAILED') {
        return { conflict: 'status', status: existingJob.status }
      }

      // Prevent another manual retry immediately after a retry request.
      const recentRetry = await tx.jobEvent.findFirst({
        where: {
          jobId,
          message: {
            startsWith: 'Job manually queued for retry generation',
          },
          createdAt: {
            gte: new Date(Date.now() - 10000),
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (recentRetry) {
        return { conflict: 'recent-retry' }
      }

      const claimed = await tx.job.updateMany({
        where: {
          id: jobId,
          status: 'FAILED',
        },
        data: {
          status: 'QUEUED',
          retryGeneration: { increment: 1 },
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          result: null,
        },
      })

      if (claimed.count !== 1) {
        return { conflict: 'status' }
      }

      const updatedJob = await tx.job.findUnique({
        where: { id: jobId },
      })

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'QUEUED',
          message: `Job manually queued for retry generation ${updatedJob.retryGeneration}`,
        },
      })

      return { job: updatedJob }
    })

    if (outcome.conflict === 'not-found') {
      return res.status(404).json({
        error: { message: 'Job not found' },
      })
    }

    if (outcome.conflict === 'recent-retry') {
      return res.status(409).json({
        error: {
          message: 'A retry was requested recently. Please wait before retrying again.',
        },
      })
    }

    if (outcome.conflict) {
      return res.status(409).json({
        error: {
          message: 'Only failed jobs can be retried',
          currentStatus: outcome.status,
        },
      })
    }

    const job = outcome.job

    try {
      await queue.add(
        job.type,
        {
          jobId: job.id,
          retryGeneration: job.retryGeneration,
        },
        {
          jobId: `${job.id}-manual-${job.retryGeneration}-${Date.now()}`,
          attempts: job.maxAttempts,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      )
    } catch (queueError) {
      console.error('[jobs:retry:queue]', queueError)

      await prisma.$transaction(async tx => {
        await tx.job.updateMany({
          where: {
            id: jobId,
            retryGeneration: job.retryGeneration,
            status: 'QUEUED',
          },
          data: {
            status: 'FAILED',
            errorMessage: 'Unable to enqueue job for retry',
            completedAt: new Date(),
          },
        })

        await tx.jobEvent.create({
          data: {
            jobId,
            eventType: 'FAILED',
            message: 'Unable to enqueue job for retry',
          },
        })
      })

      return res.status(503).json({
        error: { message: 'Unable to enqueue job for retry' },
      })
    }

    return res.status(202).json({
      data: job,
      meta: { mode: 'database+redis', action: 'manual-retry' },
    })
  } catch (error) {
    console.error('[jobs:retry]', error)

    return res.status(500).json({
      error: { message: 'Unable to retry job' },
    })
  }
})


const server = app.listen(port, () => {
  console.log(`DevMesh API listening on http://localhost:${port}`)
})

let shuttingDown = false

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true

  console.log('[api] shutting down')

  const closeServer = new Promise((resolve) => {
    server.close(resolve)
  })

  try {
    await closeServer
    await queue.close()
    await redis.quit()
    await prisma.$disconnect()

    console.log('[api] shutdown complete')
  } catch (error) {
    console.error('[api] shutdown error', error)
    process.exitCode = 1
  }
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
