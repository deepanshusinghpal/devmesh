const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function generateReport(payload = {}) {
  if (!isRecord(payload) || !Array.isArray(payload.records)) {
    throw new Error('payload.records must be an array')
  }

  const records = payload.records
  if (records.length > 10000) {
    throw new Error('Report generation supports at most 10000 records')
  }

  if (!records.every(isRecord)) {
    throw new Error('payload.records must contain objects')
  }

  const fields = [...new Set(records.flatMap(record => Object.keys(record)))]

  const fieldSummaries = fields.map(field => {
    const values = records
      .filter(record => Object.hasOwn(record, field) && record[field] != null)
      .map(record => record[field])
    const numericValues = values.filter(
      value => typeof value === 'number' && Number.isFinite(value),
    )
    const valueTypes = [...new Set(values.map(value => {
      if (Array.isArray(value)) return 'array'
      if (value === null) return 'null'
      return typeof value
    }))]

    return {
      field,
      presentCount: values.length,
      missingCount: records.length - values.length,
      valueTypes,
      distinctCount: new Set(values.map(value => JSON.stringify(value))).size,
      ...(numericValues.length
        ? {
            numeric: {
              count: numericValues.length,
              sum: numericValues.reduce((sum, value) => sum + value, 0),
              average: Number(
                (numericValues.reduce((sum, value) => sum + value, 0) /
                  numericValues.length).toFixed(4),
              ),
              min: Math.min(...numericValues),
              max: Math.max(...numericValues),
            },
          }
        : {}),
    }
  })

  return {
    type: 'report.generate',
    generatedAt: new Date().toISOString(),
    recordCount: records.length,
    fields,
    fieldSummaries,
    summary: {
      recordsProcessed: records.length,
      uniqueFields: fields.length,
      emptyRecords: records.filter(record => Object.keys(record).length === 0).length,
    },
    sample: records.slice(0, 5),
  }
}
