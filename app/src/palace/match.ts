const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

// Tolera tildes, mayúsculas y errores de tipeo menores.
export function isCorrectAnswer(answer: string, expected: string): boolean {
  const a = normalize(answer)
  const e = normalize(expected)
  if (!a) return false
  if (a === e) return true
  // En siglas cortas (ATP vs ADN) una letra cambia el concepto: se exige exactitud.
  const tolerance = e.length < 5 ? 0 : Math.max(1, Math.floor(e.length * 0.2))
  if (levenshtein(a, e) <= tolerance) return true
  return a.length >= e.length * 0.6 && e.includes(a)
}
