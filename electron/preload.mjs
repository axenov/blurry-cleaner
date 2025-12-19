import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  chooseDirectory: () => ipcRenderer.invoke('dialog:choose-directory'),
  listImages: (directory) => ipcRenderer.invoke('fs:list-images', directory),
  trashFiles: (paths) => ipcRenderer.invoke('fs:trash', paths),
  readFileBuffer: (filePath) => ipcRenderer.invoke('fs:read-buffer', filePath),
})
