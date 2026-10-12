/** Address box inside the CITY panel. The dropdown is fixed so the card cannot clip it. */

import { findCity } from '../core/cities'
import type { PluginContext } from '../core/types'
import { collapseQuery, houseToken, orderPlaces } from './address'
import { coordinateHit, resolvePlaces, suggestPlaces } from './geocode'
import { placeFly, registerCitySearch } from './focus'
import type { GeoHit } from './parse'

function cardText(query: string, hit: GeoHit): string {
  const quality = hit.quality ?? ''
  const miss = Boolean(houseToken(query)) && quality !== 'EXACT' && quality !== 'INTERPOLATED'
  const range = hit.rangeKm < 10 ? `${hit.rangeKm.toFixed(2)} KM` : `${Math.round(hit.rangeKm)} KM`
  return [
    miss ? 'NO EXACT MATCH' : '',
    hit.label,
    `${hit.lat.toFixed(4)}  ${hit.lon.toFixed(4)}`,
    range,
    quality,
  ].filter(Boolean).join('\n')
}

export function attachAddressSearch(form: HTMLFormElement, input: HTMLInputElement, ctx: PluginContext): () => void {
  input.setAttribute('aria-keyshortcuts', 'Control+K Meta+K')
  input.setAttribute('aria-autocomplete', 'list')
  const card = document.createElement('div')
  card.className = 'ae-city-result'
  card.hidden = true
  form.insertAdjacentElement('afterend', card)
  const list = document.createElement('div')
  list.className = 'ae-city-suggest'
  list.hidden = true
  list.setAttribute('role', 'listbox')
  document.body.append(list)

  let rows: GeoHit[] = []
  let at = 0
  let timer = 0
  let shownFor = ''
  let abort = new AbortController()

  function showCard(text: string) {
    card.hidden = !text
    card.textContent = text
  }

  function goHit(hit: GeoHit) {
    if (!placeFly(hit)) ctx.globe.flyTo(hit.lat, hit.lon, hit.rangeKm)
  }

  function placeList() {
    const rect = form.getBoundingClientRect()
    list.style.left = `${Math.round(rect.left)}px`
    list.style.top = `${Math.round(rect.bottom + 2)}px`
    list.style.width = `${Math.round(rect.width)}px`
  }

  function paintList() {
    list.replaceChildren()
    placeList()
    if (!rows.length) {
      list.hidden = false
      const empty = document.createElement('div')
      empty.className = 'ae-city-suggest-empty'
      empty.textContent = 'NO RESULTS'
      list.append(empty)
      return
    }
    list.hidden = false
    rows.forEach((hit, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = index === at ? 'is-on' : ''
      const title = document.createElement('span')
      title.textContent = hit.label
      const detail = document.createElement('small')
      detail.textContent = (hit.quality ?? hit.scale).toUpperCase()
      button.append(title, detail)
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => {
        const query = collapseQuery(input.value) ?? input.value.trim()
        const [ordered] = orderPlaces(query, [hit])
        const chosen = ordered ?? hit
        showCard(cardText(query, chosen))
        goHit(chosen)
        list.hidden = true
      })
      list.append(button)
    })
  }

  function schedule(wait = 250) {
    window.clearTimeout(timer)
    const collapsed = collapseQuery(input.value)
    if (!collapsed) {
      rows = []
      list.hidden = true
      return
    }
    timer = window.setTimeout(() => {
      abort.abort()
      abort = new AbortController()
      const signal = abort.signal
      const view = ctx.globe.getView()
      void suggestPlaces(collapsed, ctx.settings, signal, { lat: view.lat, lon: view.lon }).then((hits) => {
        if (signal.aborted || collapseQuery(input.value) !== collapsed) return
        rows = hits
        at = 0
        shownFor = input.value.trim()
        paintList()
      })
    }, wait)
  }

  async function run(raw: string): Promise<string> {
    const text = collapseQuery(raw)
    window.clearTimeout(timer)
    list.hidden = true
    abort.abort()
    abort = new AbortController()
    if (!text) {
      showCard('NO RESULTS')
      return 'NO RESULTS'
    }
    input.value = text
    if (!houseToken(text)) {
      const known = findCity(text)
      if (known) {
        const hit: GeoHit = {
          lat: known.lat,
          lon: known.lon,
          label: known.name,
          scale: 'city',
          rangeKm: 12,
          source: 'city',
        }
        showCard(cardText(text, hit))
        goHit(hit)
        return `FLY ${known.name}`
      }
    }
    const coord = coordinateHit(text)
    if (coord) {
      showCard(cardText(text, coord))
      goHit(coord)
      return `FLY ${coord.label}`
    }
    const signal = abort.signal
    const places = await resolvePlaces(text, ctx.settings, signal)
    if (signal.aborted) return ''
    const place = places[0]
    if (!place) {
      showCard('NO RESULTS')
      return `NO RESULTS "${text.toUpperCase()}"`
    }
    showCard(cardText(text, place))
    goHit(place)
    const quality = place.quality ?? ''
    const miss = Boolean(houseToken(text)) && quality !== 'EXACT' && quality !== 'INTERPOLATED'
    return miss ? `NO EXACT MATCH ${place.label.toUpperCase()}` : `FLY ${place.label.toUpperCase()}${quality ? ` ${quality}` : ''}`
  }

  const onSubmit = (event: Event) => {
    event.preventDefault()
    const text = input.value.trim()
    const picked = !list.hidden && shownFor === text ? rows[at] : undefined
    if (picked && at !== 0) {
      const query = collapseQuery(text) ?? text
      const [ordered] = orderPlaces(query, [picked])
      const chosen = ordered ?? picked
      showCard(cardText(query, chosen))
      goHit(chosen)
      list.hidden = true
      return
    }
    void run(text)
  }
  form.addEventListener('submit', onSubmit)
  input.addEventListener('input', () => schedule())
  input.addEventListener('focus', () => {
    if (collapseQuery(input.value)) schedule(0)
  })
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!rows.length || list.hidden) return
      event.preventDefault()
      at = event.key === 'ArrowDown' ? (at + 1) % rows.length : (at - 1 + rows.length) % rows.length
      paintList()
    } else if (event.key === 'Tab') {
      const row = rows[at] ?? rows[0]
      if (!row || list.hidden) return
      event.preventDefault()
      input.value = row.label
      schedule()
    } else if (event.key === 'Escape') {
      list.hidden = true
    }
  }
  input.addEventListener('keydown', onKey)
  const onDoc = (event: MouseEvent) => {
    const target = event.target
    if (target instanceof Node && (form.contains(target) || list.contains(target))) return
    list.hidden = true
  }
  document.addEventListener('mousedown', onDoc)
  const onMove = () => {
    if (!list.hidden) placeList()
  }
  window.addEventListener('resize', onMove)
  window.addEventListener('scroll', onMove, true)
  const detachCity = registerCitySearch({
    focus() {
      input.focus()
      input.select()
    },
    run,
  })

  return () => {
    window.clearTimeout(timer)
    abort.abort()
    form.removeEventListener('submit', onSubmit)
    input.removeEventListener('keydown', onKey)
    document.removeEventListener('mousedown', onDoc)
    window.removeEventListener('resize', onMove)
    window.removeEventListener('scroll', onMove, true)
    list.remove()
    card.remove()
    detachCity()
  }
}
