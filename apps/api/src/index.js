
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { z } from 'zod'
import { validateJobPayload } from './job-validation.js'
import { validateWorkflowSteps } from './workflow-validation.js'
import { createRateLimiter, securityHeaders } from './security.js'
import { createAuthMiddleware, createAccessToken, hashPassword, verifyPassword } from './auth.js'
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
const authTokenSecret = process.env.AUTH_TOKEN_SECRET ?? ''

if (Buffer.byteLength(authTokenSecret, 'utf8') < 32) {
  throw new Error('AUTH_TOKEN_SECRET must be configured with at least 32 bytes')
}

const authMiddleware = createAuthMiddleware(authTokenSecret)

const redis = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
  },
)

const queue = new Queue('devmesh-jobs', {
  connection: redis,
})

app.disable('x-powered-by')
app.use(securityHeaders)
app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  }),
)
// The dashboard polls several endpoints, so this limit allows normal use while
// placing a ceiling on accidental loops and basic request floods.
app.use('/api/v1', createRateLimiter())
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



// Authentication routes are public; all other /api/v1 routes require a bearer token.
const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(12).max(128),
})

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
})

app.use('/api/v1/auth', createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20 }))

app.post('/api/v1/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Provide a valid email, display name, and password of 12–128 characters',
      },
    })
  }

  const email = parsed.data.email.toLowerCase()
  try {
    const passwordHash = await hashPassword(parsed.data.password)
    const user = await prisma.user.create({
      data: {
        email,
        displayName: parsed.data.displayName,
        passwordHash,
        projects: { create: { name: 'My First Project' } },
      },
      select: { id: true, email: true, displayName: true, createdAt: true },
    })

    const token = createAccessToken(user, authTokenSecret)
    return res.status(201).json({ data: { user, token } })
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists' },
      })
    }

    console.error('[auth:register]', error)
    return res.status(500).json({
      error: { message: 'Unable to create account' },
    })
  }
})

app.post('/api/v1/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide a valid email and password' },
    })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    })

    const passwordMatches = await verifyPassword(parsed.data.password, user?.passwordHash)
    if (!user || !passwordMatches) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' },
      })
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    }
    const token = createAccessToken(safeUser, authTokenSecret)
    return res.json({ data: { user: safeUser, token } })
  } catch (error) {
    console.error('[auth:login]', error)
    return res.status(500).json({
      error: { message: 'Unable to sign in' },
    })
  }
})

app.get('/api/v1/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { id: true, email: true, displayName: true, createdAt: true },
    })

    if (!user) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to access this resource' },
      })
    }

    return res.json({ data: user })
  } catch (error) {
    console.error('[auth:me]', error)
    return res.status(500).json({ error: { message: 'Unable to load account' } })
  }
})

app.use('/api/v1', authMiddleware)

// List workspace projects for the dashboard job creator.
app.get('/api/v1/projects', async (req, res) => {
  res.set('Cache-Control', 'no-store')

  try {
    const projects = await prisma.project.findMany({
      where: { ownerId: req.auth.userId },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    return res.json({ data: projects })
  } catch (error) {
    console.error('[projects:list]', error)
    return res.status(500).json({
      error: { message: 'Unable to fetch projects' },
    })
  }
})

const workflowStepSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['file.process', 'report.generate', 'notification.send', 'catalog.sync']),
  payload: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
})

const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  projectId: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1).max(20),
})

// List saved workflow templates for a project.
app.get('/api/v1/workflows', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const parsedProjectId = z.string().min(1).safeParse(req.query.projectId)

  if (!parsedProjectId.success) {
    return res.status(400).json({
      error: { message: 'projectId query parameter is required' },
    })
  }

  try {
    const workflows = await prisma.workflow.findMany({
      where: {
        projectId: parsedProjectId.data,
        project: { is: { ownerId: req.auth.userId } },
      },
      orderBy: { updatedAt: 'desc' },
    })
    return res.json({ data: workflows })
  } catch (error) {
    console.error('[workflows:list]', error)
    return res.status(500).json({
      error: { message: 'Unable to fetch workflow templates' },
    })
  }
})

// Save a reusable sequence of dependent jobs.
app.post('/api/v1/workflows', async (req, res) => {
  const parsed = createWorkflowSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid workflow template',
        details: parsed.error.flatten(),
      },
    })
  }

  const payloadError = validateWorkflowSteps(parsed.data.steps.map(step => ({
    ...step,
    payload: step.payload ?? {},
    priority: step.priority ?? 'NORMAL',
  })))

  if (payloadError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: payloadError },
    })
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, ownerId: req.auth.userId },
      select: { id: true },
    })

    if (!project) {
      return res.status(404).json({
        error: { message: 'Project not found' },
      })
    }

    const steps = parsed.data.steps.map(step => ({
      name: step.name.trim(),
      type: step.type,
      payload: step.payload ?? {},
      priority: step.priority ?? 'NORMAL',
    }))

    const workflow = await prisma.workflow.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        projectId: project.id,
        steps,
      },
    })

    return res.status(201).json({ data: workflow })
  } catch (error) {
    console.error('[workflows:create]', error)
    return res.status(500).json({
      error: { message: 'Unable to save workflow template' },
    })
  }
})

// Execute a saved workflow as a linear chain of dependent jobs.
app.post('/api/v1/workflows/:id/run', async (req, res) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        project: { is: { ownerId: req.auth.userId } },
      },
    })

    if (!workflow) {
      return res.status(404).json({
        error: { message: 'Workflow template not found' },
      })
    }

    if (!workflow.projectId) {
      return res.status(409).json({
        error: { message: 'This legacy workflow has no project; save a new template' },
      })
    }

    const payloadError = validateWorkflowSteps(workflow.steps)
    if (payloadError) {
      return res.status(409).json({
        error: { message: 'Workflow template is invalid', details: payloadError },
      })
    }

    const steps = workflow.steps
    const jobs = await prisma.$transaction(async tx => {
      const createdJobs = []
      let previousJobId = null

      for (const [index, step] of steps.entries()) {
        const job = await tx.job.create({
          data: {
            name: (workflow.name + ': ' + step.name).slice(0, 100),
            type: step.type,
            projectId: workflow.projectId,
            payload: step.payload ?? {},
            priority: step.priority ?? 'NORMAL',
            status: 'QUEUED',
            ...(previousJobId
              ? {
                  dependencies: {
                    create: {
                      dependencyJob: { connect: { id: previousJobId } },
                    },
                  },
                }
              : {}),
            events: {
              create: {
                eventType: 'QUEUED',
                message: 'Workflow step ' + (index + 1) + '/' + steps.length + ' created',
                metadata: { workflowId: workflow.id, stepIndex: index },
              },
            },
          },
        })

        createdJobs.push(job)
        previousJobId = job.id
      }

      return createdJobs
    })

    const firstJob = jobs[0]
    try {
      await queue.add(
        firstJob.type,
        { jobId: firstJob.id },
        {
          jobId: firstJob.id,
          attempts: firstJob.maxAttempts,
          backoff: { type: 'exponential', delay: 1000 },
        },
      )
    } catch (queueError) {
      console.error('[workflows:run:queue]', queueError)
      const failureRecorded = await prisma.$transaction(async tx => {
        // A queue error can be an acknowledgement timeout even if a worker
        // has already claimed the job. Never overwrite a later job state.
        const failed = await tx.job.updateMany({
          where: { id: firstJob.id, status: 'QUEUED' },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: 'Unable to enqueue workflow',
          },
        })

        if (failed.count !== 1) return false

        await tx.jobEvent.create({
          data: {
            jobId: firstJob.id,
            eventType: 'FAILED',
            message: 'Unable to enqueue workflow',
          },
        })

        for (const blockedJob of jobs.slice(1)) {
          const cancelled = await tx.job.updateMany({
            where: { id: blockedJob.id, status: 'QUEUED' },
            data: {
              status: 'CANCELLED',
              completedAt: new Date(),
              errorMessage: 'Dependency ' + firstJob.id + ' failed',
            },
          })

          if (cancelled.count === 1) {
            await tx.jobEvent.create({
              data: {
                jobId: blockedJob.id,
                eventType: 'CANCELLED',
                message: 'Workflow was not started because its first job could not be queued',
              },
            })
          }
        }

        return true
      })

      if (!failureRecorded) {
        const latestJobs = await prisma.job.findMany({
          where: { id: { in: jobs.map(job => job.id) } },
          orderBy: { createdAt: 'asc' },
        })

        return res.status(202).json({
          data: {
            workflowId: workflow.id,
            jobs: latestJobs.map((job, index) => ({
              id: job.id,
              name: job.name,
              type: job.type,
              status: job.status,
              step: index + 1,
            })),
          },
          meta: {
            mode: 'database+redis',
            queueSubmissionUncertain: true,
          },
        })
      }

      return res.status(503).json({
        error: { message: 'Workflow was saved but could not be queued' },
      })
    }

    return res.status(202).json({
      data: {
        workflowId: workflow.id,
        jobs: jobs.map((job, index) => ({
          id: job.id,
          name: job.name,
          type: job.type,
          status: job.status,
          step: index + 1,
        })),
      },
      meta: { mode: 'database+redis', stepCount: jobs.length },
    })
  } catch (error) {
    console.error('[workflows:run]', error)
    return res.status(500).json({
      error: { message: 'Unable to run workflow' },
    })
  }
})

// Return recent execution events for the log viewer.
app.get('/api/v1/events', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const parsedLimit = z.coerce.number().int().min(1).max(100).safeParse(
    req.query.limit ?? 50,
  )

  if (!parsedLimit.success) {
    return res.status(400).json({
      error: { message: 'limit must be an integer between 1 and 100' },
    })
  }

  try {
    const events = await prisma.jobEvent.findMany({
      where: { job: { project: { is: { ownerId: req.auth.userId } } } },
      take: parsedLimit.data,
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          select: { id: true, name: true, type: true, status: true },
        },
      },
    })

    return res.json({ data: events })
  } catch (error) {
    console.error('[events:list]', error)
    return res.status(500).json({
      error: { message: 'Unable to fetch execution events' },
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
      prisma.job.count({
        where: { project: { is: { ownerId: req.auth.userId } } },
      }),
      prisma.job.groupBy({
        by: ['status'],
        where: { project: { is: { ownerId: req.auth.userId } } },
        _count: { _all: true },
      }),
      prisma.job.count({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: since },
          project: { is: { ownerId: req.auth.userId } },
        },
      }),
      prisma.job.count({
        where: {
          status: 'FAILED',
          completedAt: { gte: since },
          project: { is: { ownerId: req.auth.userId } },
        },
      }),
      prisma.jobAttempt.aggregate({
        where: {
          durationMs: { not: null },
          job: { project: { is: { ownerId: req.auth.userId } } },
        },
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
      where: { project: { is: { ownerId: req.auth.userId } } },
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
    const job = await prisma.job.findFirst({
      where: {
        id: req.params.id,
        project: { is: { ownerId: req.auth.userId } },
      },
      include: {
        attempts: {
          orderBy: { attempt: 'asc' },
        },
        events: {
          orderBy: { createdAt: 'asc' },
        },
        dependencies: {
          include: {
            dependencyJob: {
              select: { id: true, name: true, status: true },
            },
          },
        },
        dependents: {
          include: {
            dependentJob: {
              select: { id: true, name: true, status: true },
            },
          },
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
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  dependsOn: z.array(z.string().min(1)).max(20).optional().refine(ids => !ids || new Set(ids).size === ids.length, { message: 'dependsOn must not contain duplicate job IDs' }),
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

  const payload = parsed.data.payload ?? {}
  const payloadError = validateJobPayload(parsed.data.type, payload)

  if (payloadError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid job payload',
        details: payloadError,
      },
    })
  }

  const {
    name,
    type,
    projectId,
    priority = 'NORMAL',
    idempotencyKey,
    dependsOn = [],
  } = parsed.data

  let job

  try {
    const ownedProject = await prisma.project.findFirst({
      where: { id: projectId, ownerId: req.auth.userId },
      select: { id: true },
    })

    if (!ownedProject) {
      return res.status(404).json({
        error: { message: 'Project not found' },
      })
    }

    if (idempotencyKey) {
      const existingJob = await prisma.job.findUnique({
        where: {
          projectId_idempotencyKey: { projectId, idempotencyKey },
        },
      })

      if (existingJob) {
        return res.status(200).json({
          data: existingJob,
          meta: { mode: 'database+redis', idempotentReplay: true },
        })
      }
    }

    if (dependsOn.length) {
      const dependencyJobs = await prisma.job.findMany({
        where: { id: { in: dependsOn }, projectId },
        select: { id: true, status: true },
      })

      if (dependencyJobs.length !== dependsOn.length) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Every dependency must be an existing job in the same project',
          },
        })
      }

      const unavailableDependency = dependencyJobs.find(
        dependency => ['FAILED', 'CANCELLED'].includes(dependency.status),
      )

      if (unavailableDependency) {
        return res.status(409).json({
          error: {
            message: 'A job cannot depend on a failed or cancelled job',
            dependencyJobId: unavailableDependency.id,
            currentStatus: unavailableDependency.status,
          },
        })
      }
    }

    job = await prisma.job.create({
      data: {
        name,
        type,
        projectId,
        payload,
        priority,
        idempotencyKey,
        dependencies: {
          create: dependsOn.map(dependencyJobId => ({
            dependencyJob: { connect: { id: dependencyJobId } },
          })),
        },
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
    // Concurrent requests with the same key converge on the already-created job.
    if (idempotencyKey && error?.code === 'P2002') {
      const existingJob = await prisma.job.findUnique({
        where: {
          projectId_idempotencyKey: { projectId, idempotencyKey },
        },
      })

      if (existingJob) {
        return res.status(200).json({
          data: existingJob,
          meta: { mode: 'database+redis', idempotentReplay: true },
        })
      }
    }

    console.error('[jobs:create:database]', error)

    return res.status(500).json({
      error: { message: 'Unable to create job in database' },
    })
  }

  if (dependsOn.length) {
    // Recheck after the dependent row exists to close the race where a parent
    // completes between dependency validation and job creation.
    const dependencyJobs = await prisma.job.findMany({
      where: { id: { in: dependsOn }, projectId },
      select: { id: true, status: true },
    })
    const invalidDependency = dependencyJobs.find(
      dependency => ['FAILED', 'CANCELLED'].includes(dependency.status),
    )

    if (dependencyJobs.length !== dependsOn.length || invalidDependency) {
      const message = invalidDependency
        ? 'A dependency failed before this job could be scheduled'
        : 'A dependency no longer exists in this project'

      await prisma.$transaction(async tx => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'CANCELLED',
            completedAt: new Date(),
            errorMessage: message,
          },
        })
        await tx.jobEvent.create({
          data: {
            jobId: job.id,
            eventType: 'CANCELLED',
            message,
            metadata: invalidDependency ? { dependencyJobId: invalidDependency.id } : {},
          },
        })
      })

      return res.status(409).json({
        error: { message, jobId: job.id },
      })
    }

    const ready = dependencyJobs.every(
      dependency => dependency.status === 'COMPLETED',
    )

    if (!ready) {
      return res.status(202).json({
        data: job,
        meta: {
          mode: 'database+dependencies',
          waitingForDependencies: true,
        },
      })
    }
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
      meta: { mode: 'database+redis', waitingForDependencies: false },
    })
  } catch (error) {
    console.error('[jobs:create:queue]', error)

    // A queue acknowledgement can fail after a worker has already claimed
    // the job. Only mark it failed while it is still waiting to be queued.
    try {
      const failureRecorded = await prisma.$transaction(async tx => {
        const failed = await tx.job.updateMany({
          where: { id: job.id, status: 'QUEUED' },
          data: {
            status: 'FAILED',
            errorMessage: 'Unable to enqueue job',
            completedAt: new Date(),
          },
        })

        if (failed.count !== 1) return false

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

        return true
      })

      if (!failureRecorded) {
        const latestJob = await prisma.job.findUnique({ where: { id: job.id } })
        return res.status(202).json({
          data: latestJob ?? job,
          meta: {
            mode: 'database+redis',
            queueSubmissionUncertain: true,
          },
        })
      }
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
  const { payload: requestedPayload, text } = req.body ?? {}

  if (
    requestedPayload !== undefined &&
    (requestedPayload === null ||
      typeof requestedPayload !== 'object' ||
      Array.isArray(requestedPayload))
  ) {
    return res.status(400).json({
      error: { message: 'Input payload must be a JSON object' },
    })
  }

  if (
    requestedPayload === undefined &&
    (typeof text !== 'string' || !text.trim())
  ) {
    return res.status(400).json({
      error: { message: 'Input must be a JSON object or non-empty text' },
    })
  }

  try {
    const existingJob = await prisma.job.findFirst({
      where: {
        id: jobId,
        project: { is: { ownerId: req.auth.userId } },
      },
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
    const nextPayload = requestedPayload ?? { ...oldPayload, text }
    const payloadError = validateJobPayload(existingJob.type, nextPayload)

    if (payloadError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid job payload',
          details: payloadError,
        },
      })
    }

    const updatedJob = await prisma.$transaction(async tx => {
      const updated = await tx.job.update({
        where: { id: jobId },
        data: {
          payload: nextPayload,
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



// Cancel a job only while it is waiting to execute.
app.post('/api/v1/jobs/:id/cancel', async (req, res) => {
  const jobId = req.params.id

  try {
    const outcome = await prisma.$transaction(async tx => {
      const existingJob = await tx.job.findFirst({
        where: {
          id: jobId,
          project: { is: { ownerId: req.auth.userId } },
        },
      })

      if (!existingJob) return { conflict: 'not-found' }

      if (!['QUEUED', 'RETRYING'].includes(existingJob.status)) {
        return { conflict: 'status', status: existingJob.status }
      }

      const updated = await tx.job.updateMany({
        where: {
          id: jobId,
          status: { in: ['QUEUED', 'RETRYING'] },
        },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          errorMessage: null,
        },
      })

      if (updated.count !== 1) {
        return { conflict: 'status' }
      }

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: 'CANCELLED',
          message: 'Job cancelled before execution',
        },
      })

      return {
        job: await tx.job.findUnique({ where: { id: jobId } }),
      }
    })

    if (outcome.conflict === 'not-found') {
      return res.status(404).json({
        error: { message: 'Job not found' },
      })
    }

    if (outcome.conflict) {
      return res.status(409).json({
        error: {
          message: 'Only queued or retrying jobs can be cancelled',
          currentStatus: outcome.status,
        },
      })
    }

    // The database state is authoritative. Removing any waiting duplicate is
    // best-effort; a worker that races with cancellation will fail its claim.
    try {
      const waitingJobs = await queue.getJobs(['waiting', 'delayed', 'paused'])
      const matchingJobs = waitingJobs.filter(
        queuedJob => queuedJob.data?.jobId === jobId,
      )
      await Promise.allSettled(matchingJobs.map(queuedJob => queuedJob.remove()))
    } catch (queueError) {
      console.error('[jobs:cancel:queue-cleanup]', queueError)
    }

    return res.status(200).json({
      data: outcome.job,
      meta: { mode: 'database+redis', action: 'cancel' },
    })
  } catch (error) {
    console.error('[jobs:cancel]', error)
    return res.status(500).json({
      error: { message: 'Unable to cancel job' },
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

      const existingJob = await tx.job.findFirst({
        where: {
          id: jobId,
          project: { is: { ownerId: req.auth.userId } },
        },
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

      const pendingIds = [jobId]
      const visitedIds = new Set([jobId])

      while (pendingIds.length) {
        const dependencyJobId = pendingIds.shift()
        const links = await tx.jobDependency.findMany({
          where: { dependencyJobId },
          select: { dependentJobId: true },
        })

        for (const link of links) {
          const dependentJobId = link.dependentJobId
          if (visitedIds.has(dependentJobId)) continue
          visitedIds.add(dependentJobId)

          const dependentJob = await tx.job.findUnique({
            where: { id: dependentJobId },
          })

          if (
            dependentJob?.status === 'CANCELLED' &&
            dependentJob.errorMessage?.startsWith('Dependency ')
          ) {
            await tx.job.update({
              where: { id: dependentJobId },
              data: {
                status: 'QUEUED',
                errorMessage: null,
                completedAt: null,
              },
            })
            await tx.jobEvent.create({
              data: {
                jobId: dependentJobId,
                eventType: 'QUEUED',
                message: 'Job re-queued because its dependency is being retried',
              },
            })
            pendingIds.push(dependentJobId)
          }
        }
      }

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

      const failureRecorded = await prisma.$transaction(async tx => {
        // A queue error can be an acknowledgement timeout even if a worker
        // has already claimed the retry. Never overwrite a later job state.
        const failed = await tx.job.updateMany({
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

        if (failed.count !== 1) return false

        await tx.jobEvent.create({
          data: {
            jobId,
            eventType: 'FAILED',
            message: 'Unable to enqueue job for retry',
          },
        })

        return true
      })

      if (!failureRecorded) {
        const latestJob = await prisma.job.findUnique({
          where: { id: jobId },
        })

        return res.status(202).json({
          data: latestJob,
          meta: {
            mode: 'database+redis',
            action: 'manual-retry',
            queueSubmissionUncertain: true,
          },
        })
      }

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
