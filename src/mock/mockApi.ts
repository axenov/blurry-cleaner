import { createDemoImages } from './demo'

export function installMockApi() {
  if ((window as any).api) return
  ;(window as any).api = {
    async chooseDirectory() {
      return 'Demo Mock'
    },
    async listImages() {
      return createDemoImages()
    },
    async trashFiles() {
      return { ok: true }
    },
  }
}
