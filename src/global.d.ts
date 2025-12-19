export interface ImageFile {
  id: string
  name: string
  absolutePath: string
  fileUrl: string
  size: number
  modifiedAt: number
  createdAt: number
}

export interface TrashResult {
  ok: boolean
  message?: string
}

declare global {
  interface Window {
    api?: {
      chooseDirectory: () => Promise<string | null>
      listImages: (directory: string) => Promise<ImageFile[]>
      trashFiles: (paths: string[]) => Promise<TrashResult>
      readFileBuffer: (path: string) => Promise<{ ok: boolean; buffer?: ArrayBuffer; message?: string }>
    }
  }
}
