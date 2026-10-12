import { validateJobPayload } from './job-validation.js'

const supportedTypes = new Set([
  'file.process',
  'report.generate',
  'notification.send',
  'catalog.sync',
])

const supportedPriorities = new Set(['LOW', 'NORMAL', 'HIGH'])

export function validateWorkflowSteps(steps) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 20) {
    return 'Workflow steps must be an array containing 1 to 20 steps'
  }

  for (const [index, step] of steps.entries()) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      return 'Step ' + (index + 1) + ' must be an object'
    }
    if (typeof step.name !== 'string' || !step.name.trim() || step.name.length > 80) {
      return 'Step ' + (index + 1) + ' needs a name of 1 to 80 characters'
    }
    if (!supportedTypes.has(step.type)) {
      return 'Step ' + (index + 1) + ' uses an unsupported job type'
    }
    if (step.priority !== undefined && !supportedPriorities.has(step.priority)) {
      return 'Step ' + (index + 1) + ' has an unsupported priority'
    }

    const payloadError = validateJobPayload(step.type, step.payload ?? {})
    if (payloadError) {
      return 'Step ' + (index + 1) + ': ' + payloadError
    }
  }

  return null
}
