import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function createMainWindow() {
  const rendererIndex = resolveRendererIndex()
  const win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    title: 'Blurry Cleaner',
    backgroundColor: '#05070c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const url = pathToFileURL(rendererIndex).toString()
    console.log('Loading renderer from', url)
    win.loadURL(url).catch((err) => {
      console.error('Failed to load renderer', rendererIndex, err)
    })
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load', { errorCode, errorDescription, validatedURL, rendererIndex })
  })

  win.webContents.on('did-finish-load', async () => {
    try {
      const image = await win.webContents.capturePage()
      const imgPath = path.join(app.getPath('temp'), 'blurry-cleaner-capture.png')
      await fs.writeFile(imgPath, image.toPNG())
      console.log('Captured UI to', imgPath)
    } catch (err) {
      console.error('Failed to capture page', err)
    }
  })

  return win
}

function resolveRendererIndex() {
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'renderer', 'index.html'),
    path.join(process.resourcesPath, 'app.asar', 'renderer', 'index.html'),
    path.join(process.resourcesPath, 'renderer', 'index.html'),
    path.join(__dirname, '..', 'renderer', 'index.html'),
    path.join(app.getAppPath(), 'renderer', 'index.html'),
  ]
  console.log('Renderer candidates:', candidates.map((c) => ({ path: c, exists: fsSync.existsSync(c) })))
  for (const candidate of candidates) {
    try {
      if (fsSync.existsSync(candidate)) return candidate
    } catch (_) {
      // ignore and continue
    }
  }
  // fallback to app path even if not found (Electron will throw, but we logged)
  return candidates[0]
}

async function listImagesFromDirectory(rootDirectory) {
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff'])
  const stack = [rootDirectory]
  const files = []

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch (err) {
      console.warn('Skip unreadable dir', current, err)
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!allowed.has(ext)) continue
      try {
        const stats = await fs.stat(fullPath)
        const id = createHash('md5').update(fullPath).digest('hex')
        files.push({
          id,
          name: path.relative(rootDirectory, fullPath),
          absolutePath: fullPath,
          fileUrl: pathToFileURL(fullPath).toString(),
          size: stats.size,
          modifiedAt: stats.mtimeMs,
          createdAt: stats.birthtimeMs,
        })
      } catch (err) {
        console.warn('Skip unreadable file', fullPath, err)
      }
    }
  }
  return files
}

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('dialog:choose-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('fs:list-images', async (_event, directory) => {
  if (!directory) return []
  try {
    const files = await listImagesFromDirectory(directory)
    return files
  } catch (error) {
    console.error('Failed to read directory', error)
    return []
  }
})

ipcMain.handle('fs:trash', async (_event, filePaths) => {
  if (!Array.isArray(filePaths)) return { ok: false }
  for (const filePath of filePaths) {
    try {
      await shell.trashItem(filePath)
    } catch (error) {
      console.error('Failed to trash', filePath, error)
      return { ok: false, message: String(error) }
    }
  }
  return { ok: true }
})

ipcMain.handle('fs:read-buffer', async (_event, filePath) => {
  if (!filePath) return { ok: false, message: 'missing path' }
  try {
    const data = await fs.readFile(filePath)
    if (data.byteLength > 30 * 1024 * 1024) {
      return { ok: false, message: 'file too large (>30MB) for in-memory scan' }
    }
    return {
      ok: true,
      buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    }
  } catch (error) {
    return { ok: false, message: String(error) }
  }
})
