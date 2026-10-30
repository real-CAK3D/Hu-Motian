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

`pc/web/ghost.html` (+ `pc/web/ghost/engine.js`, `view.js`) turns the phone, radar and kit modules into a ghost-hunting kit. Open it from **👻 Ghost mode** in the dashboard, from the app icon's long-press shortcut, or at https://real-cak3d.github.io/Hu-Motian/ghost.html.

**Devices** (pick one from the bar at the bottom)

| Device | What it does |
|---|---|
| Night vision | IR-style green image with grain |
| Thermal | Thermal-style iron palette made from camera brightness, a centre spot temperature and a scale bar. Phones have no heat sensor. |
| SLS camera | Dark depth image with an IR dot pattern; a stick figure is drawn wherever a "body" is detected |
| Laser grid | Green dots fixed on the room around you; anything standing in the room blocks them |
| K-II meter | 5-LED EMF meter |
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
- With headphones, footsteps, knocks and whispers come from where they actually are.
- If things slide against the real room as you turn, adjust **⚙ → Camera match**.

**Modes**
- **Real**: nothing is faked.
  - Radar hits are anchored where the radar (taped to the back of the phone, gold side out) was pointing.
  - The SLS stick figure, the laser-grid shadow and the warm thermal body come from the live radar target.
  - The EMF meters use the **Hall sensor** if one is set up (a real magnetic field), otherwise the radar return.
  - Temperature comes from the **thermistor**. The REM pod is driven by radar proximity and the **vibration** sensor.
  - The word box picks words from real sensor changes. The spirit box is static only.
- **Ghost**: a staged haunting, made up by the app.
  - EMF fluctuations, orbs, a human-scale shadow figure, cold spots (thermal + temperature drop) and knocks.
  - Footsteps and whispers, spirit-box and word-box words, and a whisper planted in EVP recordings.
  - It creeps closer and relocates when stared at. After a while it waits behind you until you turn around.
  - Hold **TRAP** to contain it, or it rushes you (jump scare).
- **Hunt**: an outdoor GPS chase that ends in a staged encounter.

### Kit lights and sensors (optional)

Set them up in **⚙ → Hardware** while the radar is connected; the board saves the pins. Module "−" goes to GND. **Sensors go on 3V3**, because the ESP32's analog pins can't take 5 V. Suggested pins (all free on a DevKit):

| Module | Kit part | ESP32 pins |
|---|---|---|
| RGB LED | KY-016 / KY-009 | R GPIO32, G GPIO33, B GPIO27 |
| 2-colour LED | KY-011 / KY-029 | red GPIO22, green GPIO23 |
| 7-colour flash LED | KY-034 | GPIO19 |
| Buzzer | KY-006 / KY-012 | GPIO25 (built in) |
| Hall magnetic sensor | KY-035 / KY-024 (AO) | GPIO34 |
| Thermistor | KY-013 | GPIO35 |
| Sound sensor | KY-037 / KY-038 (AO) | GPIO39 (VN) |
| Vibration / knock / tilt | KY-002 / KY-031 / KY-020 | GPIO18 |

What they do:
- **The lights follow the app.** The RGB LED shows the K-II colour, the REM pod gets a colour chase and two-tone alarm, there's a flicker when the ghost is near, a white strobe as it rushes you, and a scare blast.
- **Without the app,** the RGB LED shows the radar's signal strength K-II style.
- **The sensors feed Real mode** as described above.

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
pc/web/ghost.html, ghost/*.js  Ghost Hunter: 11 investigation devices, world-anchored AR, kit lights/sensors
pc/web/manifest.webmanifest, sw.js, icon-*.png  phone app install + offline files
.github/workflows/pages.yml  publishes pc/web to GitHub Pages
pc/status.py     serial diagnostic
flash.ps1        build + flash
start-hub.ps1    start the hub in the background
```
