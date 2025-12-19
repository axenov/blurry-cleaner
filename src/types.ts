import type { QualityMetrics } from './lib/quality'
import type { ImageFile } from './global'

export type ImageRecord = ImageFile & {
  analysis?: QualityMetrics
  trashed?: boolean
  error?: string
}
