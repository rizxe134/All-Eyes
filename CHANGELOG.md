# Changelog

Release pages list only that version. This file keeps the history.

## 2.3.0

- The top search is flights, ships, and satellites. Ctrl+F or Cmd+F focuses it. Places and addresses are not listed there.
- PLACE OR ADDRESS in the CITY panel suggests as you type. Photon answers after about 250 ms, and a newer keystroke cancels the previous lookup. GO, Enter, and `go <query>` look up that text as typed. Ctrl+K or Cmd+K focuses that box. A US house number is also sent, unchanged, to the Census geocoder and to Nominatim. A mapped house is EXACT. A Census range is INTERPOLATED. If neither has the house, the card says NO EXACT MATCH and the camera still flies to the closest hit.

## 2.2.1

- Address suggestions appear as you type, after a short pause, and a newer keystroke cancels the previous lookup. Photon is biased toward the camera. A house and street rank above a city. Each row shows the house number, street, city, state, and country. Arrow keys and Enter pick a row. Tab fills the top guess, and the rest of that guess sits in the field as dim text.
- A full US address is read as house, street, city, state, and ZIP, then checked with Photon, Nominatim, and the US Census geocoder. The camera flies to the house. The card says EXACT when the point is the building, INTERPOLATED when the Census range placed it on the block, or STREET ONLY / CITY ONLY when that is all that matched. If the house is not found, the card says NO EXACT MATCH and the closest rows stay in the list.

## 2.2.0

- Search sits at the top of the layer dock. Ctrl+K or Cmd+K focuses it, and `go <query>` does the same from the command line. It takes a street address, city, landmark, airport code, country, postcode, or coordinates in decimal or degrees-minutes-seconds, then flies there and drops a pin. Suggestions appear as you type. Places, flights, ships, and satellites are grouped. Photon is tried first, then Open-Meteo, then Nominatim at one request per second. A MapTiler or Mapbox key in CFG is used only when you have set one.
- A flight number such as DL123, AA 100, or UA2402 is turned into the ICAO callsign and looked up on the live aircraft list. If that aircraft is not loaded, the callsign feeds are asked directly. The camera follows it and the flight panel opens. The dashed route runs from the origin through the current position to the destination, with progress, distance flown, distance remaining, and an ETA marked EST from the ground speed. If the flight is not airborne, the panel says NOT CURRENTLY TRACKED and shows the route only when adsbdb has it. Airline prefixes come from OpenFlights under the Open Database License.
- The layer list and the LEGEND use the same sprites as the globe: aircraft, ground, satellite classes, Starlink, ships, quakes, storms, weather, launches, events, beacons, and the city layers. Each legend row has a one-line meaning, plus the selection ring, the solid track, and the dashed route.

## 2.1.2

- The top-bar buttons toggle. CFG, LINK, SHOT, LEGEND, and MORE open on the first click and close on the second. The open button stays lit. Escape closes the open panel. A click outside closes a small popover, and a click on the globe still selects a contact. Opening one panel closes the others. SND stays the mute switch, lit while sound is on. The settings panel has an X and sits beside the model viewer with its own scroll.
- RADAR is on the top bar next to those buttons. It shows and hides the corner radar, the same switch as `radar`, and it is remembered. The radar stays in the layer dock.

## 2.1.1

- Street imagery sat in the wrong place. The tile bitmaps ignore the usual GPU flip, so each tile was drawn with north and south swapped and the photo drifted off the buildings and roads as the camera moved. Tiles are now oriented north-up and draped on the Web Mercator latitude, so the image lines up with the OpenStreetMap footprints.
- Place names were doubled by the CRT fringe. At city scale (55 km and closer) the overlay, including the red/cyan color shift, is off. Hybrid still draws one Esri label layer. Streets and dark do not add a second one.

## 2.1.0

- Zooming into a city no longer crashes the Mac app. 2.0.0 built the street-tile list by stepping the zoom *in* when the view already needed more than 12 tiles. Each step quadrupled the list, so one frame around 900–1,500 km allocated tens of millions of tile records on the renderer thread (about 195 million at 1,500 km) and V8 aborted. The same view now steps *out* to coarser tiles and never builds more than 12.
- Tile fetches stay at 4 at a time, the queue is capped, and a camera move cancels tiles that have left the view. Textures past the resident cap are disposed, including their bitmaps. The disk cache stays about 48 MB and drops the oldest entries.
- OpenStreetMap queries wait until the camera rests, and a move cancels the one in flight. The query is a small box with a response cap. Buildings, roads, and simulated vehicles each have a hard maximum.
- If the renderer runs out of memory, buildings and traffic drop off and the tile budget shrinks. If the renderer process dies or the window stops answering, the app reloads, says **RECOVERED FROM CRASH**, restores the last camera position, and keeps the lighter city detail. Crashes are appended to `all-eyes-crash.log` in the app logs folder.

## 2.0.0

- Zoom runs from orbit down to a city block (about 220 m). Below a region, the globe picks up a basemap: Esri World Imagery, CARTO streets, a hybrid of imagery plus labels, or CARTO dark. `map sat`, `map streets`, `map hybrid`, and `map dark` switch it. MapTiler and Mapbox stay off until you set a key in **CFG** and choose that source. The credit line is on the city card.
- Buildings are OpenStreetMap footprints, extruded from the height or the level count. Roads and rails are the same map. There is no global terrain mesh. `city atlanta` (or `city list`) flies in. `place` and the city search box jump to an address through Nominatim.
- Traffic markers move along those real roads. With no traffic key they are **simulated**, and the city card says TRAFFIC SIMULATED. A TomTom or HERE key, if the call succeeds, recolours that flow from the live speed ratio. The vehicles are still simulated. Green, amber, and red are used only for that live ratio.
- Live transit, where a keyless feed exists: MBTA vehicles when the view is on Boston, Finnish Digitraffic trains when the view is on Finland. Other cities say there is no keyless feed. Departures boards are NOT AVAILABLE. Weather and air quality are Open-Meteo. Population is shown only when Nominatim has it.
- The city card is a fixed 210 px slot in the right column, with its own scroll. The left dock, top bar, and model viewer stay put. The CRT overlay eases off as you reach the street so the imagery stays readable. Tiles cache in the browser profile (about 48 MB). **CFG → CLEAR MAP CACHE** drops them.

## 1.6.1

- The layer list, radar, flight panel, and model viewer stay put while you pan and zoom. A selected flight, ship, or satellite opens in the left dock in place of the layer list, and **X** brings the list back. The card no longer floats over the globe.
- The top bar is one fixed row. Long feed lines ellipsize instead of wrapping and shoving the menu down. The hover tooltip stays inside the window.
- **MORE → PIN CARD** is the only floating card. It does not follow the contact. Drag it where you want; it stays inside the window.

## 1.6.0

- Markers are colour-coded by category: aircraft blue, ground amber, satellites cyan, Starlink violet, ships teal, quakes red, storms magenta, events yellow, weather orange, launches pink, beacons lime. The same colour is on the globe, the layer swatch, the tooltip, the radar, and the dock. A thin dark outline stays on every marker. The selection ring stays bright. **LEGEND** sits under the layer list. **CFG** and `colors` switch back to the old phosphor (`colors mono`) or set one layer (`colors aircraft #4da3ff`). `colors reset` clears those overrides.
- Aircraft stay on the whole globe. A 250 nm grid covers populated airspace and the ocean tracks, and a background sweep keeps refreshing it while the camera tile stays first in line. Contacts still merge by ICAO and coast between polls. Far contacts stay for about seven minutes, so moving the camera does not wipe the other continents. The top bar shows loaded worldwide, in view, sweep coverage, and each source as OK, PARTIAL, RATE-LIMITED, or OFFLINE. It says FEED COVERAGE LIMIT when the free feeds have nothing for the spot you are looking at.
- The layer list uses full names (AIRCRAFT, GROUND, SATELLITES, STARLINK, QUAKES, WEATHER, SHIPS, STORMS, EVENTS, LAUNCHES, BEACONS, and the satellite groups) with a colour swatch and the count on the right. On a short window it uses two columns. The radar sits beside or under that list, so it cannot cover a layer button. `radar off` hides it.

## 1.5.0

- Every marker is easier to hit. The pad is 14 px (larger on a touch screen), independent of the sprite. The nearest contact wins, a priority order breaks a close tie, the pointer changes on hover, and a small tooltip shows the name or callsign. Click the same spot again to cycle overlaps. Escape, a click on empty ground, or the lock chip clears the selection. The lock stays on the same id while the feeds refresh.
- Ships and satellites open the same left dock as flights: name and type, the flat colour CRT photo (or the no-photo bars), an info grid, a collapsible graph, and **3D VIEW / TRACK / FOLLOW / SHARE / MORE**. The More menu sits in the action bar. A missing field stays `NOT AVAILABLE`. Photos come from NASA or Wikimedia Commons only when the title matches, with a credit and a link.
- The public CelesTrak active catalog is on the globe (stations, GNSS, weather, science, GEO, and the rest). Starlink is its own layer and stays off until you arm it. Positions come from SGP4. A selected satellite draws its past ground track, future ground track, and orbit ring. `sat iss` and `find` jump to a satellite or a ship. TLEs are cached so the day still works offline.
- Ships follow the camera. Open Waters tiles cover the view, Finnish Digitraffic stays in the merge, and contacts merge by MMSI for 90 seconds. An AISStream key in **CFG** adds a live global stream. The top bar shows loaded vs in view and each source as OK, PARTIAL, or OFFLINE. Where those free feeds have nothing, it says FEED COVERAGE LIMIT.

## 1.4.2

- The map now asks for the aircraft in front of the camera. Radius tiles cover the view, busy airports (Atlanta, Chicago, Dallas, London, and the rest) stay on a refresh list, and a slower sweep fills in the rest of the world. Contacts still merge by ICAO and stay for 90 seconds.
- Zooming into an airport shows every aircraft the free feeds return there, including ones on the ground. Ground traffic is amber. The **GND** button hides it. Wide-zoom thinning only stacks dots that already overlap on screen. It does not drop a whole region, and there is no stride cap that throws away part of a feed.
- The top bar shows how many aircraft are loaded, how many are in view, and each source as OK, PARTIAL, RATE-LIMITED, or OFFLINE. If a feed cannot cover the spot you are looking at, it says FEED COVERAGE LIMIT.

## 1.4.1

- Aircraft stay on the globe. In 1.4.0 a zoomed-out dot sat so close to the earth that the depth buffer let the globe draw over it, so planes showed for a moment and then vanished. The camera now keeps those dots in front.
- An empty, failed, or rate-limited poll no longer clears the map. Contacts merge by ICAO, drop off only after 90 seconds without a fresh hit, and coast along their last track between polls.
- The feed tries airplanes.live, adsb.lol, and adsb.fi around the view, then OpenSky, and backs off when a source is rate-limited. The top bar shows the AIR count, OK / RATE-LIMITED / OFFLINE, and which source answered.

## 1.4.0

- Plane markers are much smaller. Silhouettes show up only when you are zoomed in (about 640 km). Farther out they are small dots. Dense areas thin harder. The click target stays about 12 px, the nearest contact wins, and another click on the same spot cycles through overlaps. The center cross and the selection ring are smaller. **CFG** and `size` default to 0.45.
- A flight photo no longer paints NO PHOTO on top of a real picture. The placeholder and the colour bars are removed once the image loads. They come back only when there is no photo or the image fails. Switching planes clears the previous frame.
- The globe is natural color: NASA Blue Marble, with city lights on the night side, and the same flat CRT treatment as the flight photo (scanlines, a phosphor mask, a little color fringe, a soft flicker). No curved glass. `theme green` switches the globe back to phosphor. `crt` sets the strength, including `crt 0` for none. The panels stay green. Markers stay light green-white with a dark outline.

## 1.3.1

- The flight photo is a flat rectangle in full color: scanlines, a phosphor mask, a little color fringe, and a soft glow, inside a thin border. With no photo, the same frame shows color bars and static.
- The picture is a fixed box above the route. Airport codes and city names stay in their own row, and the schedule lines no longer run into them.
- The speed list scrolls. **3D VIEW**, **ROUTE**, **FOLLOW**, **SHARE**, and **MORE** stay pinned at the bottom. **MORE** opens a second row in that bar and closes on Escape or a click outside it.

## 1.3.0

Aircraft on the globe are solid top-down silhouettes, drawn for this app in the green phosphor style. Click a plane and a flight panel opens on the left.

- **Silhouettes** for each family: Airbus and Boeing narrowbodies, widebody twins, four-engine A380 and 747, regional jet, turboprop, light aircraft, helicopter, fighter, business jet, and cargo. Ships, satellites, and weather icons use the same filled style. They point along heading and stay small. Zoomed out they are dots. Dense areas thin out. **CFG** and `size` still scale them. A selected plane is brighter, with a ring, a solid line for where it has already been, and a dashed line toward the destination when that airport is known.
- **Flight panel** shows the callsign, type-code badge, a photo when PlaneSpotters has one (with credit and a link), the operator, origin and destination, and a progress mark between them. The grid covers type, registration, country of registration, serial number, age, category, barometric altitude and flight level, GPS altitude, vertical speed, track, ground speed, true airspeed, indicated airspeed, Mach, squawk, position, and last seen. Fields the feeds do not have stay `NOT AVAILABLE`. Airspeeds computed from ground speed are marked `EST`. A collapsible graph draws the speed and altitude this contact has already reported.
- **Actions:** **3D VIEW** opens the top-right model viewer. **ROUTE** toggles the dashed leg. **FOLLOW** locks the camera. **SHARE** copies a view link. **MORE** copies the details or adds the callsign to the watchlist.
- **Model viewer** shows a realistic model on its own canvas: white airliners, a helicopter, ships, and satellites, with studio light, a ground pad, and a credit under the picture. The globe stays the green silhouettes. Authors and licences are in `THIRD_PARTY_LICENSES`.

## 1.2.0

Contacts on the globe are tiny pixel sprites again. The 3D model moves into a **MODEL VIEWER** panel at the top right. Hover or follow a contact and that panel shows a larger green model of that type, turning slowly, with the info card under it. Click still locks follow. **HIDE** collapses the panel. From the command line: `viewer`, `viewer on`, or `viewer off`. With nothing selected the panel says `NO CONTACT SELECTED` and shows a slow wireframe globe.

- **Pixel sprites** on the globe, one per aircraft family (Airbus and Boeing narrowbodies, widebody twins, four-engine A380 and 747, regional jet, turboprop, light prop, helicopter, fighter, business jet, cargo), satellite class, and ship type. Storms, quakes, and launches keep small icons. Sprites are hard-edged green phosphor, point along heading, and stay small. Zoomed out they are dots. Dense areas thin out. **CFG** has a marker size slider. `size 0.7`, `size up`, and `size down` do the same thing.
- **Model viewer** uses the same type id as the sprite. Airbus and Boeing shapes differ. Helicopter rotors and propellers spin. Aircraft tilt with vertical rate. Add a type in `src/plugins/aircraft/types.ts`, pixels in `src/plugins/aircraft/sprites.ts`, and a mesh with the same id in `src/core/models.ts`.
- **Cards** in the viewer show the fields the feed actually has: callsign, registration, full type name, operator, origin and destination, altitude, ground speed, vertical rate, heading, squawk, position, and last-seen age. The **KT** button cycles knots, mph, and km/h. Satellites show name, NORAD id, altitude, speed, period, inclination, and the next pass. Ships show name, MMSI, type, speed, course, destination, and flag. Storms, quakes, and launches keep their cards.

## 1.1.0

Aircraft, satellites, ships, storms, quakes, events, and launches are drawn as small green 3D models instead of generic markers. They point along their heading. Aircraft also tilt with vertical rate. Hover a contact for a compact card. Click to pin that card on the contact you are following, and drag the card by its title.

- **Aircraft models** follow the type family in the feed (A320, B738, A388, B77W, C172, H60, and the rest). Airbus and Boeing shapes are different. Helicopter rotors and propellers spin. If a feed has no type code, All Eyes looks the ICAO24 hex up on adsbdb and caches it. Add more types in `src/plugins/aircraft/types.ts` and a mesh with the same id in `src/core/models.ts`.
- **Cards** show the fields the feed actually has: callsign, registration, full type name, operator, origin and destination, altitude, ground speed, vertical rate, heading, squawk, position, and last-seen age. The **KT** button on the card cycles knots, mph, and km/h.
- **Satellites** have their own models (station with panels, navigation, weather, science, communications, debris) and spin slowly. The card shows name, NORAD id, altitude, speed, period, inclination, and the next pass over your pin.
- **Ships** have models for cargo, tanker, passenger, fishing, military, tug, and sailing. The card shows name, MMSI, type, speed, course, destination, and flag.
- **Storms, quakes, events, and launches** use small 3D icons and cards: a storm spiral, a quake ring, a launch rocket, storm class and wind, quake magnitude, depth, time, and place, launch vehicle, pad, and time. Radar and Kp stay as panels.
- **Less clutter.** Markers are small, scale with the camera, turn into dots when you zoom out, thin out where they pile up, and grow only while hovered or followed. Trails and the radar overlay are slimmer. **CFG** has a marker size slider. From the command line: `size 0.7`, `size up`, or `size down`.

## 1.0.0

- Full-window green 8-bit globe, with no circular mask.
- Keyless layers: aircraft, satellites, earthquakes, weather radar, Baltic ships, storms, natural events, launches, and Kp.
- Command line, time scrubber, follow camera, satellite passes, watches, radar, share link, and screenshot.
- Plugins: one module plus one registration line. See `docs/plugins.md`.
