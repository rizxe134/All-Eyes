export interface Shell {
  canvas: HTMLCanvasElement
  clock: HTMLElement
  live: HTMLElement
  count: HTMLElement
  coords: HTMLElement
  layers: HTMLElement
  inspect: HTMLElement
  panels: HTMLElement
  alerts: HTMLElement
  chips: HTMLElement
  radar: HTMLCanvasElement
  radarLabel: HTMLElement
  readout: HTMLElement
  scrub: HTMLInputElement
  scrubLabel: HTMLElement
  prompt: HTMLInputElement
  suggest: HTMLElement
  output: HTMLElement
  track: HTMLElement
  right: HTMLElement
  boot: HTMLElement
  bootText: HTMLElement
  mute: HTMLButtonElement
  shot: HTMLButtonElement
  link: HTMLButtonElement
  cfg: HTMLButtonElement
  liveBtn: HTMLButtonElement
  settings: HTMLElement
  settingsForm: HTMLFormElement
  watchForm: HTMLFormElement
  info: HTMLElement
  infoHead: HTMLElement
  infoTitle: HTMLElement
  infoBody: HTMLElement
  infoSpeed: HTMLButtonElement
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
  const coords = el('div', 'ae-coords', '')
  const actions = el('div', 'ae-top-actions')
  const mute = el('button', 'ae-btn', 'SND') as HTMLButtonElement
  const shot = el('button', 'ae-btn', 'SHOT') as HTMLButtonElement
  const link = el('button', 'ae-btn', 'LINK') as HTMLButtonElement
  const cfg = el('button', 'ae-btn', 'CFG') as HTMLButtonElement
  mute.type = 'button'
  shot.type = 'button'
  link.type = 'button'
  cfg.type = 'button'
  actions.append(mute, shot, link, cfg)
  top.append(brand, clock, live, count, coords, actions)

  const layers = el('aside', 'ae-layers')
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
  const radarLabel = el('div', 'ae-radar-label', 'RADAR')
  radarWrap.append(radar, radarLabel)

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
  prompt.placeholder = 'fly tokyo   layer ships off   viewer   size 0.7   help'
  prompt.setAttribute('aria-label', 'Command')
  form.append(gt, prompt)
  foot.append(scrubRow, output, suggest, form)

  const track = el('div', 'ae-track', 'LOCK')
  track.hidden = true
  const cross = el('div', 'ae-cross')
  const scan = el('div', 'ae-scan')
  const boot = el('div', 'ae-boot')
  const bootText = el('pre', '', 'ALL EYES\nLINKING WORLD')
  boot.append(bootText)

  const settings = el('div', 'ae-modal')
  settings.hidden = true
  const dialog = el('form', 'ae-dialog') as HTMLFormElement
  dialog.append(el('h2', '', 'OPTIONAL KEYS'))
  const note = el('p', '', 'Stored in this browser only. The globe runs with none of these set.')
  dialog.append(note)
  dialog.append(field('OpenSky client id', 'openskyId', 'text'))
  dialog.append(field('OpenSky client secret', 'openskySecret', 'password'))
  dialog.append(field('NASA FIRMS map key', 'firmsKey', 'password'))
  const sizeWrap = el('label', 'ae-field')
  sizeWrap.append(document.createTextNode('MARKER SIZE'))
  const markerSize = el('input') as HTMLInputElement
  markerSize.name = 'markerSize'
  markerSize.type = 'range'
  markerSize.min = '0.35'
  markerSize.max = '1.8'
  markerSize.step = '0.05'
  markerSize.value = '0.7'
  sizeWrap.append(markerSize)
  dialog.append(sizeWrap)
  const row = el('div', 'ae-row')
  const save = el('button', 'ae-btn', 'SAVE') as HTMLButtonElement
  save.type = 'submit'
  const close = el('button', 'ae-btn', 'CLOSE') as HTMLButtonElement
  close.type = 'button'
  close.addEventListener('click', () => { settings.hidden = true })
  row.append(save, close)
  dialog.append(row)
  settings.append(dialog)

  right.append(side)
  hud.append(top, layers, right, radarWrap, alerts, foot, track)
  const info = el('div', 'ae-infocard')
  info.hidden = true
  const infoHead = el('header')
  const infoTitle = el('strong', '', 'CONTACT')
  const infoSpeed = el('button', 'ae-btn', 'KT') as HTMLButtonElement
  infoSpeed.type = 'button'
  infoSpeed.title = 'Toggle KT / MPH / KM/H'
  infoHead.append(infoTitle, infoSpeed)
  const infoBody = el('pre')
  info.append(infoHead, infoBody)
  root.append(canvas, cross, hud, info, boot, settings, scan)

  return {
    canvas,
    clock,
    live,
    count,
    coords,
    layers,
    inspect,
    panels,
    alerts: alertList,
    chips,
    radar,
    radarLabel,
    readout: coords,
    scrub,
    scrubLabel,
    prompt,
    suggest,
    output,
    track,
    right,
    boot,
    bootText,
    mute,
    shot,
    link,
    cfg,
    liveBtn,
    settings,
    settingsForm: dialog,
    watchForm,
    info,
    infoHead,
    infoTitle,
    infoBody,
    infoSpeed,
  }
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
