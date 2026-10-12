
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Worker } from 'bullmq'
import { generateReport } from './report.js'
import IORedis from 'ioredis'

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../.env',
  ),
})

const { prisma } = await import('@devmesh/database')

const QUEUE_NAME = 'devmesh-jobs'

const workerInstanceId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`
const workerHeartbeatKey = `devmesh:workers:${workerInstanceId}`
const activeQueueJobs = new Set()
let heartbeatInterval

async function publishWorkerHeartbeat() {
  try {
    await connection.set(
      workerHeartbeatKey,
      JSON.stringify({
        id: workerInstanceId,
        pid: process.pid,
        status: 'ready',
        activeJobs: activeQueueJobs.size,
        lastHeartbeatAt: new Date().toISOString(),
      }),
      'EX',
      45,
    )
  } catch (error) {
    console.error('[worker] heartbeat update failed:', error.message)
  }
}

const connection = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null },
)

function getPayload(payload) {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return {}
  }

  return payload
}

async function processJob(job) {
  const payload = getPayload(job.payload)

  switch (job.type) {
    case 'file.process': {
      const text =
        typeof payload.text === 'string'
          ? payload.text
          : job.name

      if (!text.trim()) {
        throw new Error('File processing requires non-empty text')
      }

      const normalizedText = text.replace(/\r\n/g, '\n')
      const trimmedText = normalizedText.trim()

      return {
        type: 'file.process',
        inputType:
          typeof payload.text === 'string'
            ? 'payload.text'
            : 'job.name',
        characterCount: text.length,
        wordCount: trimmedText
          ? trimmedText.split(/\s+/).length
          : 0,
        lineCount: normalizedText.split('\n').length,
        preview: text.slice(0, 200),
        processedAt: new Date().toISOString(),
      }
    }

    case 'report.generate': {
      return generateReport(payload)
    }

    case 'catalog.sync': {
      const products = Array.isArray(payload.products)
        ? payload.products
        : []

      if (
        !products.every(
          product =>
            product !== null &&
            typeof product === 'object' &&
            !Array.isArray(product),
        )
      ) {
        throw new Error('payload.products must contain objects')
      }

      return {
        type: 'catalog.sync',
        syncedAt: new Date().toISOString(),
        productCount: products.length,
        products: products.map((product, index) => ({
          ...product,
          syncIndex: index + 1,
        })),
        summary: {
          productsProcessed: products.length,
          status: 'SUCCESS',
        },
      }
    }

    case 'notification.send': {
      const recipient =
        typeof payload.to === 'string' && payload.to.trim()
          ? payload.to.trim()
          : 'local-test@example.com'

      const message =
        typeof payload.message === 'string' && payload.message.trim()
          ? payload.message.trim()
          : job.name

      return {
        type: 'notification.send',
        deliveryMode: 'simulated',
        accepted: true,
        recipient,
        message,
        simulatedAt: new Date().toISOString(),
        note: 'Local simulation only; no notification was sent.',
      }
    }

    default:
      throw new Error(`Unsupported job type: ${job.type}`)
  }
}


const worker = new Worker(
  QUEUE_NAME,
  async queueJob => {
    const jobId = queueJob.data.jobId
    const startedAt = new Date()
    let job
    let attempt
    let retryGeneration

    try {
      job = await prisma.job.findUnique({
        where: { id: jobId },
      })

      if (!job) {
        throw new Error(`Job not found in database: ${jobId}`)
      }

      // Older queue executions must not affect a newer retry cycle.
      retryGeneration =
        queueJob.data.retryGeneration ?? job.retryGeneration

      if (retryGeneration !== job.retryGeneration) {
        console.log(
          `[worker] skipping stale queue job ${queueJob.id} for ${jobId}`,
        )
        return { skipped: true, reason: 'stale-retry-generation' }
      }

      const previousAttempts = await prisma.jobAttempt.count({
        where: { jobId },
      })

      attempt = previousAttempts + 1

      const started = await prisma.$transaction(async tx => {
        const claimed = await tx.job.updateMany({
          where: {
            id: jobId,
            retryGeneration,
            status: { in: ['QUEUED', 'RETRYING'] },
          },
          data: {
            status: 'RUNNING',
            startedAt,
            attemptCount: attempt,
            errorMessage: null,
          },
        })

        if (claimed.count !== 1) {
          return false
        }

        await tx.jobAttempt.create({
          data: {
            jobId,
            attempt,
            status: 'RUNNING',
            startedAt,
            workerId: `worker-${process.pid}`,
          },
        })

        await tx.jobEvent.create({
          data: {
            jobId,
            eventType: 'RUNNING',
            message: `Worker started attempt ${attempt}`,
            metadata: { retryGeneration },
          },
        })

        return true
      })

      if (!started) {
        console.log(
          `[worker] skipping job ${jobId}; status or retry generation changed`,
        )
        return { skipped: true, reason: 'job-not-claimable' }
      }

      console.log(
        `[worker] processing ${jobId}: ${job.name} (${job.type})`,
      )

      const result = await processJob(job)
      const finishedAt = new Date()
      const durationMs = Math.max(
        0,
        finishedAt.getTime() - startedAt.getTime(),
      )

      const completed = await prisma.$transaction(async tx => {
        const updated = await tx.job.updateMany({
          where: {
            id: jobId,
            retryGeneration,
            status: 'RUNNING',
          },
          data: {
            status: 'COMPLETED',
            result,
            completedAt: finishedAt,
            errorMessage: null,
          },
        })

        if (updated.count !== 1) {
          return false
        }

        await tx.jobAttempt.update({
          where: {
            jobId_attempt: { jobId, attempt },
          },
          data: {
            status: 'COMPLETED',
            finishedAt,
            durationMs,
          },
        })

        await tx.jobEvent.create({
          data: {
            jobId,
            eventType: 'COMPLETED',
            message: `${job.type} handler completed successfully`,
            metadata: { durationMs, retryGeneration },
          },
        })

        return true
      })

      if (!completed) {
        console.log(
          `[worker] completion ignored because ${jobId} changed retry generation or status`,
        )
        return { skipped: true, reason: 'job-state-changed' }
      }

      console.log(`[worker] completed ${jobId}: ${job.type}`)
      return result
    } catch (error) {
      const finishedAt = new Date()
      const durationMs = Math.max(
        0,
        finishedAt.getTime() - startedAt.getTime(),
      )
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      const maxAttempts = Math.max(
        1,
        Number(queueJob.opts.attempts ?? job?.maxAttempts ?? 1),
      )
      const willRetry = (queueJob.attemptsMade + 1) < maxAttempts

      console.error(
        `[worker] attempt ${queueJob.attemptsMade + 1}/${maxAttempts} failed for ${jobId}:`,
        errorMessage,
      )

      if (job && attempt != null && retryGeneration != null) {
        try {
          await prisma.$transaction(async tx => {
            // Only the current retry generation may update job state.
            const updated = await tx.job.updateMany({
              where: {
                id: jobId,
                retryGeneration,
                status: 'RUNNING',
              },
              data: {
                status: willRetry ? 'RETRYING' : 'FAILED',
                errorMessage,
                ...(willRetry ? {} : { completedAt: finishedAt }),
              },
            })

            if (updated.count !== 1) {
              console.log(
                `[worker] ignored stale failure for ${jobId}, generation ${retryGeneration}`,
              )
              return
            }

            await tx.jobAttempt.upsert({
              where: {
                jobId_attempt: { jobId, attempt },
              },
              create: {
                jobId,
                attempt,
                status: 'FAILED',
                startedAt,
                finishedAt,
                durationMs,
                workerId: `worker-${process.pid}`,
                errorMessage,
              },
              update: {
                status: 'FAILED',
                finishedAt,
                durationMs,
                errorMessage,
              },
            })

            await tx.jobEvent.create({
              data: {
                jobId,
                eventType: willRetry ? 'RETRYING' : 'FAILED',
                message: willRetry
                  ? `Attempt ${attempt} failed; retry expected`
                  : `Job failed after ${attempt} attempt(s)`,
                metadata: {
                  attempt,
                  maxAttempts,
                  durationMs,
                  errorMessage,
                  retryGeneration,
                },
              },
            })
          })
        } catch (persistenceError) {
          console.error(
            `[worker] could not save failure details for ${jobId}:`,
            persistenceError instanceof Error
              ? persistenceError.message
              : String(persistenceError),
          )
        }
      }

      // BullMQ must receive real processing errors to trigger automatic retries.
      throw error
    }
  },
  {
    connection,
    concurrency: 4,
  },
)


worker.on('ready', () => {
  console.log(`[worker] ready; queue=${QUEUE_NAME}`)
  void publishWorkerHeartbeat()
  heartbeatInterval = setInterval(() => void publishWorkerHeartbeat(), 15000)
  heartbeatInterval.unref?.()
})

worker.on('active', job => {
  if (job?.id) activeQueueJobs.add(job.id)
  void publishWorkerHeartbeat()
})

worker.on('completed', job => {
  if (job?.id) activeQueueJobs.delete(job.id)
  void publishWorkerHeartbeat()
  console.log(`[worker] completed queue job ${job.id}`)
})

worker.on('failed', (job, error) => {
  if (job?.id) activeQueueJobs.delete(job.id)
  void publishWorkerHeartbeat()
  console.error(
    `[worker] failed queue job ${job?.id}:`,
    error.message,
  )
})

worker.on('error', error => {
  console.error('[worker] infrastructure error:', error.message)
})

let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`[worker] ${signal} received; closing gracefully`)

  try {
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    await connection.del(workerHeartbeatKey)
    await worker.close()
    await connection.quit()
    await prisma.$disconnect()
  } catch (error) {
    console.error('[worker] shutdown error:', error)
    process.exitCode = 1
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
