import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { z } from 'zod'

const app = express()
const port = Number(process.env.API_PORT ?? 4000)

app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '256kb' }))

const demoJobs = [
  { id: 'job_8f31a2', name: 'Process customer exports', type: 'file.process', status: 'running', priority: 'high', submittedAt: new Date().toISOString() },
  { id: 'job_7c90bd', name: 'Generate weekly report', type: 'report.generate', status: 'queued', priority: 'normal', submittedAt: new Date().toISOString() },
]

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'devmesh-api', timestamp: new Date().toISOString() })
})

app.get('/api/v1/jobs', (_req, res) => {
  res.json({ data: demoJobs, meta: { total: demoJobs.length, mode: 'demo' } })
})

const createJobSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['file.process', 'report.generate', 'notification.send', 'catalog.sync']),
  payload: z.record(z.string(), z.unknown()).optional(),
})

app.post('/api/v1/jobs', (req, res) => {
  const parsed = createJobSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid job request', details: parsed.error.flatten() } })
  }

  // Demo-only response. Durable database persistence and BullMQ enqueueing are next milestones.
  const job = {
    id: `job_${Math.random().toString(16).slice(2, 8)}`,
    ...parsed.data,
    status: 'queued',
    priority: 'normal',
    submittedAt: new Date().toISOString(),
  }
  return res.status(202).json({ data: job, meta: { mode: 'demo' } })
})

app.listen(port, () => {
  console.log(`DevMesh API listening on http://localhost:${port}`)
})
