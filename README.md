# Hu-Motian

A human radar built on an **ESP32** and an **HLK-LD2410B** 24 GHz mmWave presence sensor, with a live **3D dashboard**: a room you can orbit, the radar beam fanned across the floor, energy columns per distance band, and jointed 3D figures that walk, sit, or lie down where the radar thinks you are.

It runs two ways, both serving the same dashboard:

- **PC hub** (USB): `pc/radar.py` reads the board over USB, keeps a 24-hour activity history, beeps on arrival, and serves the dashboard. Put it behind Tailscale Serve to check it from your phone anywhere.
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

## Dashboard

- **3D view**: orbit, zoom, top-down, and sensor point of view. Auto-orbit when idle.
  - Energy columns: the radar's per-band energy (0.75 m bands). The left half of the beam is moving energy and the right half is still energy. Columns glow when they cross the trigger threshold.
  - Range shells: translucent walls at each target's distance.
  - Figures: a walking figure for a moving target, sitting on a chair or couch or lying on a bed for a still one, chosen by the zone it's in.
- **Room editor**: set room size, drag and aim the sensor, and draw zones. The zone name sets the 3D furniture: *bed*, *couch/sofa*, *desk/table*, *chair*, *door*; anything else becomes a rug.
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
firmware/        ESP32 firmware (PlatformIO, Arduino): LD2410 driver, web server, calibration
  src/ld2410.h   report + command protocol (engineering mode, params, sensitivity, range)
  embed_web.py   pre-build step: gzips the dashboard into the firmware
pc/radar.py      PC hub (USB serial -> HTTP API + dashboard, history, alerts)
pc/web/index.html  the dashboard (single file, three.js 3D view)
pc/status.py     serial diagnostic
flash.ps1        build + flash
start-hub.ps1    start the hub in the background
```
