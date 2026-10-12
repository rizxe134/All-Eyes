export interface Shell {
  canvas: HTMLCanvasElement
  clock: HTMLElement
  live: HTMLElement
  count: HTMLElement
  feed: HTMLElement
  ships: HTMLElement
  sats: HTMLElement
  tip: HTMLElement
  coords: HTMLElement
  layers: HTMLElement
  inspect: HTMLElement
  panels: HTMLElement
  alerts: HTMLElement
  chips: HTMLElement
  radar: HTMLCanvasElement
  radarWrap: HTMLElement
  radarLabel: HTMLElement
  radarToggle: HTMLButtonElement
  radarBtn: HTMLButtonElement
  legend: HTMLElement
  legendRoot: HTMLDetailsElement
  readout: HTMLElement
  scrub: HTMLInputElement
  scrubLabel: HTMLElement
  prompt: HTMLInputElement
  suggest: HTMLElement
  output: HTMLElement
  find: HTMLInputElement
  findGhost: HTMLElement
  findList: HTMLElement
  findCard: HTMLElement
  track: HTMLElement
  right: HTMLElement
  boot: HTMLElement
  bootText: HTMLElement
  hud: HTMLElement
  top: HTMLElement
  dock: HTMLElement
  mute: HTMLButtonElement
  shot: HTMLButtonElement
  link: HTMLButtonElement
  cfg: HTMLButtonElement
  liveBtn: HTMLButtonElement
  settings: HTMLElement
  settingsForm: HTMLFormElement
  cfgClose: HTMLButtonElement
  globeCrt: HTMLElement
  watchForm: HTMLFormElement
  info: HTMLElement
  infoHead: HTMLElement
  infoTitle: HTMLElement
  infoBody: HTMLElement
  infoSpeed: HTMLButtonElement
  infoUnpin: HTMLButtonElement
  recover: HTMLElement
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export function buildShell(root: HTMLElement): Shell {
  root.replaceChildren()
  const canvas = el('canvas', 'ae-globe')
  const hud = el('div', 'ae-hud')
  const top = el('header', 'ae-top')
  const brand = el('div', 'ae-brand', 'ALL EYES')
  const clock = el('div', 'ae-clock', '--:--:--Z')
  const live = el('div', 'ae-live')
  live.append(el('span', 'ae-dot'), el('span', 'ae-live-label', 'LIVE'))
  const count = el('div', 'ae-count', '0 CONTACTS')
  const feeds = el('div', 'ae-feeds')
  const feed = el('div', 'ae-feed is-off', 'AIR 0 LOADED · 0 VIEW · —')
  const ships = el('div', 'ae-feed is-off', 'SHIPS 0 LOADED · 0 VIEW · —')
  const sats = el('div', 'ae-feed is-off', 'SATS 0 LOADED · 0 VIEW · —')
  feeds.append(feed, ships, sats)
  const coords = el('div', 'ae-coords', '')
  const actions = el('div', 'ae-top-actions')
  const mute = barButton('SND', 'SND', 'Sound on or off')
  const shot = barButton('SHOT', 'SHOT', 'Save a picture of the globe')
  const link = barButton('LINK', 'LINK', 'Copy a link to this view')
  const radarBtn = barButton('RADAR', 'RAD', 'Show or hide the radar')
  const cfg = barButton('CFG', 'CFG', 'Optional keys')
  radarBtn.setAttribute('aria-pressed', 'true')
  actions.append(mute, shot, link, radarBtn, cfg)
  top.append(brand, clock, live, count, feeds, coords, actions)

  const dock = el('div', 'ae-dock')
  const findForm = el('form', 'ae-find') as HTMLFormElement
  const findBox = el('div', 'ae-find-box')
  const findGhost = el('div', 'ae-find-ghost')
  findGhost.hidden = true
  findGhost.setAttribute('aria-hidden', 'true')
  const find = el('input', 'ae-find-input') as HTMLInputElement
  find.type = 'text'
  find.autocomplete = 'off'
  find.spellcheck = false
  find.placeholder = 'Search place, flight, ship, satellite'
  find.setAttribute('aria-label', 'Search the world')
  find.setAttribute('aria-keyshortcuts', 'Control+K Meta+K')
  find.setAttribute('aria-autocomplete', 'list')
  findBox.append(findGhost, find)
  const findList = el('div', 'ae-find-list')
  findList.hidden = true
  findList.setAttribute('role', 'listbox')
  const findCard = el('div', 'ae-find-card')
  findCard.hidden = true
  findForm.append(findBox, findList, findCard)
  const layers = el('aside', 'ae-layers')
  const legend = el('details', 'ae-legend') as HTMLDetailsElement
  const legendSummary = el('summary', '', 'LEGEND')
  const legendBody = el('div', 'ae-legend-body')
  legend.append(legendSummary, legendBody)
  const right = el('div', 'ae-right')
  const side = el('aside', 'ae-side')
  const inspectCard = el('section', 'ae-card')
  inspectCard.append(el('h2', '', 'CONTACT'), el('div', 'ae-inspect', 'HOVER OR CLICK A MARKER'))
  const inspect = inspectCard.querySelector('.ae-inspect') as HTMLElement
  const panels = el('div', 'ae-panels')
  side.append(inspectCard, panels)

  const radarWrap = el('div', 'ae-radar-wrap')
  const radar = el('canvas', 'ae-radar') as HTMLCanvasElement
  radar.width = 160
  radar.height = 160
  const radarHead = el('div', 'ae-radar-label')
  const radarLabel = el('span', '', 'RADAR')
  const radarToggle = el('button', 'ae-btn', 'HIDE') as HTMLButtonElement
  radarToggle.type = 'button'
  radarToggle.title = 'Hide the radar'
  radarHead.append(radarLabel, radarToggle)
  radarWrap.append(radar, radarHead)
  dock.append(findForm, layers, legend, radarWrap)

  const alerts = el('div', 'ae-alerts')
  const alertList = el('div', 'ae-alert-list')
  const chips = el('div', 'ae-chips')
  const watchForm = el('form', 'ae-watch') as HTMLFormElement
  const kind = el('select') as HTMLSelectElement
  kind.name = 'kind'
  for (const [value, label] of [['quake', 'QUAKE'], ['flight', 'FLIGHT'], ['pass', 'PASS']] as const) {
    const option = el('option', '', label) as HTMLOptionElement
    option.value = value
    kind.append(option)
  }
  const value = el('input') as HTMLInputElement
  value.name = 'value'
  value.placeholder = '5.0 / UAL / ISS'
  value.autocomplete = 'off'
  const arm = el('button', '', 'ARM') as HTMLButtonElement
  arm.type = 'submit'
  watchForm.append(kind, value, arm)
  alerts.append(alertList, chips, watchForm)

  const foot = el('footer', 'ae-foot')
  const scrubRow = el('div', 'ae-scrubrow')
  const liveBtn = el('button', 'ae-btn is-on', 'LIVE') as HTMLButtonElement
  liveBtn.type = 'button'
  const scrub = el('input') as HTMLInputElement
  scrub.type = 'range'
  scrub.min = '-720'
  scrub.max = '360'
  scrub.value = '0'
  const scrubLabel = el('div', 'ae-scrub-label', 'NOW')
  scrubRow.append(liveBtn, scrub, scrubLabel)
  const output = el('pre', 'ae-output')
  output.hidden = true
  const suggest = el('div', 'ae-suggest')
  suggest.hidden = true
  const form = el('form', 'ae-cmd') as HTMLFormElement
  const gt = el('span', 'ae-gt', '>')
  const prompt = el('input', 'ae-prompt') as HTMLInputElement
  prompt.autocomplete = 'off'
  prompt.spellcheck = false
  prompt.placeholder = 'go times square   go DL123   city atlanta   help'
  prompt.setAttribute('aria-label', 'Command')
  form.append(gt, prompt)
  foot.append(scrubRow, output, suggest, form)

  const track = el('button', 'ae-track', 'LOCK') as HTMLButtonElement
  track.type = 'button'
  track.hidden = true
  track.title = 'Clear the lock'
  const cross = el('div', 'ae-cross')
  const scan = el('div', 'ae-scan')
  const boot = el('div', 'ae-boot')
  const bootText = el('pre', '', 'ALL EYES\nLINKING WORLD')
  boot.append(bootText)

  const settings = el('div', 'ae-modal')
  settings.hidden = true
  const dialog = el('form', 'ae-dialog') as HTMLFormElement
  const dialogHead = el('header', 'ae-dialog-head')
  const dialogTitle = el('h2', '', 'OPTIONAL KEYS')
  const cfgClose = el('button', 'ae-btn ae-dialog-x', 'X') as HTMLButtonElement
  cfgClose.type = 'button'
  cfgClose.title = 'Close'
  cfgClose.setAttribute('aria-label', 'Close settings')
  dialogHead.append(dialogTitle, cfgClose)
  const dialogBody = el('div', 'ae-dialog-body')
  const note = el('p', '', 'Stored in this browser only. The globe runs with none of these set.')
  dialogBody.append(note)
  dialogBody.append(field('OpenSky client id', 'openskyId', 'text'))
  dialogBody.append(field('OpenSky client secret', 'openskySecret', 'password'))
  dialogBody.append(field('NASA FIRMS map key', 'firmsKey', 'password'))
  dialogBody.append(field('AISStream key (global ships)', 'aisstreamKey', 'password'))
  dialogBody.append(field('MapTiler key (optional basemap)', 'maptilerKey', 'password'))
  dialogBody.append(field('Mapbox token (optional basemap)', 'mapboxKey', 'password'))
  dialogBody.append(field('TomTom key (live traffic speed)', 'tomtomKey', 'password'))
  dialogBody.append(field('HERE key (live traffic speed)', 'hereKey', 'password'))
  const sourceWrap = el('label', 'ae-field')
  sourceWrap.append(document.createTextNode('BASEMAP SOURCE'))
  const basemapSource = el('select') as HTMLSelectElement
  basemapSource.name = 'basemapSource'
  for (const [value, label] of [['free', 'FREE'], ['maptiler', 'MAPTILER'], ['mapbox', 'MAPBOX']] as const) {
    const option = el('option', '', label) as HTMLOptionElement
    option.value = value
    basemapSource.append(option)
  }
  sourceWrap.append(basemapSource)
  dialogBody.append(sourceWrap)
  const clearCache = el('button', 'ae-btn', 'CLEAR MAP CACHE') as HTMLButtonElement
  clearCache.type = 'button'
  clearCache.name = 'clearCache'
  dialogBody.append(clearCache)
  const sizeWrap = el('label', 'ae-field')
  sizeWrap.append(document.createTextNode('MARKER SIZE'))
  const markerSize = el('input') as HTMLInputElement
  markerSize.name = 'markerSize'
  markerSize.type = 'range'
  markerSize.min = '0.2'
  markerSize.max = '1.6'
  markerSize.step = '0.05'
  markerSize.value = '0.45'
  sizeWrap.append(markerSize)
  dialogBody.append(sizeWrap)
  const themeWrap = el('label', 'ae-field')
  themeWrap.append(document.createTextNode('GLOBE'))
  const theme = el('select') as HTMLSelectElement
  theme.name = 'theme'
  for (const [value, label] of [['color', 'COLOR'], ['green', 'GREEN']] as const) {
    const option = el('option', '', label) as HTMLOptionElement
    option.value = value
    theme.append(option)
  }
  theme.value = 'color'
  themeWrap.append(theme)
  dialogBody.append(themeWrap)
  const crtWrap = el('label', 'ae-field')
  crtWrap.append(document.createTextNode('CRT'))
  const crt = el('input') as HTMLInputElement
  crt.name = 'crt'
  crt.type = 'range'
  crt.min = '0'
  crt.max = '1'
  crt.step = '0.05'
  crt.value = '0.4'
  crtWrap.append(crt)
  dialogBody.append(crtWrap)
  const colorWrap = el('label', 'ae-field')
  colorWrap.append(document.createTextNode('MARKER COLORS'))
  const markerStyle = el('select') as HTMLSelectElement
  markerStyle.name = 'markerStyle'
  for (const [value, label] of [['color', 'CATEGORY'], ['mono', 'MONO']] as const) {
    const option = el('option', '', label) as HTMLOptionElement
    option.value = value
    markerStyle.append(option)
  }
  colorWrap.append(markerStyle)
  dialogBody.append(colorWrap)
  const row = el('div', 'ae-row')
  const save = el('button', 'ae-btn', 'SAVE') as HTMLButtonElement
  save.type = 'submit'
  row.append(save)
  dialogBody.append(row)
  dialog.append(dialogHead, dialogBody)
  settings.append(dialog)

  right.append(side)
  const recover = el('div', 'ae-recover', '')
  recover.hidden = true
  hud.append(top, dock, right, alerts, foot, track, recover)
  const info = el('div', 'ae-infocard')
  info.hidden = true
  const infoHead = el('header')
  const infoTitle = el('strong', '', 'CONTACT')
  const infoSpeed = el('button', 'ae-btn', 'KT') as HTMLButtonElement
  infoSpeed.type = 'button'
  infoSpeed.title = 'Toggle KT / MPH / KM/H'
  const infoUnpin = el('button', 'ae-btn', 'UNPIN') as HTMLButtonElement
  infoUnpin.type = 'button'
  infoUnpin.title = 'Dock the card again'
  infoHead.append(infoTitle, infoSpeed, infoUnpin)
  const infoBody = el('pre')
  info.append(infoHead, infoBody)
  const globeCrt = el('div', 'ae-globe-crt')
  const tip = el('div', 'ae-tip', '')
  tip.hidden = true
  root.append(canvas, globeCrt, cross, hud, info, tip, boot, settings, scan)

  return {
    canvas,
    clock,
    live,
    count,
    feed,
    ships,
    sats,
    tip,
    coords,
    layers,
    inspect,
    panels,
    alerts: alertList,
    chips,
    radar,
    radarWrap,
    radarLabel,
    radarToggle,
    radarBtn,
    legend: legendBody,
    legendRoot: legend,
    readout: coords,
    scrub,
    scrubLabel,
    prompt,
    suggest,
    output,
    find,
    findGhost,
    findList,
    findCard,
    track,
    right,
    boot,
    bootText,
    hud,
    top,
    dock,
    mute,
    shot,
    link,
    cfg,
    liveBtn,
    settings,
    settingsForm: dialog,
    cfgClose,
    globeCrt,
    watchForm,
    info,
    infoHead,
    infoTitle,
    infoBody,
    infoSpeed,
    infoUnpin,
    recover,
  }
}

function barButton(full: string, short: string, title: string): HTMLButtonElement {
  const button = el('button', 'ae-btn') as HTMLButtonElement
  button.type = 'button'
  button.title = title
  button.setAttribute('aria-pressed', 'false')
  button.append(el('span', 'ae-full', full), el('span', 'ae-short', short))
  return button
}

function field(label: string, name: string, type: string): HTMLElement {
  const wrap = document.createElement('label')
  wrap.className = 'ae-field'
  wrap.textContent = label
  const input = document.createElement('input')
  input.name = name
  input.type = type
  input.autocomplete = 'off'
  wrap.append(input)
  return wrap
}
