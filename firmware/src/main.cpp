// Human Radar: ESP32 DevKit + HLK-LD2410B 24 GHz presence radar.
//
// Wiring (LD2410B pin -> ESP32): 1 OUT -> D4, 2 TX -> RX2 (GPIO16), 3 RX -> TX2 (GPIO17),
// 4 GND -> GND, 5 VCC -> VIN (5 V). Swapped TX/RX and other baud rates are auto-detected.
//
// Outputs, all as JSON lines (same objects over USB serial and the web API):
//   {"t":"r",...}   radar reading, 10 per second, with per-gate energies (engineering mode)
//   {"t":"st",...}  status/config, every 2 s and after each command
//   {"t":"ack",...} reply to a command
// Commands (USB serial line or GET /cmd?c=...):
//   status | params | cal <secs> [delay] | cal stop | sens <gate|all> <move> <still>
//   range <moveGate> <stillGate> <idleSecs> | hold <ms> | factory | eng <0|1>
// Web: /  dashboard (gzipped, built from pc/web/index.html), /data, /cmd, /room (GET/POST).

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include "ld2410.h"
#include "web_gz.h"

static const int PIN_A = 16, PIN_B = 17, PIN_OUT = 4, PIN_LED = 2, PIN_BUZZ = 25;
static const uint32_t BAUDS[] = {256000, 115200, 57600, 38400, 9600};

HardwareSerial radarSerial(2);
ld2410::Radar radar;
WebServer web(80);
WiFiManager wm;
Preferences prefs;

bool sensorOk = false, present = false, mdnsUp = false;
uint32_t buzzOffAt = 0, linkBaud = 0, lastHitMs = 0, presenceSince = 0, holdMs = 3000;
String wiringNote = "searching";
int idle16 = -1, idle17 = -1;

// ---- calibration: record the empty-room noise floor per gate, then set thresholds above it ----
enum CalState { CAL_IDLE, CAL_WAIT, CAL_RUN, CAL_DONE, CAL_FAIL };
CalState calState = CAL_IDLE;
uint32_t calStart = 0, calDelayMs = 0, calRunMs = 0;
uint8_t calMove[ld2410::GATES], calStill[ld2410::GATES];
uint8_t calMargin = 12;
String calMsg = "";

// ---------------------------------------------------------------------------------------------

void readIdleLevels() {
  radarSerial.end();
  pinMode(PIN_A, INPUT_PULLDOWN);
  pinMode(PIN_B, INPUT_PULLDOWN);
  delay(5);
  int a = 0, b = 0;
  for (int i = 0; i < 200; i++) { a += digitalRead(PIN_A); b += digitalRead(PIN_B); delayMicroseconds(50); }
  idle16 = a / 2;
  idle17 = b / 2;
}

bool tryLink(int rx, int tx, uint32_t baud, uint32_t windowMs) {
  radarSerial.end();
  radarSerial.setRxBufferSize(1024);
  radarSerial.begin(baud, SERIAL_8N1, rx, tx);
  radar.attach(&radarSerial);
  uint32_t f0 = radar.frames, t0 = millis();
  while (millis() - t0 < windowMs) {
    radar.poll();
    if (radar.frames - f0 >= 2) { linkBaud = baud; return true; }
    delay(2);
  }
  return false;
}

bool probeLink(uint32_t windowMs) {
  readIdleLevels();
  for (int swap = 0; swap < 2; swap++)
    for (uint32_t baud : BAUDS)
      if (tryLink(swap ? PIN_B : PIN_A, swap ? PIN_A : PIN_B, baud, windowMs)) {
        wiringNote = swap ? "OK (TX/RX swapped, handled in software)" : "OK";
        return true;
      }
  wiringNote = "NO DATA from LD2410: check VCC->VIN, GND, TX->RX2, RX->TX2";
  return false;
}

void configureSensor() {
  radar.setEngineering(true);
  radar.readParams();
  radar.readFirmware();
}

// ---- JSON ------------------------------------------------------------------------------------

void appendArr(String &s, const uint8_t *a, int n) {
  s += '[';
  for (int i = 0; i < n; i++) { if (i) s += ','; s += a[i]; }
  s += ']';
}

String readingJson() {
  const ld2410::Report &r = radar.rep;
  bool fresh = sensorOk && millis() - radar.lastFrameMs < 1000;
  String s;
  s.reserve(260);
  s += "{\"t\":\"r\",\"ms\":"; s += millis();
  s += ",\"ok\":"; s += fresh ? "true" : "false";
  s += ",\"p\":"; s += present ? 1 : 0;
  s += ",\"s\":"; s += fresh ? r.state : 0;
  s += ",\"md\":"; s += r.moveCm;   s += ",\"me\":"; s += r.moveEnergy;
  s += ",\"sd\":"; s += r.stillCm;  s += ",\"se\":"; s += r.stillEnergy;
  s += ",\"dd\":"; s += r.detectCm;
  s += ",\"o\":"; s += digitalRead(PIN_OUT);
  s += ",\"for\":"; s += present ? (millis() - presenceSince) / 1000 : 0;
  if (r.engineering) {
    s += ",\"mg\":"; appendArr(s, r.moveGates, ld2410::GATES);
    s += ",\"sg\":"; appendArr(s, r.stillGates, ld2410::GATES);
    if (r.light >= 0) { s += ",\"lt\":"; s += r.light; }
  }
  s += '}';
  return s;
}

const char *calName() {
  switch (calState) {
    case CAL_WAIT: return "wait";
    case CAL_RUN: return "run";
    case CAL_DONE: return "done";
    case CAL_FAIL: return "fail";
    default: return "idle";
  }
}

String statusJson() {
  const ld2410::Params &p = radar.params;
  String s;
  s.reserve(700);
  s += "{\"t\":\"st\",\"ok\":"; s += sensorOk ? "true" : "false";
  s += ",\"wiring\":\""; s += wiringNote; s += '"';
  s += ",\"baud\":"; s += linkBaud;
  s += ",\"eng\":"; s += radar.rep.engineering ? "true" : "false";
  s += ",\"fw\":\""; s += radar.firmware; s += '"';
  s += ",\"frames\":"; s += radar.frames;
  s += ",\"up\":"; s += millis() / 1000;
  s += ",\"hold\":"; s += holdMs;
  s += ",\"ip\":\""; s += WiFi.isConnected() ? WiFi.localIP().toString() : String(""); s += '"';
  s += ",\"ssid\":\""; s += WiFi.isConnected() ? WiFi.SSID() : String(""); s += '"';
  s += ",\"rssi\":"; s += WiFi.isConnected() ? WiFi.RSSI() : 0;
  s += ",\"portal\":"; s += (!WiFi.isConnected() && wm.getConfigPortalActive()) ? "true" : "false";
  if (p.valid) {
    s += ",\"cfg\":{\"maxg\":"; s += p.maxGate;
    s += ",\"mmg\":"; s += p.maxMoveGate;
    s += ",\"msg\":"; s += p.maxStillGate;
    s += ",\"idle\":"; s += p.idleSecs;
    s += ",\"ms\":"; appendArr(s, p.moveSens, ld2410::GATES);
    s += ",\"ss\":"; appendArr(s, p.stillSens, ld2410::GATES);
    s += '}';
  }
  s += ",\"cal\":{\"state\":\""; s += calName(); s += '"';
  if (calState == CAL_WAIT) { s += ",\"left\":"; s += (calDelayMs - (millis() - calStart)) / 1000 + 1; }
  if (calState == CAL_RUN) { s += ",\"left\":"; s += (calDelayMs + calRunMs - (millis() - calStart)) / 1000 + 1; }
  if (calState == CAL_DONE || calState == CAL_RUN) {
    s += ",\"nm\":"; appendArr(s, calMove, ld2410::GATES);
    s += ",\"ns\":"; appendArr(s, calStill, ld2410::GATES);
  }
  if (calMsg.length()) { s += ",\"msg\":\""; s += calMsg; s += '"'; }
  s += '}';
  s += ",\"diag\":{\"idle16\":"; s += idle16; s += ",\"idle17\":"; s += idle17; s += '}';
  s += '}';
  return s;
}

String ack(const String &cmd, bool ok, const String &msg) {
  String s = "{\"t\":\"ack\",\"cmd\":\"" + cmd + "\",\"ok\":" + (ok ? "true" : "false") +
             ",\"msg\":\"" + msg + "\"}";
  return s;
}

// ---- commands --------------------------------------------------------------------------------

String runCommand(String line) {
  line.trim();
  String c = line;
  c.replace("\"", "'");
  c.replace("\\", "/");
  int sp = line.indexOf(' ');
  String verb = sp < 0 ? line : line.substring(0, sp);
  String rest = sp < 0 ? "" : line.substring(sp + 1);
  long a[4] = {0, 0, 0, 0};
  int na = 0;
  String all = "";
  {
    String r = rest;
    while (r.length() && na < 4) {
      r.trim();
      int e = r.indexOf(' ');
      String tok = e < 0 ? r : r.substring(0, e);
      if (tok == "all") { all = tok; a[na++] = -1; }
      else if (tok == "stop") { all = tok; na++; }
      else a[na++] = tok.toInt();
      r = e < 0 ? "" : r.substring(e + 1);
    }
  }

  if (verb == "status") return ack(c, true, "");
  if (verb == "params") {
    bool ok = radar.readParams();
    return ack(c, ok, ok ? "" : "sensor did not answer");
  }
  if (verb == "eng") {
    bool ok = radar.setEngineering(na < 1 || a[0] != 0);
    return ack(c, ok, ok ? "" : "sensor did not answer");
  }
  if (verb == "hold" && na >= 1) {
    holdMs = constrain(a[0], 0, 60000);
    prefs.putUInt("hold", holdMs);
    return ack(c, true, "");
  }
  if (verb == "sens" && na >= 3) {
    int gate = a[0];
    if (gate > 8) return ack(c, false, "gate must be 0-8 or all");
    bool ok = radar.setSensitivity(gate, constrain(a[1], 0, 100), constrain(a[2], 0, 100));
    radar.readParams();
    return ack(c, ok, ok ? "" : "sensor rejected the setting");
  }
  if (verb == "range" && na >= 3) {
    bool ok = radar.setRange(constrain(a[0], 2, 8), constrain(a[1], 2, 8), constrain(a[2], 0, 65535));
    radar.readParams();
    return ack(c, ok, ok ? "" : "sensor rejected the setting");
  }
  if (verb == "factory") {
    bool ok = radar.factoryReset();
    delay(1500);
    sensorOk = probeLink(400);
    if (sensorOk) configureSensor();
    return ack(c, ok, ok ? "restored factory settings" : "sensor did not answer");
  }
  if (verb == "cal") {
    if (all == "stop") { calState = CAL_IDLE; calMsg = "cancelled"; return ack(c, true, ""); }
    if (!sensorOk) return ack(c, false, "sensor not connected");
    calRunMs = constrain(na >= 1 ? a[0] : 30, 5, 300) * 1000UL;
    calDelayMs = constrain(na >= 2 ? a[1] : 10, 0, 120) * 1000UL;
    if (na >= 3) calMargin = constrain(a[2], 3, 40);
    memset(calMove, 0, sizeof(calMove));
    memset(calStill, 0, sizeof(calStill));
    calStart = millis();
    calState = CAL_WAIT;
    calMsg = "leave the area";
    return ack(c, true, "");
  }
  return ack(c, false, "unknown command");
}

void finishCalibration() {
  if (!radar.rep.engineering) { calState = CAL_FAIL; calMsg = "engineering mode is off"; return; }
  bool ok = true;
  for (int g = 0; g < ld2410::GATES; g++) {
    uint8_t m = constrain(calMove[g] + calMargin, 10, 100);
    // still energy on gates 0-1 is not configurable on the LD2410
    uint8_t s = g < 2 ? radar.params.stillSens[g] : (uint8_t)constrain(calStill[g] + calMargin, 10, 100);
    ok &= radar.setSensitivity(g, m, s);
  }
  radar.readParams();
  calState = ok ? CAL_DONE : CAL_FAIL;
  calMsg = ok ? "thresholds set just above the empty-room noise" : "sensor rejected some settings";
}

void tickCalibration() {
  if (calState == CAL_WAIT && millis() - calStart >= calDelayMs) { calState = CAL_RUN; calMsg = "measuring"; }
  if (calState == CAL_RUN) {
    for (int g = 0; g < ld2410::GATES; g++) {
      calMove[g] = max(calMove[g], radar.rep.moveGates[g]);
      calStill[g] = max(calStill[g], radar.rep.stillGates[g]);
    }
    if (millis() - calStart >= calDelayMs + calRunMs) finishCalibration();
  }
}

// ---- web -------------------------------------------------------------------------------------

void setupWeb() {
  web.on("/", [] {
    web.sendHeader("Content-Encoding", "gzip");
    web.send_P(200, "text/html", (const char *)WEB_GZ, WEB_GZ_LEN);
  });
  web.on("/data", [] {
    web.sendHeader("Cache-Control", "no-store");
    web.send(200, "application/json", "{\"r\":" + readingJson() + ",\"st\":" + statusJson() + "}");
  });
  web.on("/cmd", [] {
    String r = runCommand(web.arg("c"));
    web.send(200, "application/json", r);
  });
  web.on("/room", HTTP_GET, [] { web.send(200, "application/json", prefs.getString("room", "null")); });
  web.on("/room", HTTP_POST, [] {
    String body = web.arg("plain");
    if (body.length() > 3500) { web.send(413, "application/json", "{\"ok\":false}"); return; }
    prefs.putString("room", body);
    web.send(200, "application/json", "{\"ok\":true}");
  });
}

// ---- main ------------------------------------------------------------------------------------

void setup() {
  Serial.setRxBufferSize(512);
  Serial.begin(115200);
  pinMode(PIN_OUT, INPUT_PULLDOWN);
  pinMode(PIN_LED, OUTPUT);
  ledcSetup(0, 2400, 8);  // buzzer PWM (tone() logs LEDC errors on this core)
  ledcAttachPin(PIN_BUZZ, 0);
  prefs.begin("radar");
  holdMs = prefs.getUInt("hold", 3000);
  delay(200);
  Serial.println("{\"t\":\"boot\"}");

  sensorOk = probeLink(400);
  if (sensorOk) configureSensor();
  Serial.println(statusJson());

  wm.setConfigPortalBlocking(false);
  wm.setConnectTimeout(20);
  wm.setDebugOutput(false);
  wm.autoConnect("HumanRadar-Setup");
  setupWeb();
}

void loop() {
  wm.process();
  if (WiFi.isConnected() && !mdnsUp) {
    mdnsUp = MDNS.begin("humanradar");
    MDNS.addService("http", "tcp", 80);
    web.begin();
  }
  if (mdnsUp) web.handleClient();

  radar.poll();
  tickCalibration();

  static String cmdBuf;
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (cmdBuf.length()) {
        Serial.println(runCommand(cmdBuf));
        Serial.println(statusJson());
        cmdBuf = "";
      }
    } else if (cmdBuf.length() < 120) cmdBuf += ch;
  }

  // Lost the sensor (wire wiggled)? Re-probe occasionally.
  static uint32_t lastProbe = 0;
  if ((!sensorOk || millis() - radar.lastFrameMs > 3000) && millis() - lastProbe > 10000) {
    lastProbe = millis();
    bool was = sensorOk;
    sensorOk = probeLink(300);
    if (sensorOk && !was) configureSensor();
  }

  bool hit = sensorOk && millis() - radar.lastFrameMs < 1000 && radar.rep.state != 0;
  if (hit) lastHitMs = millis();
  bool now = hit || (lastHitMs && millis() - lastHitMs < holdMs);
  if (now && !present) {
    presenceSince = millis();
    ledcWriteTone(0, 2400);
    buzzOffAt = millis() + 120;
  }
  present = now;
  digitalWrite(PIN_LED, present);
  if (buzzOffAt && millis() > buzzOffAt) { ledcWriteTone(0, 0); buzzOffAt = 0; }

  static uint32_t lastR = 0, lastSt = 0;
  if (millis() - lastR >= 100) { lastR = millis(); Serial.println(readingJson()); }
  if (millis() - lastSt >= 2000) { lastSt = millis(); Serial.println(statusJson()); }
}
