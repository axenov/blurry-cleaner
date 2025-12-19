const DEMO_COLORS = ['#8ef6ff', '#fce28a', '#c5f36b', '#ffb5e8', '#a3bfff']

export function createDemoImages() {
  const items: {
    id: string
    name: string
    absolutePath: string
    fileUrl: string
    size: number
    modifiedAt: number
    createdAt: number
  }[] = []
  for (let i = 0; i < 8; i++) {
    const canvas = document.createElement('canvas')
    const blurred = i % 2 === 1
    canvas.width = 800
    canvas.height = 540
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    ctx.fillStyle = '#0c1018'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    if (blurred) ctx.filter = 'blur(6px) saturate(0.8)'
    ctx.fillStyle = DEMO_COLORS[i % DEMO_COLORS.length]
    ctx.beginPath()
    ctx.roundRect(80 + i * 8, 120, 520, 220, 28)
    ctx.fill()
    ctx.fillStyle = '#0c1018'
    ctx.font = '72px "Sora", system-ui'
    ctx.fillText(blurred ? 'BLUR' : 'CRISP', 140, 250)
    ctx.restore()
    const fileUrl = canvas.toDataURL('image/png')
    items.push({
      id: `demo-${i}`,
      name: blurred ? `Blurred-${i}.png` : `Sharp-${i}.png`,
      absolutePath: `demo/${i}.png`,
      fileUrl,
      size: fileUrl.length,
      modifiedAt: Date.now() - i * 1000 * 60 * 60,
      createdAt: Date.now() - i * 1000 * 60 * 60,
    })
  }
  return items
}
