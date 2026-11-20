export type InstalledFontFace = {
  file: string
  url: string
  weight: string
  unicodeRange: string
  bytes: number
  sha256: string
}
export type InstalledFont = {
  version: number
  id: string
  family: string
  installedAt: string
  faces: InstalledFontFace[]
}
export type FontProgress = { jobId: string; done: number; total: number; current: string; failed: string[] }
export type FontsApi = {
  listInstalled: () => Promise<InstalledFont[]>
  download: (id: string, jobId: string) => Promise<InstalledFont>
  preview: (id: string, jobId: string) => Promise<InstalledFont>
  downloadAll: (jobId: string) => Promise<{ failed: string[] }>
  release: (jobId: string) => Promise<boolean>
  cancel: (jobId: string) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  onProgress: (callback: (progress: FontProgress) => void) => () => void
}
