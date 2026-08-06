// CSV export that opens correctly in Hebrew Excel.
//
// Excel needs a UTF-8 BOM to decode Hebrew, and RFC-4180 quoting so free text
// with commas/newlines/quotes survives. No dependency needed for that.

const cell = (v: unknown): string => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

/** Trigger a browser download of the rows as a BOM-prefixed CSV. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const blob = new Blob(['﻿' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}
