# Hu-Motian

A human radar built on an **ESP32** and an **HLK-LD2410B** 24 GHz mmWave presence sensor, with a live **3D dashboard**: a room you can orbit, the radar beam fanned across the floor, energy columns per distance band, and jointed 3D figures that walk, sit, or lie down where the radar thinks you are.

It runs three ways, all showing the same dashboard:

- **PC hub** (USB): `pc/radar.py` reads the board over USB, keeps a 24-hour activity history, beeps on arrival, and serves the dashboard. Put it behind Tailscale Serve to check it from your phone anywhere.
- **Phone app** (USB cable): plug the ESP32 straight into an Android phone and open the app at https://real-cak3d.github.io/Hu-Motian/. No PC, no WiFi. See [Phone app](#phone-app-usb-cable).
- **Standalone** (WiFi): the ESP32 serves the dashboard itself at `http://humanradar.local/`. The 3D view needs internet to load three.js; without it, the page falls back to a 2D floor plan.

## Hardware

| LD2410B pin | ESP32 DevKit pin |
|---|---|
| 1 OUT | D4 |
| 2 TX | RX2 (GPIO16) |
| 3 RX | TX2 (GPIO17) |
| 4 GND | GND |
| 5 VCC | **VIN (5 V)**, not 3V3 |

Pin 1 is marked "1" on the radar's antenna side. TX/RX crossed the wrong way and non-default baud rates are detected automatically. Optional: buzzer on GPIO25. The onboard LED (GPIO2) lights while someone is present.

## Setup

1. **Flash the firmware** (PlatformIO): `./flash.ps1 -Port COM6`. The build gzips `pc/web/index.html` into the firmware, so the board always serves the current dashboard.
2. **WiFi** (optional, for standalone mode): on first boot, join the `HumanRadar-Setup` network from your phone and pick your home WiFi.
3. **PC hub**: `pip install pyserial`, then `./start-hub.ps1` (background) or `python pc/radar.py` (opens a window). The dashboard is at `http://127.0.0.1:8765/`.
4. **Phone via Tailscale** (optional, tailnet-only):
   ```
   tailscale serve --bg --set-path /radar http://127.0.0.1:8765
   ```
   Then open `https://<your-pc>.<tailnet>.ts.net/radar/` on your phone.

## Phone app (USB cable)

The dashboard also works as an installable phone app that reads the radar straight from a USB cable. It uses the same JSON lines the PC hub reads, so the firmware doesn't change.

1. Open **https://real-cak3d.github.io/Hu-Motian/** in **Chrome on Android**. Tap ⋮ → **Add to Home screen** (or **Install app**).
2. Plug the ESP32 into the phone. The phone powers the board and the radar.
   - Use a USB-C to USB-C cable, or an OTG adapter plus your normal USB cable.
   - If the board's red power light stays off with a USB-C to USB-C cable, use an OTG adapter with a USB-A to USB-C cable. Some DevKits' USB-C ports only take power from USB-A.
3. Tap **Connect USB** and pick **CP2102** from the list.

After that it reconnects by itself whenever you plug the board in with the app open. While connected:
- The screen stays on.
- Arrivals are kept for 24 hours on the phone.
- Calibration and sensor settings work the same as with the hub.

**What works where:**
- **Chrome on Android:** works. The page drives the DevKit's CP2102 USB chip itself over WebUSB.
- **Chrome or Edge on a PC:** **Connect USB** also works there, through Web Serial and the normal CP210x driver. Close the PC hub first, because only one program can use the port at a time.
- **iPhone / Safari:** can't. iOS doesn't let web pages use USB. Use WiFi mode (`http://humanradar.local/`) instead.

**Publishing (one time):** in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. `.github/workflows/pages.yml` then publishes `pc/web` whenever it changes on `main`.

## Ghost Hunter (paranormal investigation kit)

`pc/web/ghost.html` (+ `pc/web/ghost/*.js`) turns the phone, radar and kit modules into a ghost-hunting kit. Open it from **👻 Ghost mode** in the dashboard, from the app icon's long-press shortcut, or at https://real-cak3d.github.io/Hu-Motian/ghost.html.

**Devices** (pick one from the bar at the bottom)

| Device | What it does |
|---|---|
| Night vision | IR-style green image with grain |
| Thermal | Thermal-style iron palette made from camera brightness, a centre spot temperature and a scale bar. Phones have no heat sensor. |
| SLS camera | Dark depth image with an IR dot pattern; a stick figure is drawn wherever a "body" is detected |
| Laser grid | Green dots fixed on the room around you; anything standing in the room blocks them |
| K-II meter | 5-LED EMF meter |
| Ghost meter | Arms that rise with the field, a 12-bar graph, a needle toward the entity (or its slime trail), and a whine that climbs |
| EMF/temp meter | LCD with EMF and temperature, the RT-EMF alarm beep, and a red light |
| REM pod | Proximity LEDs around an antenna dome, escalating alarm, cold/warm LEDs |
| Spirit box | FM sweep (100/200/300 ms) with static chop |
| Word box | Picks words from sensor changes, the way the real devices do, and says them |
| EVP recorder | 15 s raw mic; reverse / slow playback, anomaly marks, WAV export |
| Radar | Heading-up scope |

The camera devices draw a found-footage overlay: REC, timestamp, battery, temperature and a mini K-II. The picture breaks up with interference as readings rise. **● REC** saves screen + sound as an evidence video, and **⚙ → Evidence log** exports every event.

**It stays where it is.**
- Orientation comes from the gyro, slowly corrected to true north by the compass. Magnetic glitches are ignored.
- The staged apparition, its cold spots, drifting orbs and shadow figures have real positions in the room around you. They keep moving while you look away.
- They're drawn in true perspective, standing on the floor, about 1.4 m below the phone.
- Apparitions are full 3D bodies (the same CC0 characters as the dashboard), animated and rendered with three.js:
  - Pale spirits are see-through and rim-lit, with hollow black eyes, and they fade out toward the feet.
  - Shadow people are smoky black shapes.
  - The Inhuman is stretched, with long arms. It crawls at you head first, and its head turns further than a human's can.
  - The Woman in white and the Banshee wear a gown, with long wet hair hanging over the face.
  - The Hat Man has his hat and red eyes.
  - Most of them turn their heads to follow you. They cock their heads, and freeze and jump like stop-motion.
  - The SLS camera draws its stick figure from the body's real bones.
  - Without WebGL, or before a model has loaded, the app draws the old 2D figures instead.
- The jump scare is a full-screen face. Its jaw stretches open while it shakes, splits into colour and drops frames.
- With headphones, footsteps, knocks and whispers come from where they actually are.
- If things slide against the real room as you turn, adjust **⚙ → Camera match**.

**Modes**
- **Real**: nothing is faked.
  - Radar hits are anchored where the radar (taped to the back of the phone, gold side out) was pointing.
  - The SLS figure, laser-grid shadow and warm thermal body come from the live radar target.
  - The EMF meters use the **Hall sensor**; temperature comes from the **thermistor**.
  - The REM pod is driven by radar proximity and the **touch antenna, IR tripwire and vibration** sensors.
  - The word box picks words from real sensor changes; the spirit box is static only.
- **Ghost**: a staged haunting with persistent, individual ghosts (below).
- **Hunt**: follows the arrow to the nearest open lead or a haunt you haven't cleared; with nothing on the map, a fresh trail.
- **Bust**: be the exterminator: beam, trap, get paid (below).

**Ghosts.** 18 kinds, from common to legendary, each with its own look, habits, voice and temper:

| Kind | Rarity | Look | Habits |
|---|---|---|---|
| Residual imprint | ★ | pale, faded | paces the same path, never notices you |
| Spirit lights | ★ | orbs | float, circle, startle |
| Wandering soul | ★ | pale | wanders, cries, may follow you |
| Ectoplasmic mist | ★★ | fog column | drifts toward warmth, very cold |
| Shadow person | ★★ | shadow | watches, peeks from doorways, vanishes when seen |
| Lost child | ★★★ | small, pale | giggles, beckons "come here", hides, points |
| Guide | ★★★ | glowing | **points the way to other spirits** |
| Woman in white | ★★★ | gown, long hair | floats, weeps, beckons |
| Poltergeist | ★★★ | invisible | knocks, throws things, flickers the lights |
| Stalker | ★★★ | shadow | only moves when you look away |
| Black dog | ★★★ | hound, red eyes | circles, growls, chases |
| Trickster | ★★★ | shadow | erratic, teleports, mimics, **lies about directions** |
| The Hat Man | ★★★★ | tall, hat, red eyes | stares, stalks, blinks closer |
| Wraith | ★★★★ | ragged, floating | circles, then dives at you |
| Revenant | ★★★★ | shadow, red eyes | hostile, runs at you |
| Banshee | ★★★★ | gown, hair | screams (the wail), swoops |
| Doppelgänger | ★★★★★ | looks like you | appears where you just looked |
| Inhuman | ★★★★★ | dark, red eyes | crawls on all fours, chases; laughs when you try to calm it |

Each ghost you meet:
- **Its own identity**: a name and story (e.g. "Lived here and drowned in the river, 1882"), a **level** (1–10) and a **hostility** (0–100%, Passive → Enraged). Together these give a **threat** rating.
- **A living mood**: its behaviour changes with its mood. Calm ones stand, wander, beckon and point. Angry ones stare you down, chase, dive and attack. Staring at a hostile one makes it angrier.
- **Your actions**: **PROVOKE** raises its hostility. **CALM** may lower it, depending on the kind.
- **Identification**: like a real investigation. Collect any **2 pieces of evidence** to reveal its name, kind and level:
  - Apparition, EMF 5, freezing temps
  - Spirit box, word box, EVP
  - SLS figure, laser grid
  The encounter card fills in as you go.
- **Containment**: hold **TRAP** (or the kit's push button). Higher levels and angrier ghosts take longer, fight back, and can break free and attack.

**The haunt map.** A ghost becomes real the first time you see it:
- **It stays.** It's saved at that GPS spot with a 30–50 ft area. Leave and its readings fade. Come back into the area and the same ghost is there, unseen until you spot it again.
- **Leads.** Guides, lost children and tricksters point. Their direction becomes a lead on the map 50–150 m away, and following it (Hunt) finds another ghost. A trickster's lead may be a lie.
- **📖 Journal**:
  - **Map**: OpenStreetMap, coloured by hostility, with open leads.
  - **Codex**: which of the 18 kinds you've discovered, identified and contained.
  - **Stats**: ghosts met, sightings, contained x of y, kinds discovered, attacks survived, escapes, provokes and calms, knocks, thrown objects, flickers, voices heard, EVP sessions and anomalies, leads, distance walked, time hunting, and the highest, angriest and rarest ghosts.
  - **Contained**: everything you've caught, with a Release option (they go home angry).
  - **Review**: the session's EMF and temperature charted second by second, with every logged event marked. Drag across the chart to scrub through what happened when.
  - **HQ**: Bust mode's bank, rank, containment unit, callouts and pay slips.

### Bust mode (be the exterminator)

1. **Find it** with the ghost meter, or follow the green slime trail it leaves on the floor.
2. **Hold FIRE** with it in your sights. The particle-thrower beam locks on and the ghost thrashes, so keep the phone on it.
   - Watch the heat bar. If it overheats, the pack vents for 3 s and the ghost gets away. **VENT** cools it early.
   - Shots that miss scorch the walls, and the damage comes off your pay.
3. **Weaken it.** Its strength bar drains while it's held. Bigger, angrier ghosts take longer.
4. **THROW TRAP.** Aim at the floor to choose where it lands. Keep firing and point at the trap: a weakened ghost goes where the beam points. When it's over the trap, the doors open and a cone of light pulls it in. The trap shuts, shakes and smokes.
5. **Get paid.** Tap the trap button to empty it into containment.
   - With GPS on, up to three **callouts** appear within about 400 m. Walk there and its ghost is waiting. Callouts pay a bonus.
   - Rank goes up with captures: Trainee, Rookie, Buster, Senior Buster, Spook Specialist, Chief of Containment.

Angry ghosts spit slime at you. Turn away to dodge it. Most of them slime you rather than scare you when they reach you; the Inhuman, Hat Man, Revenant, Wraith and Banshee still go for the scare.

**Kit:**
- The RGB LED cycles red like a power cell, and goes white-hot while firing.
- The buzzer hums while firing and beeps fast near overheat.
- The push button (TRAP) is the trigger.
- The phone vibrates while you're wrangling.

### More realism

- **Walk-around AR (Android Chrome with ARCore):** tap **AR**. The phone tracks where it is in the room, not just which way it's pointing.
  - Walk up to a ghost, round it, or away from it. Things sit on the real floor, at your real height.
  - The camera picture comes from ARCore, so the night-vision, thermal and SLS lenses become tints over it.
  - iPhones can't do this in the browser, so they keep the turn-in-place view.
- **Room light:** pale ghosts glow in a dark room and wash out in a bright one, like the real thing would.
- **Flashlight:** shadow people recoil from it and slip away. The Inhuman just gets angrier. Phones without a torch get an on-screen flashlight beam.
- **Mist** pools on the floor around the cold ones, and in a cold spot your **breath fogs**.
- **Thrown objects:** a poltergeist's throws are objects (a book, a box, a tin) that fly, bounce and then lie where they landed.
- **Sound:** ghost sounds carry a room's echo. The spirit box sweep now passes whistles between stations, scraps of music and chopped broadcast voices.

### Kit lights and sensors (optional)

Set them up in **⚙ → Hardware** while the radar is connected; the board saves the pins. Module "−" goes to GND. **Sensors go on 3V3**, because the ESP32's analog pins can't take 5 V. Suggested pins (all free on a DevKit):

| Module | Kit part | ESP32 pins |
|---|---|---|
| RGB LED | KY-016 (5 mm LED, pins − R G B) | R GPIO32, G GPIO33, B GPIO27 |
| 2nd RGB LED (mirrors the first) | KY-009 (SMD "3_Color", pins − R G B) | R GPIO19, G GPIO18, B GPIO5 |
| Temperature + humidity | DHT11 / KY-015 (blue grille) | S to GPIO26, middle pin to 3V3 |
| 2-colour LED | KY-011 / KY-029 | red GPIO22, green GPIO23 |
| 7-colour flash LED | KY-034 | GPIO21 |
| Buzzer | KY-006 / KY-012 | GPIO25 (built in) |
| Hall magnetic sensor | KY-035 / KY-024 (AO) | GPIO34 |
| Thermistor | KY-013 | GPIO35 |
| Sound sensor | KY-037 / KY-038 (AO) | GPIO39 (VN) |
| Vibration / knock / tilt | KY-002 / KY-031 / KY-020 | GPIO14 |
| Push button (physical TRAP) | KY-004 | GPIO15 |
| Touch antenna (REM pod) | KY-036 (DO) | GPIO39 (VN) |
| Light sensor | KY-018 | GPIO36 (VP) |
| IR hand sensor / tripwire | TCRT5000 line sensor or KY-032 (OUT) | GPIO13 |

What they do:
- **The lights follow the app.** The RGB LED shows the K-II colour, the REM pod gets a colour chase and two-tone alarm, there's a flicker when the ghost is near, a white strobe as it rushes you, and a scare blast.
- **Without the app,** the RGB LED shows the radar's signal strength K-II style.
- **The sensors feed Real mode** as described above. The push button works as a physical TRAP button.

Firmware commands are listed in `firmware/src/fx.h`.

## Dashboard

- **3D room**: wood floor (or your own floor-plan image), walls that cut away on the camera side, lighting and soft shadows, and furniture built from your zones.
  - Views: orbit, top-down, sensor point of view, and a follow camera. Auto-orbit when idle.
- **People**: an animated 3D human for each tracked person.
  - Walks at human speed instead of jumping, turns toward the direction of travel.
  - Walks to the desk chair or couch and sits, lies down on the bed, or stands on open floor.
  - Walks out through the door when they leave.
  - Waves when they first appear.
  - **Avatars**: pick yours from 11 characters (Casual, Hoodie, Business, Worker, Beach, Farmer, Punk, Adventurer, SWAT, King, Astronaut). The radar can't tell people apart, so the first person in view wears your avatar and everyone else gets a different one. The choice is saved with the room layout, so every device shows the same.
  - Characters are from Quaternius's [Ultimate Modular Men Pack](https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ) (CC0 public domain), in `pc/web/assets/<id>.glb` with `.webp` thumbnails. Each loads only when someone wears it. The hub serves them; the ESP32's own page loads them from Poly Pizza. If neither works, a built-in figure is used.
  - Sitting bends the joints around the person's own left-right axis rather than the rig's bone axes, so other humanoid `.glb` models can be added to the `AVATARS` list.
- **Tracking**: the raw radar is filtered into stable tracks:
  - A median filter plus an alpha-beta filter on distance, with outlier gating.
  - Walking vs still decided with hysteresis from real distance change, so fidgeting in a chair isn't "walking".
  - Zone hysteresis, so the estimate doesn't flip back and forth.
  - A second person only when two separate distances persist.
- **Radar overlays** (toggles): beam, range rings, target distance shells, and energy columns per 0.75 m band (left half moving, right half still; brighter when above the trigger).
- **Side panel**: each person's activity, zone and its likelihood, distance, approaching or receding speed, motion level, and time in view. Also today's arrivals, time present, longest and current visit, and live signal stats.
- **Room editor**: set room size, sensor height and field of view; drag and aim the sensor; draw zones; import a floor-plan image (the hub shares it with your phone). Each zone has a type, chosen explicitly or guessed from its name, and the type picks the furniture and the pose:
  - *bed*, *couch*, *desk*, *table*, *chair*: furniture people sit or lie on
  - *counter*, *tv*, *door*, *window*, *plant*: other furniture and fixtures
  - *rug*: the default for anything else
- **Charts**: energy by distance band with thresholds and the calibrated noise floor, plus distance over time.
- **Activity**: arrival/leave log with the likely zone, a 24-hour presence strip (hub mode), and a time-spent heatmap.
- **Sensor controls**: empty-room calibration (sets each band's threshold just above its measured noise), sensitivity presets, max range, clear-after delay, per-band thresholds, and factory reset.

## How placement works (and its limits)

The LD2410B measures **distance, not direction**. Distances are accurate to roughly a band. The side-to-side position is an estimate: the dashboard spreads the possible positions along the distance arc inside the sensor's field of view, weights them by the antenna's beam pattern and a simple prior, then picks the most likely spot:

- Still people are usually on a bed, couch, or desk chair.
- Moving people are usually on open floor or in a doorway.

For true X/Y positions, add a second radar on another wall (triangulation) or use an LD2450.

## Firmware protocol

The ESP32 prints JSON lines over USB at 115200 baud:

- `{"t":"r",...}`: reading, 10 per second, with per-band energies `mg`/`sg`.
- `{"t":"st",...}`: status and sensor config, every 2 s.
- `{"t":"ack",...}`: command replies.

Commands (USB line or `GET /cmd?c=`):

```
status | params | cal <secs> [delay] [margin] | cal stop | sens <gate|all> <move> <still>
range <moveGate> <stillGate> <idleSecs> | hold <ms> | eng <0|1> | factory
```

## Layout

```
firmware/        ESP32 firmware (PlatformIO, Arduino): LD2410 driver, web server, calibration, kit modules (fx.h)
  src/ld2410.h   report + command protocol (engineering mode, params, sensitivity, range)
  embed_web.py   pre-build step: gzips the dashboard into the firmware
pc/radar.py      PC hub (USB serial -> HTTP API + dashboard, history, alerts)
pc/web/index.html  the dashboard (single file, three.js 3D view; also the phone app, with USB support)
pc/web/ghost.html, ghost/*.js  Ghost Hunter: engine (sensors, link, audio), spirits (bestiary, behaviour, haunt map, stats), ghost3d (3D apparitions),
                 bust (Bust mode), ambient (room light, flashlight, mist, breath, thrown objects), review (evidence timeline), xr (walk-around AR), view (devices, drawing, UI)
pc/web/manifest.webmanifest, sw.js, icon-*.png  phone app install + offline files
.github/workflows/pages.yml  publishes pc/web to GitHub Pages
pc/status.py     serial diagnostic
flash.ps1        build + flash
start-hub.ps1    start the hub in the background
```
