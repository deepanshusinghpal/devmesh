
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

async function processJob(job) {
  const payload =
    job.payload && typeof job.payload === 'object'
      ? job.payload
      : {}

  switch (job.type) {
    case 'file.process': {
      const text =
        typeof payload.text === 'string'
          ? payload.text
          : job.name

      if (!text.trim()) {
        throw new Error(
          'File processing requires non-empty text in payload.text',
        )
      }

      const normalizedText = text.replace(/\r\n/g, '\n')
      const trimmedText = normalizedText.trim()

      return {
        type: 'file.process',
        inputType: typeof payload.text === 'string' ? 'payload.text' : 'job.name',
        characterCount: text.length,
        wordCount: trimmedText
          ? trimmedText.split(/\s+/).length
          : 0,
        lineCount: normalizedText.split('\n').length,
        preview: text.slice(0, 200),
        processedAt: new Date().toISOString(),
      }
    }

    default:
      return {
        type: job.type,
        accepted: true,
        message: 'Business handler is not implemented yet.',
      }
  }
}

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
      const result = await processJob(job)

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
