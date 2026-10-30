// Optional extras from a sensor kit (KY-0xx modules): lights, buzzer patterns and extra sensors.
// Nothing is enabled until it's set up with "hw ..." commands (the Ghost Hunter app's Hardware
// settings send them); the setup is saved in flash.
//
// Setup (pins are ESP32 GPIO numbers):
//   hw rgb <r> <g> <b> [anode]   RGB LED, KY-016 / KY-009 (anode=1 for common-anode LEDs)
//   hw led2 <red> <green>        two-colour LED, KY-011 / KY-029
//   hw flash <pin>               7-colour auto-flash LED, KY-034 (on/off only)
//   hw hall <pin>                analog Hall magnetic sensor, KY-035 / KY-024 AO (ADC1 pin)
//   hw temp <pin> [invert]       analog thermistor, KY-013 (ADC1 pin; invert=1 if it reads backwards)
//   hw sound <pin>               sound sensor analog out, KY-037 / KY-038 AO (ADC1 pin)
//   hw vib <pin>                 vibration / knock / tilt switch, KY-002 / KY-031 / KY-020 (digital)
//   hw btn <pin>                 push button, KY-004 (to GND when pressed): a physical TRAP button
//   hw touch <pin>               touch sensor digital out, KY-036: a REM-pod style antenna
//   hw light <pin>               photoresistor, KY-018 (ADC1 pin)
//   hw ir <pin>                  IR obstacle sensor, KY-032 (LOW when something's in front): a tripwire
//   hw off <name> | hw clear
// Live control (the app drives the lights for 4 s after each command, then the radar does again):
//   led <r> <g> <b> | led2 <red> <green> | flash <0|1> | beep <hz> <ms>
//   fx <off|flicker|strobe|pulse|scare|alarm> [ms] [r g b]
// Readings add "hw":{"hall","hd","tc","snd","vib","btn","tch","lux","ir"} to the radar JSON; status adds "hwc" (the setup).
#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include <cmath>

namespace fx {

struct Cfg {
  uint8_t ver = 2;
  int8_t r = -1, g = -1, b = -1, anode = 0;
  int8_t l2r = -1, l2g = -1;
  int8_t flash = -1;
  int8_t hall = -1, temp = -1, tempInv = 0, snd = -1, vib = -1;
  int8_t btn = -1, touch = -1, light = -1, ir = -1;
};

static Cfg cfg;
// LEDC: channel 0 is the buzzer (its timer changes frequency), so the LEDs use channels 2-6.
static const int CH_BUZZ = 0, CH_R = 2, CH_G = 3, CH_B = 4, CH_L2R = 5, CH_L2G = 6;

enum Effect { E_NONE, E_FLICKER, E_STROBE, E_PULSE, E_SCARE, E_ALARM };
static Effect eff = E_NONE;
static uint32_t effStart = 0, effUntil = 0, appUntil = 0, beepOff = 0;
static uint8_t effR = 255, effG = 255, effB = 255;
static int lastStep = -1;
static bool effBuzz = false;

static int hallRaw = 0;
static float hallBase = -1, tempC = NAN;
static int sndMin = 4095, sndMax = 0, sndP2P = 0;
static uint32_t sndT = 0, hallT = 0, tempT = 0, hallSince = 0;
static volatile uint32_t vibCount = 0;
static uint32_t vibSent = 0;
static bool touchLatch = false, irLatch = false;
static int lightRaw = 0;

static void IRAM_ATTR vibIsr() { vibCount++; }

static bool okOut(int p) {
  static const int8_t P[] = {5, 13, 14, 15, 18, 19, 21, 22, 23, 26, 27, 32, 33};
  for (int8_t q : P) if (p == q) return true;
  return false;
}
static bool okAdc(int p) { return p == 32 || p == 33 || p == 34 || p == 35 || p == 36 || p == 39; }
static bool okIn(int p) { return okOut(p) || okAdc(p); }

// ---- outputs ----
static void pwm(int8_t pin, int ch, uint8_t v) {
  if (pin < 0) return;
  bool inv = cfg.anode && ch <= CH_B;
  ledcWrite(ch, inv ? 255 - v : v);
}
static void rgb(uint8_t r, uint8_t g, uint8_t b) { pwm(cfg.r, CH_R, r); pwm(cfg.g, CH_G, g); pwm(cfg.b, CH_B, b); }
static void led2(uint8_t r, uint8_t g) { pwm(cfg.l2r, CH_L2R, r); pwm(cfg.l2g, CH_L2G, g); }
static void flashLed(bool on) { if (cfg.flash >= 0) digitalWrite(cfg.flash, on ? HIGH : LOW); }
static void buzz(uint32_t hz) { ledcWriteTone(CH_BUZZ, hz); }
static void beep(uint32_t hz, uint32_t ms) { buzz(hz); beepOff = millis() + ms; }

// ---- pin setup ----
static void attachPwm(int8_t pin, int ch) {
  if (pin < 0) return;
  ledcSetup(ch, 5000, 8);
  ledcAttachPin(pin, ch);
  pwm(pin, ch, 0);
}
static void releasePin(int8_t pin, bool isPwm) {
  if (pin < 0) return;
  if (isPwm) ledcDetachPin(pin);
  pinMode(pin, INPUT);
}
static void release(const Cfg &c) {
  releasePin(c.r, true); releasePin(c.g, true); releasePin(c.b, true);
  releasePin(c.l2r, true); releasePin(c.l2g, true);
  releasePin(c.flash, false); releasePin(c.hall, false); releasePin(c.temp, false); releasePin(c.snd, false);
  releasePin(c.btn, false); releasePin(c.touch, false); releasePin(c.light, false); releasePin(c.ir, false);
  if (c.vib >= 0) { detachInterrupt(digitalPinToInterrupt(c.vib)); releasePin(c.vib, false); }
}
static void apply() {
  attachPwm(cfg.r, CH_R); attachPwm(cfg.g, CH_G); attachPwm(cfg.b, CH_B);
  attachPwm(cfg.l2r, CH_L2R); attachPwm(cfg.l2g, CH_L2G);
  if (cfg.flash >= 0) { pinMode(cfg.flash, OUTPUT); digitalWrite(cfg.flash, LOW); }
  if (cfg.hall >= 0) { pinMode(cfg.hall, INPUT); hallBase = -1; hallSince = millis(); }
  if (cfg.temp >= 0) { pinMode(cfg.temp, INPUT); tempC = NAN; }
  if (cfg.snd >= 0) pinMode(cfg.snd, INPUT);
  if (cfg.vib >= 0) { pinMode(cfg.vib, INPUT_PULLUP); attachInterrupt(digitalPinToInterrupt(cfg.vib), vibIsr, CHANGE); }
  if (cfg.btn >= 0) pinMode(cfg.btn, INPUT_PULLUP);
  if (cfg.touch >= 0) pinMode(cfg.touch, INPUT);
  if (cfg.light >= 0) pinMode(cfg.light, INPUT);
  if (cfg.ir >= 0) pinMode(cfg.ir, INPUT_PULLUP);
}
static void load(Preferences &prefs) {
  if (prefs.getBytesLength("hw") == sizeof(Cfg)) {
    Cfg c;
    prefs.getBytes("hw", &c, sizeof(Cfg));
    if (c.ver == 2) cfg = c;
  }
  apply();
}

// ---- commands ----
// Returns -1 if the verb isn't ours, otherwise 1 = ok, 0 = failed (msg says why).
static int handle(const String &verb, const String &rest, String &msg, Preferences &prefs) {
  String tok[6];
  int n = 0;
  {
    String r = rest;
    r.trim();
    while (r.length() && n < 6) {
      int e = r.indexOf(' ');
      tok[n++] = e < 0 ? r : r.substring(0, e);
      r = e < 0 ? "" : r.substring(e + 1);
      r.trim();
    }
  }
  auto num = [&](int i, int d) { return i < n ? (int)tok[i].toInt() : d; };
  uint32_t now = millis();

  if (verb == "hw") {
    if (n < 1) { msg = "hw <rgb|led2|flash|hall|temp|sound|vib|off|clear> ..."; return 0; }
    Cfg old = cfg, c = cfg;
    String what = tok[0];
    if (what == "clear") c = Cfg();
    else if (what == "off") {
      String w = n > 1 ? tok[1] : "";
      if (w == "rgb") c.r = c.g = c.b = -1;
      else if (w == "led2") c.l2r = c.l2g = -1;
      else if (w == "flash") c.flash = -1;
      else if (w == "hall") c.hall = -1;
      else if (w == "temp") c.temp = -1;
      else if (w == "sound") c.snd = -1;
      else if (w == "vib") c.vib = -1;
      else if (w == "btn") c.btn = -1;
      else if (w == "touch") c.touch = -1;
      else if (w == "light") c.light = -1;
      else if (w == "ir") c.ir = -1;
      else { msg = "unknown module"; return 0; }
    } else if (what == "rgb") {
      if (n < 4 || !okOut(num(1, -1)) || !okOut(num(2, -1)) || !okOut(num(3, -1))) { msg = "hw rgb <r> <g> <b> [anode]: pins must be free output pins"; return 0; }
      c.r = num(1, -1); c.g = num(2, -1); c.b = num(3, -1); c.anode = num(4, 0) ? 1 : 0;
    } else if (what == "led2") {
      if (n < 3 || !okOut(num(1, -1)) || !okOut(num(2, -1))) { msg = "hw led2 <red> <green>: pins must be free output pins"; return 0; }
      c.l2r = num(1, -1); c.l2g = num(2, -1);
    } else if (what == "flash") {
      if (!okOut(num(1, -1))) { msg = "hw flash <pin>: must be a free output pin"; return 0; }
      c.flash = num(1, -1);
    } else if (what == "btn" || what == "touch" || what == "ir") {
      if (!okIn(num(1, -1))) { msg = "hw " + what + " <pin>: not a usable input pin"; return 0; }
      (what == "btn" ? c.btn : what == "touch" ? c.touch : c.ir) = num(1, -1);
    } else if (what == "hall" || what == "temp" || what == "sound" || what == "light") {
      int p = num(1, -1);
      if (!okAdc(p)) { msg = "analog sensors need an ADC1 pin: 32, 33, 34, 35, 36 or 39"; return 0; }
      if (what == "hall") c.hall = p;
      else if (what == "temp") { c.temp = p; c.tempInv = num(2, 0) ? 1 : 0; }
      else if (what == "light") c.light = p;
      else c.snd = p;
    } else if (what == "vib") {
      if (!okIn(num(1, -1))) { msg = "hw vib <pin>: not a usable input pin"; return 0; }
      c.vib = num(1, -1);
    } else { msg = "unknown module"; return 0; }
    // the same pin can't do two jobs
    int8_t used[] = {c.r, c.g, c.b, c.l2r, c.l2g, c.flash, c.hall, c.temp, c.snd, c.vib, c.btn, c.touch, c.light, c.ir};
    const int nUsed = sizeof(used) / sizeof(used[0]);
    for (int i = 0; i < nUsed; i++)
      for (int j = i + 1; j < nUsed; j++)
        if (used[i] >= 0 && used[i] == used[j]) { msg = "GPIO" + String(used[i]) + " is already used by another module"; return 0; }
    release(old);
    cfg = c;
    apply();
    prefs.putBytes("hw", &cfg, sizeof(Cfg));
    msg = "saved";
    return 1;
  }
  if (verb == "led") { rgb(constrain(num(0, 0), 0, 255), constrain(num(1, 0), 0, 255), constrain(num(2, 0), 0, 255)); appUntil = now + 4000; eff = E_NONE; return 1; }
  if (verb == "led2") { led2(constrain(num(0, 0), 0, 255), constrain(num(1, 0), 0, 255)); appUntil = now + 4000; return 1; }
  if (verb == "flash") { flashLed(num(0, 0) != 0); appUntil = now + 4000; return 1; }
  if (verb == "beep") { beep(constrain(num(0, 2000), 0, 8000), constrain(num(1, 100), 0, 3000)); return 1; }
  if (verb == "fx") {
    String w = n ? tok[0] : "off";
    Effect e = w == "flicker" ? E_FLICKER : w == "strobe" ? E_STROBE : w == "pulse" ? E_PULSE : w == "scare" ? E_SCARE : w == "alarm" ? E_ALARM : E_NONE;
    if (e == E_NONE && w != "off") { msg = "fx <off|flicker|strobe|pulse|scare|alarm> [ms] [r g b]"; return 0; }
    if (effBuzz) buzz(0);
    eff = e;
    effStart = now;
    effUntil = now + constrain(num(1, 1500), 50, 20000);
    effR = constrain(num(2, 255), 0, 255); effG = constrain(num(3, 255), 0, 255); effB = constrain(num(4, 255), 0, 255);
    lastStep = -1;
    effBuzz = false;
    appUntil = effUntil;
    if (e == E_NONE) { rgb(0, 0, 0); led2(0, 0); flashLed(false); }
    return 1;
  }
  return -1;
}

// ---- effects ----
static void runEffect(uint32_t now) {
  uint32_t t = now - effStart;
  switch (eff) {
    case E_FLICKER: {  // a failing bulb
      int v = random(100) < 18 ? 0 : random(40, 256);
      rgb(effR * v / 255, effG * v / 255, effB * v / 255);
      led2(random(100) < 30 ? 255 : 0, 0);
      flashLed(random(100) < 8);
      break;
    }
    case E_STROBE: {
      bool on = (t / 55) % 2 == 0;
      rgb(on ? effR : 0, on ? effG : 0, on ? effB : 0);
      led2(on ? 255 : 0, on ? 255 : 0);
      flashLed(on);
      break;
    }
    case E_PULSE: {  // slow breathing
      float k = (sinf(t * 6.2832f / 1400.0f) + 1) / 2;
      rgb(effR * k, effG * k, effB * k);
      led2(0, 255 * k);
      break;
    }
    case E_SCARE: {  // white blast, then red/white strobe with a screech
      int step = t / 45;
      bool on = step % 2 == 0;
      if (t < 160) { rgb(255, 255, 255); flashLed(true); led2(255, 255); }
      else { rgb(255, on ? 255 : 0, on ? 255 : 0); led2(on ? 255 : 0, 0); flashLed(on); }
      if (step != lastStep) { lastStep = step; effBuzz = true; buzz(t < 1000 ? random(900, 2800) : 0); }
      break;
    }
    case E_ALARM: {  // REM-pod style: colours chase, two-tone beeps
      int step = t / 160;
      if (step != lastStep) {
        lastStep = step;
        static const uint8_t C[4][3] = {{255, 0, 0}, {255, 180, 0}, {0, 255, 0}, {0, 80, 255}};
        const uint8_t *c = C[step % 4];
        rgb(c[0], c[1], c[2]);
        led2(step % 2 ? 255 : 0, step % 2 ? 0 : 255);
        flashLed(step % 2);
        effBuzz = true;
        buzz(step % 2 ? 2400 : 1800);
      }
      break;
    }
    default: break;
  }
}

// What the lights do on their own: a K-II style colour from the radar's signal strength.
static void autoLights(bool present, int energy) {
  if (!present) { rgb(0, 18, 0); led2(0, 40); flashLed(false); return; }
  if (energy < 30) rgb(0, 255, 0);
  else if (energy < 55) rgb(200, 255, 0);
  else if (energy < 80) rgb(255, 120, 0);
  else rgb(255, 0, 0);
  led2(255, 0);
  flashLed(energy >= 80);
}

static void tick(bool present, int energy) {
  uint32_t now = millis();
  // sensors
  if (cfg.snd >= 0) {
    int v = analogRead(cfg.snd);
    if (v < sndMin) sndMin = v;
    if (v > sndMax) sndMax = v;
    if (now - sndT >= 100) { sndP2P = sndMax - sndMin; sndMin = 4095; sndMax = 0; sndT = now; }
  }
  if (cfg.hall >= 0 && now - hallT >= 20) {
    hallT = now;
    hallRaw = analogRead(cfg.hall);
    // baseline: settle quickly at first, then follow slow drift but not short spikes
    float k = now - hallSince < 2000 ? 0.2f : fabsf(hallRaw - hallBase) < 60 ? 0.002f : 0.0003f;
    hallBase = hallBase < 0 ? hallRaw : hallBase + (hallRaw - hallBase) * k;
  }
  if (cfg.temp >= 0 && now - tempT >= 1000) {
    tempT = now;
    long sum = 0;
    for (int i = 0; i < 8; i++) sum += analogRead(cfg.temp);
    float raw = sum / 8.0f;
    if (raw > 5 && raw < 4090) {
      // 10k NTC (beta 3950) in a divider with 10k; KY-013 boards differ in which side is which
      float r = cfg.tempInv ? 10000.0f * raw / (4095.0f - raw) : 10000.0f * (4095.0f - raw) / raw;
      float c = 1.0f / (1.0f / 298.15f + logf(r / 10000.0f) / 3950.0f) - 273.15f;
      tempC = std::isnan(tempC) ? c : tempC + (c - tempC) * 0.3f;
    }
  }
  if (cfg.touch >= 0 && digitalRead(cfg.touch) == HIGH) touchLatch = true;
  if (cfg.ir >= 0 && digitalRead(cfg.ir) == LOW) irLatch = true;
  static uint32_t lightT = 0;
  if (cfg.light >= 0 && now - lightT >= 50) { lightT = now; lightRaw = analogRead(cfg.light); }
  // outputs
  if (beepOff && now > beepOff) { buzz(0); beepOff = 0; }
  if (eff != E_NONE && now >= effUntil) {
    if (effBuzz) buzz(0);
    eff = E_NONE;
    effBuzz = false;
  }
  if (eff != E_NONE) runEffect(now);
  else if (now >= appUntil) autoLights(present, energy);
}

static bool anySensor() { return cfg.hall >= 0 || cfg.temp >= 0 || cfg.snd >= 0 || cfg.vib >= 0 || cfg.btn >= 0 || cfg.touch >= 0 || cfg.light >= 0 || cfg.ir >= 0; }

static void appendReading(String &s) {
  if (!anySensor()) return;
  s += ",\"hw\":{";
  bool first = true;
  auto key = [&](const char *k) { if (!first) s += ','; first = false; s += '"'; s += k; s += "\":"; };
  if (cfg.hall >= 0) { key("hall"); s += hallRaw; key("hd"); s += (int)(hallRaw - (hallBase < 0 ? hallRaw : hallBase)); }
  if (cfg.temp >= 0) { key("tc"); if (std::isnan(tempC)) s += "null"; else s += String(tempC, 1); }
  if (cfg.snd >= 0) { key("snd"); s += sndP2P; }
  if (cfg.vib >= 0) { uint32_t v = vibCount; key("vib"); s += v - vibSent; vibSent = v; }
  if (cfg.btn >= 0) { key("btn"); s += digitalRead(cfg.btn) == LOW ? 1 : 0; }
  if (cfg.touch >= 0) { key("tch"); s += touchLatch ? 1 : 0; touchLatch = false; }
  if (cfg.light >= 0) { key("lux"); s += lightRaw; }
  if (cfg.ir >= 0) { key("ir"); s += irLatch ? 1 : 0; irLatch = false; }
  s += '}';
}

static void appendStatus(String &s) {
  s += ",\"hwc\":{";
  s += "\"rgb\":["; s += cfg.r; s += ','; s += cfg.g; s += ','; s += cfg.b; s += ','; s += cfg.anode; s += ']';
  s += ",\"led2\":["; s += cfg.l2r; s += ','; s += cfg.l2g; s += ']';
  s += ",\"flash\":"; s += cfg.flash;
  s += ",\"hall\":"; s += cfg.hall;
  s += ",\"temp\":["; s += cfg.temp; s += ','; s += cfg.tempInv; s += ']';
  s += ",\"sound\":"; s += cfg.snd;
  s += ",\"vib\":"; s += cfg.vib;
  s += ",\"btn\":"; s += cfg.btn;
  s += ",\"touch\":"; s += cfg.touch;
  s += ",\"light\":"; s += cfg.light;
  s += ",\"ir\":"; s += cfg.ir;
  s += '}';
}

}  // namespace fx
