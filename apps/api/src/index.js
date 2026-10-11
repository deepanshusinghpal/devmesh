

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

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const queue = new Queue('devmesh-jobs', { connection: redis })

app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '256kb' }))

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await redis.ping()

    res.json({
      status: 'ok',
      service: 'devmesh-api',
      database: 'connected',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[health]', error.message)
    res.status(503).json({
      status: 'error',
      message: 'A required service is unavailable',
    })
  }
})

app.get('/api/v1/jobs', async (_req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    res.json({
      data: jobs,
      meta: { total: jobs.length, mode: 'database' },
    })
  } catch (error) {
    console.error('[jobs:list]', error.message)
    res.status(500).json({ error: { message: 'Unable to fetch jobs' } })
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

  const { name, type, projectId, payload = {}, priority = 'NORMAL' } = parsed.data

  try {
    const job = await prisma.job.create({
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

    try {
      await queue.add(type, { jobId: job.id }, { jobId: job.id })
    } catch (queueError) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Unable to enqueue job',
        },
      })
      throw queueError
    }

    return res.status(202).json({
      data: job,
      meta: { mode: 'database+redis' },
    })
  } catch (error) {
    console.error('[jobs:create]', error.message)
    return res.status(500).json({
      error: { message: 'Unable to create or queue job' },
    })
  }
})

const server = app.listen(port, () => {
  console.log(`DevMesh API listening on http://localhost:${port}`)
})

async function shutdown() {
  server.close()
  await queue.close()
  await redis.quit()
  await prisma.$disconnect()
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
