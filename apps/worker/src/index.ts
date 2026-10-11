import 'dotenv/config'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const worker = new Worker(
  'devmesh-jobs',
  async job => {
    console.log(`[worker] received job ${job.id} (${job.name})`)
    // Registered job handlers, durable state updates, timeouts, and structured events
    // will be added in the queue integration milestone.
    return { accepted: true, demo: true, input: job.data }
  },
  { connection, concurrency: 4 },
)

worker.on('ready', () => console.log('[worker] ready; queue=devmesh-jobs'))
worker.on('completed', job => console.log(`[worker] completed ${job.id}`))
worker.on('failed', (job, error) => console.error(`[worker] failed ${job?.id}:`, error.message))

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received; closing gracefully`)
  await worker.close()
  await connection.quit()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
