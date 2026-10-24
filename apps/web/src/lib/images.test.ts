import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Museum } from '@mus3o/shared'
import { peekResolvedImage, prefetchPalaceImages } from './images'

const resolved = (src: string) => ({
  src,
  width: 960,
  height: 640,
  title: src,
  artist: '',
  license: 'CC0',
  sourceUrl: src,
  kind: 'photo' as const,
})

const palace: Museum = {
  title: 'Test',
  rooms: [
    {
      id: 'a',
      name: 'A',
      description: '',
      imageSearch: { wikiTitle: 'Roma' },
      pieces: [
        { id: 'a1', title: 'Coliseo', text: '', fact: '', imageSearch: { wikiTitle: 'Coliseo' } },
        { id: 'a2', title: 'Coliseo otra vez', text: '', fact: '', imageSearch: { wikiTitle: 'Coliseo' } },
        { id: 'a3', title: 'Sin imagen', text: '', fact: '' },
      ],
    },
    {
      id: 'b',
      name: 'B',
      description: '',
      pieces: [{ id: 'b1', title: 'Nada', text: '', fact: '', imageSearch: { wikiTitle: 'Inexistente' } }],
    },
  ],
}

describe('prefetchPalaceImages', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let preloaded: string[]

  beforeEach(() => {
    preloaded = []
    fetchMock = vi.fn(async (url: string) => {
      const wiki = new URL(url, 'http://local').searchParams.get('wiki')
      if (wiki === 'Inexistente') return new Response('{}', { status: 404 })
      return new Response(JSON.stringify(resolved(`https://upload.wikimedia.org/${wiki}.jpg`)))
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'Image',
      class {
        set src(value: string) {
          preloaded.push(value)
        }
        decode() {
          return Promise.resolve()
        }
      },
    )
  })

  it('resolves every distinct search of rooms and pieces once and preloads the found images', async () => {
    await prefetchPalaceImages(palace)
    const asked = fetchMock.mock.calls.map(([url]) => new URL(url, 'http://local').searchParams.get('wiki'))
    expect(asked.sort()).toEqual(['Coliseo', 'Inexistente', 'Roma'])
    expect(preloaded.sort()).toEqual(['https://upload.wikimedia.org/Coliseo.jpg', 'https://upload.wikimedia.org/Roma.jpg'])
  })

  it('leaves the resolved images ready to read synchronously', async () => {
    await prefetchPalaceImages(palace)
    expect(peekResolvedImage({ wikiTitle: 'Coliseo' })?.src).toBe('https://upload.wikimedia.org/Coliseo.jpg')
    expect(peekResolvedImage({ wikiTitle: 'Inexistente' })).toBeNull()
  })

  it('does not download the same image twice when called again', async () => {
    await prefetchPalaceImages(palace)
    const before = preloaded.length
    await prefetchPalaceImages(palace)
    expect(preloaded.length).toBe(before)
  })

  it('asks at most 4 images at a time and the room paintings first', async () => {
    let active = 0
    let peak = 0
    const order: string[] = []
    fetchMock.mockImplementation(async (url: string) => {
      const wiki = new URL(url, 'http://local').searchParams.get('wiki')!
      order.push(wiki)
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return new Response(JSON.stringify(resolved(`https://upload.wikimedia.org/${wiki}.jpg`)))
    })
    const big: Museum = {
      title: 'Big',
      rooms: ['r1', 'r2'].map((r) => ({
        id: r,
        name: r,
        description: '',
        imageSearch: { wikiTitle: `Sala ${r}` },
        pieces: Array.from({ length: 8 }, (_, n) => ({ id: `${r}p${n}`, title: 'p', text: '', fact: '', imageSearch: { wikiTitle: `Pieza ${r}${n}` } })),
      })),
    }
    await prefetchPalaceImages(big)
    expect(peak).toBe(4)
    expect(order.slice(0, 2).sort()).toEqual(['Sala r1', 'Sala r2'])
    expect(order).toHaveLength(18)
  })
})
