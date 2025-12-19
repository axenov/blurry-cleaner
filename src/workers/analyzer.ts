/// <reference lib="WebWorker" />

import type { QualityMetrics } from '../lib/quality'

export interface AnalyzeRequest {
  id: string
  fileUrl?: string
  buffer?: ArrayBuffer
}

export interface AnalyzeResponse {
  id: string
  metrics?: QualityMetrics
  error?: string
}

const ctx: Worker = self as any

ctx.onmessage = async (event: MessageEvent<AnalyzeRequest>) => {
  const { id, fileUrl, buffer } = event.data
  try {
    const metrics = await analyzeImage({ fileUrl, buffer })
    ctx.postMessage({ id, metrics } satisfies AnalyzeResponse)
  } catch (error) {
    ctx.postMessage({
      id,
      error: (error as Error).message ?? 'Failed to analyze image',
    } satisfies AnalyzeResponse)
  }
}

async function analyzeImage(input: { fileUrl?: string; buffer?: ArrayBuffer }): Promise<QualityMetrics> {
  let blob: Blob
  if (input.buffer) {
    blob = new Blob([input.buffer])
  } else if (input.fileUrl) {
    const response = await fetch(input.fileUrl)
    if (!response.ok) throw new Error(`fetch ${response.status}`)
    blob = await response.blob()
  } else {
    throw new Error('No data')
  }

  const bitmap = await createImageBitmap(blob)

  const maxSide = 640
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(32, Math.floor(bitmap.width * scale))
  const height = Math.max(32, Math.floor(bitmap.height * scale))

  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas unavailable in worker')
  context.drawImage(bitmap, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)

  const gray = new Float32Array(width * height)
  let sum = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    gray[p] = g
    sum += g
  }
  const mean = sum / gray.length

  // Contrast: standard deviation of grayscale.
  let variance = 0
  for (let i = 0; i < gray.length; i++) {
    const diff = gray[i] - mean
    variance += diff * diff
  }
  const contrastStd = Math.sqrt(variance / gray.length)

  // Laplacian variance for sharpness.
  let lapSum = 0
  let lapSqSum = 0
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0]
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let lap = 0
      let k = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++, k++) {
          const idx = (y + ky) * width + (x + kx)
          lap += gray[idx] * kernel[k]
        }
      }
      lapSum += lap
      lapSqSum += lap * lap
    }
  }
  const n = (width - 2) * (height - 2)
  const lapMean = lapSum / n
  const lapVariance = lapSqSum / n - lapMean * lapMean

  // Noise: deviation from 4-neighbour mean.
  let noiseAcc = 0
  let noiseCount = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const center = gray[idx]
      const meanNeighbour =
        (gray[idx - 1] + gray[idx + 1] + gray[idx - width] + gray[idx + width]) /
        4
      noiseAcc += Math.abs(center - meanNeighbour)
      noiseCount++
    }
  }
  const noiseLevel = noiseAcc / noiseCount

  // Normalize into 0-100 bands.
  const sharpnessScore = clamp(Math.log10(lapVariance + 1) * 18, 0, 100)
  const contrastScore = clamp((contrastStd / 80) * 100, 0, 100)
  const noiseScore = clamp((noiseLevel / 25) * 100, 0, 100)
  const brightnessScore = clamp((Math.abs(mean - 128) / 128) * 100, 0, 100)

  const quality = clamp(
    sharpnessScore * 0.65 + contrastScore * 0.25 - noiseScore * 0.2 - brightnessScore * 0.05 + 10,
    0,
    100
  )

  return {
    sharpness: sharpnessScore,
    contrast: contrastScore,
    noise: noiseScore,
    brightness: brightnessScore,
    quality,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export {}
