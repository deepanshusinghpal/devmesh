
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../.env',
  ),
})
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { prisma } from '@devmesh/database'

const connection = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null },
)

const worker = new Worker(
  'devmesh-jobs',
  async queueJob => {
    const jobId = queueJob.data.jobId
    const job = await prisma.job.findUnique({ where: { id: jobId } })

    if (!job) {
      throw new Error(`Job not found in database: ${jobId}`)
    }

    const attempt = queueJob.attemptsMade + 1
    const startedAt = new Date()

    await prisma.$transaction([
      prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          startedAt,
          attemptCount: attempt,
        },
      }),
      prisma.jobAttempt.create({
        data: {
          jobId,
          attempt,
          status: 'RUNNING',
          startedAt,
          workerId: `worker-${process.pid}`,
        },
      }),
      prisma.jobEvent.create({
        data: {
          jobId,
          eventType: 'RUNNING',
          message: `Worker started attempt ${attempt}`,
        },
      }),
    ])

    console.log(`[worker] processing ${jobId}: ${job.name}`)

    try {
      // Temporary handler: real business-task handlers come next.
      const result = {
        accepted: true,
        message: 'Worker execution verified; task handler is pending.',
        type: job.type,
      }

      const finishedAt = new Date()
      const durationMs = finishedAt.getTime() - startedAt.getTime()

      await prisma.$transaction([
        prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            result,
            completedAt: finishedAt,
            errorMessage: null,
          },
        }),
        prisma.jobAttempt.update({
          where: {
            jobId_attempt: { jobId, attempt },
          },
          data: {
            status: 'COMPLETED',
            finishedAt,
            durationMs,
          },
        }),
        prisma.jobEvent.create({
          data: {
            jobId,
            eventType: 'COMPLETED',
            message: 'Worker execution finished; business handler pending',
          },
        }),
      ])

      console.log(`[worker] completed ${jobId}`)
      return result
    } catch (error) {
      const finishedAt = new Date()

      await prisma.$transaction([
        prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
          },
        }),
        prisma.jobAttempt.update({
          where: {
            jobId_attempt: { jobId, attempt },
          },
          data: {
            status: 'FAILED',
            finishedAt,
            errorMessage: error.message,
          },
        }),
        prisma.jobEvent.create({
          data: {
            jobId,
            eventType: 'FAILED',
            message: 'Worker execution failed',
            metadata: { error: error.message },
          },
        }),
      ])

      throw error
    }
  },
  { connection, concurrency: 4 },
)

worker.on('ready', () => console.log('[worker] ready; queue=devmesh-jobs'))
worker.on('completed', job => console.log(`[worker] completed ${job.id}`))
worker.on('failed', (job, error) =>
  console.error(`[worker] failed ${job?.id}:`, error.message),
)

let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[worker] ${signal} received; closing gracefully`)

  await worker.close()
  await connection.quit()
  await prisma.$disconnect()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
