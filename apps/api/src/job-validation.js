const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function validateJobPayload(type, payload) {
  if (!isRecord(payload)) return 'payload must be a JSON object'

  switch (type) {
    case 'file.process':
      if (payload.text !== undefined && typeof payload.text !== 'string') {
        return 'payload.text must be a string'
      }
      if (typeof payload.text === 'string' && !payload.text.trim()) {
        return 'payload.text must not be empty'
      }
      if (typeof payload.text === 'string' && payload.text.length > 100000) {
        return 'payload.text must be 100000 characters or fewer'
      }
      return null

    case 'report.generate':
      if (!Array.isArray(payload.records)) {
        return 'payload.records must be an array'
      }
      if (payload.records.length > 10000) {
        return 'payload.records must contain at most 10000 records'
      }
      if (!payload.records.every(isRecord)) {
        return 'payload.records must contain objects'
      }
      return null

    case 'catalog.sync':
      if (!Array.isArray(payload.products)) {
        return 'payload.products must be an array'
      }
      if (payload.products.length > 10000) {
        return 'payload.products must contain at most 10000 products'
      }
      if (!payload.products.every(isRecord)) {
        return 'payload.products must contain objects'
      }
      return null

    case 'notification.send':
      if (payload.to !== undefined && typeof payload.to !== 'string') {
        return 'payload.to must be a string'
      }
      if (typeof payload.to === 'string' && payload.to.trim().length > 320) {
        return 'payload.to must be 320 characters or fewer'
      }
      if (payload.message !== undefined && typeof payload.message !== 'string') {
        return 'payload.message must be a string'
      }
      if (typeof payload.message === 'string' && payload.message.length > 10000) {
        return 'payload.message must be 10000 characters or fewer'
      }
      return null

    default:
      return 'Unsupported job type'
  }
}
