import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../.env',
  ),
})

const { prisma } = await import('../src/index.js')

async function main() {
  const email = process.env.DEVMESH_SEED_EMAIL ?? 'devmesh-local@example.com'
  const displayName = 'DevMesh Local Owner'

  // This local-only account is not a login credential. DevMesh does not
  // implement authentication yet; the placeholder password is never used.
  const user = await prisma.user.upsert({
    where: { email },
    update: { displayName },
    create: {
      email,
      displayName,
      passwordHash: '!local-seed-account-no-login!',
    },
  })

  let project = await prisma.project.findFirst({
    where: { ownerId: user.id, name: 'DevMesh Local Project' },
  })

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'DevMesh Local Project',
        ownerId: user.id,
      },
    })
  }

  console.log('DevMesh local data is ready:')
  console.log(`  Project: ${project.name} (${project.id})`)
  console.log(`  Owner:   ${user.email}`)
}

try {
  await main()
} catch (error) {
  console.error('[db:seed] failed:', error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
