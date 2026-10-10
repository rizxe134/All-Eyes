import { describe, expect, it } from 'vitest'
import { emptyPhoto, requestPhoto, settlePhoto, showPlaceholder } from '../src/ui/photo-state'

describe('photo frame', () => {
  it('shows the placeholder only when there is no photo or the load failed', () => {
    let frame = emptyPhoto()
    expect(showPlaceholder(frame)).toBe(true)

    frame = requestPhoto(frame, 'https://photos.test/a.jpg')
    expect(frame.phase).toBe('pending')
    expect(showPlaceholder(frame)).toBe(false)

    frame = settlePhoto(frame, frame.token, true)
    expect(frame.phase).toBe('shown')
    expect(showPlaceholder(frame)).toBe(false)

    frame = settlePhoto(frame, frame.token, false)
    expect(frame.phase).toBe('failed')
    expect(showPlaceholder(frame)).toBe(true)
  })

  it('drops a stale error after the operator switches planes', () => {
    let frame = requestPhoto(emptyPhoto(), 'https://photos.test/a.jpg')
    const stale = frame.token
    frame = requestPhoto(frame, 'https://photos.test/b.jpg')
    frame = settlePhoto(frame, stale, false)
    expect(frame.url).toBe('https://photos.test/b.jpg')
    expect(frame.phase).toBe('pending')
    expect(showPlaceholder(frame)).toBe(false)

    frame = settlePhoto(frame, frame.token, true)
    expect(showPlaceholder(frame)).toBe(false)

    frame = requestPhoto(frame, '')
    expect(frame.phase).toBe('none')
    expect(showPlaceholder(frame)).toBe(true)
    frame = settlePhoto(frame, stale, true)
    expect(frame.phase).toBe('none')
  })

  it('keeps a shown photo when the same url is painted again', () => {
    let frame = settlePhoto(requestPhoto(emptyPhoto(), 'https://photos.test/a.jpg'), 1, true)
    const token = frame.token
    frame = requestPhoto(frame, 'https://photos.test/a.jpg')
    expect(frame.token).toBe(token)
    expect(frame.phase).toBe('shown')
  })
})
