import { aircraftPlugin } from './aircraft/plugin'
import { earthquakePlugin } from './earthquakes/plugin'
import { eventPlugin } from './events/plugin'
import { examplePlugin } from './example/plugin'
import { launchPlugin } from './launches/plugin'
import { satellitePlugin } from './satellites/plugin'
import { shipPlugin } from './ships/plugin'
import { spaceWeatherPlugin } from './spaceweather/plugin'
import { stormPlugin } from './storms/plugin'
import { systemPlugin } from './system/plugin'
import { weatherPlugin } from './weather/plugin'
import type { AllEyesPlugin } from '../core/types'

/**
 * Built-in modules. Add a feature by importing it and appending it here.
 * See docs/plugins.md and src/plugins/example.
 */
export const builtinPlugins: AllEyesPlugin[] = [
  systemPlugin,
  aircraftPlugin,
  satellitePlugin,
  earthquakePlugin,
  weatherPlugin,
  shipPlugin,
  stormPlugin,
  eventPlugin,
  launchPlugin,
  spaceWeatherPlugin,
  examplePlugin,
]
