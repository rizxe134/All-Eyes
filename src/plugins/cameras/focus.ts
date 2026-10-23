type OpenCamera = (id: string) => void

let open: OpenCamera | null = null

export function registerCameraOpen(fn: OpenCamera): void {
  open = fn
}

export function openCamera(id: string): void {
  open?.(id)
}
