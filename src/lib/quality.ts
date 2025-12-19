export interface QualityMetrics {
  sharpness: number
  contrast: number
  noise: number
  brightness: number
  quality: number
}

export function classify(quality: number, threshold: number) {
  if (quality < threshold - 8) return 'reject'
  if (quality < threshold + 4) return 'maybe'
  return 'keep'
}
