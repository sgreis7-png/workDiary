// Client-side photo compression, applied before anything is queued or uploaded.
//
// Field phones produce 3–8MB photos; the report embeds them at 600px and the
// storage bucket pays for every byte. 1920px @ 0.82 JPEG is visually lossless
// for this use and typically 8–15x smaller. Compressing at the ingestion point
// (rather than at upload) also shrinks what the offline queue and drafts hold
// in IndexedDB.
const MAX_DIM = 1920
const QUALITY = 0.82
// under this size recompression buys little and can even grow the file
const SKIP_UNDER = 300 * 1024

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/gif') return file // canvas would drop the animation
  if (file.size < SKIP_UNDER) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    // decode failures (e.g. HEIC on browsers that can't read it) and files that
    // somehow compress larger fall back to the original — never lose the photo
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/i, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImage))
}
