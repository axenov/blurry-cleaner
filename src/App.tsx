import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TrashResult } from './global'
import type { AnalyzeResponse } from './workers/analyzer'
import { classify } from './lib/quality'
import './App.css'
import { createDemoImages } from './mock/demo'
import { Lightbox } from './components/Lightbox'
import type { ImageRecord } from './types'

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const formatDate = (value: number) =>
  new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

function App() {
  console.log('App render start')
  const [directory, setDirectory] = useState<string | null>(null)
  const [images, setImages] = useState<ImageRecord[]>([])
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [threshold, setThreshold] = useState(42)
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const inFlightRef = useRef<Set<string>>(new Set())
  const workerRef = useRef<Worker | null>(null)
  const [hasNativeApi] = useState(() => Boolean(window.api))
  const [isLoadingDir, setIsLoadingDir] = useState(false)
  const [hideTrashed, setHideTrashed] = useState(true)

  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/analyzer.ts', import.meta.url), { type: 'module' })
    const handleMessage = (event: MessageEvent<AnalyzeResponse>) => {
      const { id, metrics, error } = event.data
      inFlightRef.current.delete(id)
      setImages((prev) => {
        const next = prev.map((img) =>
          img.id === id
            ? {
                ...img,
                analysis: metrics ?? img.analysis,
                error,
              }
            : img
        )
        const pending = next.some((item) => !item.analysis && !item.error)
        if (!pending && inFlightRef.current.size === 0) {
          setScanning(false)
        }
        return next
      })
    }
    workerRef.current.addEventListener('message', handleMessage)
    return () => {
      workerRef.current?.removeEventListener('message', handleMessage)
      workerRef.current?.terminate()
    }
  }, [])

  // Pump the queue in small batches to keep the UI responsive.
  useEffect(() => {
    if (!scanning) return
    const timer = setInterval(async () => {
      const worker = workerRef.current
      if (!worker) return
      const maxParallel = 4
      const openSlots = Math.max(0, maxParallel - inFlightRef.current.size)
      if (openSlots === 0) return
      const candidates = images.filter(
        (img) => !img.analysis && !img.error && !inFlightRef.current.has(img.id)
      )
      if (candidates.length === 0) {
        if (inFlightRef.current.size === 0) setScanning(false)
        return
      }
      for (const img of candidates.slice(0, openSlots)) {
        inFlightRef.current.add(img.id)
        if (window.api && window.api.readFileBuffer) {
          const result = await window.api.readFileBuffer(img.absolutePath)
          if (result?.ok && result.buffer) {
            worker.postMessage({ id: img.id, buffer: result.buffer }, [result.buffer])
            continue
          }
        }
        worker.postMessage({ id: img.id, fileUrl: img.fileUrl })
      }
    }, 140)
    return () => clearInterval(timer)
  }, [images, scanning])

  const handlePickDirectory = useCallback(async () => {
    if (!window.api) {
      setBanner('Native file access is unavailable. Use the demo set instead.')
      return
    }
    setIsLoadingDir(true)
    const dir = await window.api.chooseDirectory()
    if (!dir) {
      setIsLoadingDir(false)
      return
    }
    const files = (await window.api.listImages(dir)) ?? []
    setDirectory(dir)
    setImages(files)
    setSelection(new Set())
    setScanning(true)
    setIsLoadingDir(false)
  }, [])

  const loadDemo = useCallback(() => {
    const demoItems = createDemoImages()
    setDirectory('Demo Set')
    setImages(demoItems)
    setSelection(new Set())
    setScanning(true)
  }, [])

  const flagged = useMemo(
    () =>
      images.filter((img) => {
        if (hideTrashed && img.trashed) return false
        if (!img.analysis) return false
        return img.analysis.quality < threshold
      }),
    [images, threshold, hideTrashed]
  )

  const visibleImages = useMemo(() => {
    const base = hideTrashed ? images.filter((i) => !i.trashed) : images
    if (!showFlaggedOnly) return base
    return base.filter((img) => {
      if (!img.analysis) return false
      return img.analysis.quality < threshold
    })
  }, [images, showFlaggedOnly, threshold, hideTrashed])

  const progress = images.length === 0 ? 0 : Math.round((images.filter((i) => i.analysis).length / images.length) * 100)

  const toggleSelect = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectFlagged = () => {
    setSelection(new Set(flagged.map((f) => f.id)))
  }

  const clearSelection = () => setSelection(new Set())

  const trashIds = async (ids: string[]) => {
    if (ids.length === 0) return
    const targets = images.filter((img) => ids.includes(img.id) && !img.trashed)
    if (targets.length === 0) return
    let ok = true
    let message: string | undefined
    if (window.api?.trashFiles) {
      const result: TrashResult | undefined = await window.api.trashFiles(targets.map((t) => t.absolutePath))
      ok = Boolean(result?.ok)
      message = result?.message
    }
    if (!ok) {
      setBanner(message ?? 'Failed to move files to trash')
      return
    }
    setImages((prev) =>
      prev.map((img) =>
        ids.includes(img.id)
          ? {
              ...img,
              trashed: true,
            }
          : img
      )
    )
    setSelection((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
    setActiveId((current) => (current && ids.includes(current) ? null : current))
    setBanner(`Moved ${targets.length} file(s) to the system trash`)
  }

  const removeSelected = async () => {
    await trashIds([...selection])
  }

  const stats = useMemo(() => {
    const visible = hideTrashed ? images.filter((i) => !i.trashed) : images
    const analyzed = visible.filter((i) => i.analysis).length
    return { visibleCount: visible.length, analyzed }
  }, [images, hideTrashed])

  const hasImages = images.length > 0

  return (
    <div className="page">
      <div className="gradient" />
      <header className="topbar">
        <div className="mark">
          <div className="dot" />
          <div className="brand">
            <p className="eyebrow">Vision hygiene</p>
            <h1>Blurry Cleaner</h1>
          </div>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={loadDemo}>
            Use demo set
          </button>
          <button className="primary" onClick={handlePickDirectory} disabled={isLoadingDir}>
            {isLoadingDir ? 'Opening…' : 'Pick a folder'}
          </button>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Focus guard for your library</p>
          <h2>Find motion blur, smear, and noisy shots before they clutter your archive.</h2>
          <p className="lede">
            We downsample, score sharpness with Laplacian variance, factor contrast/noise, and let you bulk-move bad
            frames to the system trash safely.
          </p>
          {!hasNativeApi && (
            <p className="warning">Running in browser-only mode. Use the demo or Electron build for filesystem access.</p>
          )}
        </div>
        <div className="chips">
          <div className="chip">
            <span>Sharpness</span>
            <strong>Variance-of-Laplacian</strong>
          </div>
          <div className="chip">
            <span>Noise</span>
            <strong>Neighbour deviation</strong>
          </div>
          <div className="chip">
            <span>Safety</span>
            <strong>Moves to OS trash</strong>
          </div>
        </div>
      </section>

      {banner && (
        <div className="banner" role="status">
          {banner}
          <button onClick={() => setBanner(null)}>×</button>
        </div>
      )}

      <section className="controls">
        <div className="controls-top">
        <div className="stat">
          <p>Folder</p>
          <strong>{directory ?? 'No folder open'}</strong>
          <span className="micro">Recurses into subfolders</span>
        </div>
          <div className="stat">
            <p>Scan progress</p>
            <div className="progress">
              <div className="bar" style={{ width: `${progress}%` }} />
            </div>
            <span className="micro">
              {progress}% · {stats.analyzed}/{stats.visibleCount || '–'} analyzed (visible)
            </span>
          </div>
          <div className="stat inline">
            <p>Threshold</p>
            <div className="slider-row">
              <input
                type="range"
                min={10}
                max={80}
                step={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
              <span className="badge">{threshold}</span>
            </div>
          </div>
        </div>
        <div className="controls-actions">
          <label className="toggle">
            <input type="checkbox" checked={showFlaggedOnly} onChange={(e) => setShowFlaggedOnly(e.target.checked)} />
            <span>Flagged only</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={hideTrashed} onChange={(e) => setHideTrashed(e.target.checked)} />
            <span>Hide trashed</span>
          </label>
          <span className={`pill-count ${selection.size > 0 ? 'active' : ''}`}>Selected: {selection.size}</span>
          <button className="ghost" onClick={selectFlagged} disabled={flagged.length === 0}>
            Select flagged ({flagged.length})
          </button>
          <button className="ghost" onClick={clearSelection} disabled={selection.size === 0}>
            Clear selection
          </button>
          <button className="danger" disabled={selection.size === 0} onClick={removeSelected}>
            Move to trash
          </button>
        </div>
      </section>

      {!hasImages && (
        <div className="empty">
          <p>Pick a folder to start scanning or try the demo set.</p>
        </div>
      )}

      {hasImages && (
        <section className="grid">
          {visibleImages.map((img) => {
            const flaggedNow = img.analysis ? img.analysis.quality < threshold : false
            const selected = selection.has(img.id)
            return (
              <article
                key={img.id}
                className={`card ${flaggedNow ? 'flagged' : ''} ${selected ? 'selected' : ''}`}
                onClick={() => toggleSelect(img.id)}
              >
                <div
                  className="thumb"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setActiveId(img.id)
                  }}
                >
                  <img src={img.fileUrl} alt={img.name} loading="lazy" />
                  <div className="pill quality">{img.analysis ? img.analysis.quality.toFixed(0) : '—'}</div>
                  {img.trashed && <div className="pill trashed">Trashed</div>}
                  {flaggedNow && <div className="pill warn">Flag</div>}
                </div>
                <div className="meta">
                  <div className="title-row">
                    <h3>{img.name}</h3>
                    <div className="card-actions">
                      <button
                        className="mini"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveId(img.id)
                        }}
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                  <p>{formatSize(img.size)}</p>
                  <div className="metrics">
                    <span>Sharp {img.analysis ? img.analysis.sharpness.toFixed(1) : '…'}</span>
                    <span>Contrast {img.analysis ? img.analysis.contrast.toFixed(1) : '…'}</span>
                    <span>Noise {img.analysis ? img.analysis.noise.toFixed(1) : '…'}</span>
                  </div>
                  <div className="footer">
                    <p>{formatDate(img.modifiedAt)}</p>
                    <span className={`chip-mini ${img.analysis ? classify(img.analysis.quality, threshold) : 'pending'}`}>
                      {img.analysis ? classify(img.analysis.quality, threshold) : 'pending'}
                    </span>
                  </div>
                  {img.error && <p className="error">Failed: {img.error}</p>}
                </div>
              </article>
            )
          })}
        </section>
      )}

      <Lightbox
        items={visibleImages}
        activeId={activeId}
        threshold={threshold}
        selection={selection}
        onToggleSelect={toggleSelect}
        onClose={() => setActiveId(null)}
        onNext={() => {
          if (!activeId || visibleImages.length === 0) return
          const idx = visibleImages.findIndex((i) => i.id === activeId)
          const next = visibleImages[(idx + 1) % visibleImages.length]
          setActiveId(next?.id ?? null)
        }}
        onPrev={() => {
          if (!activeId || visibleImages.length === 0) return
          const idx = visibleImages.findIndex((i) => i.id === activeId)
          const prev = visibleImages[(idx - 1 + visibleImages.length) % visibleImages.length]
          setActiveId(prev?.id ?? null)
        }}
        onTrash={(id) => trashIds([id])}
      />
    </div>
  )
}

export default App
