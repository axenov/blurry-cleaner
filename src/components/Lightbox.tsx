import { useEffect } from 'react'
import type { ImageRecord } from '../types'
import { classify } from '../lib/quality'

interface Props {
  items: ImageRecord[]
  activeId: string | null
  threshold: number
  onClose: () => void
  onNext: () => void
  onPrev: () => void
  onTrash: (id: string) => void
  onToggleSelect: (id: string) => void
  selection: Set<string>
}

export function Lightbox({
  items,
  activeId,
  threshold,
  onClose,
  onNext,
  onPrev,
  onTrash,
  onToggleSelect,
  selection,
}: Props) {
  const item = items.find((i) => i.id === activeId)

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!activeId) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key.toLowerCase() === 't') {
        onTrash(activeId)
      }
      if (e.key.toLowerCase() === 's') {
        onToggleSelect(activeId)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [activeId, onClose, onNext, onPrev, onTrash, onToggleSelect])

  if (!item) return null

  const qualityLabel = item.analysis ? classify(item.analysis.quality, threshold) : 'pending'
  const selected = selection.has(item.id)

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <div className="lightbox-backdrop" onClick={onClose} />
      <div className="lightbox-shell">
        <header className="lightbox-header">
          <div>
            <p className="eyebrow">Preview</p>
            <h3>{item.name}</h3>
            <p className="micro">
              {new Date(item.modifiedAt).toLocaleString()} · {Math.round(item.size / 1024)} KB
            </p>
          </div>
          <div className="lightbox-actions">
            <span className={`pill-count ${selection.size > 0 ? 'active' : ''}`}>Selected: {selection.size}</span>
            <span className={`chip-mini ${qualityLabel}`}>{qualityLabel}</span>
            <button className="ghost" onClick={() => onToggleSelect(item.id)}>
              {selected ? 'Deselect' : 'Select'}
            </button>
            <button className="danger" onClick={() => onTrash(item.id)}>
              Move to trash (T)
            </button>
            <button className="ghost" onClick={onClose}>
              Close (Esc)
            </button>
          </div>
        </header>
        <div className="lightbox-content">
          <button className="nav prev" onClick={onPrev} aria-label="Previous image">
            ←
          </button>
          <img src={item.fileUrl} alt={item.name} />
          <button className="nav next" onClick={onNext} aria-label="Next image">
            →
          </button>
        </div>
      </div>
    </div>
  )
}
