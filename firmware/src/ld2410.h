#pragma once
// Minimal HLK-LD2410B driver: report frames (basic + engineering) and the
// command/ACK protocol (config mode, params, sensitivity, range, firmware).
// Protocol: Hi-Link "LD2410B Serial Communication Protocol" V1.07.

#include <Arduino.h>

namespace ld2410 {

static const int GATES = 9;           // gate 0..8
static const float GATE_M = 0.75f;    // default distance resolution

struct Report {
  uint8_t state = 0;                  // 0 none, 1 moving, 2 still, 3 both
  uint16_t moveCm = 0, stillCm = 0, detectCm = 0;
  uint8_t moveEnergy = 0, stillEnergy = 0;
  bool engineering = false;
  uint8_t moveGates[GATES] = {0}, stillGates[GATES] = {0};
  int light = -1, out = -1;           // LD2410B extras in engineering frames
};

struct Params {
  bool valid = false;
  uint8_t maxGate = 8, maxMoveGate = 8, maxStillGate = 8;
  uint8_t moveSens[GATES] = {0}, stillSens[GATES] = {0};
  uint16_t idleSecs = 5;
};

class Radar {
 public:
  Report rep;
  Params params;
  char firmware[24] = "";
  uint32_t frames = 0, lastFrameMs = 0;

  void attach(HardwareSerial *s) { ser = s; len = 0; }

  // Feed all pending bytes. Returns true if a new report frame was parsed.
  bool poll() {
    bool got = false;
    while (ser && ser->available()) got |= feed(ser->read());
    return got;
  }

  bool enableConfig() {
    uint8_t v[2] = {0x01, 0x00};
    return command(0x00FF, v, 2);
  }
  bool endConfig() { return command(0x00FE, nullptr, 0); }

  bool setEngineering(bool on) {
    if (!enableConfig()) return false;
    bool ok = command(on ? 0x0062 : 0x0063, nullptr, 0);
    endConfig();
    return ok;
  }

  bool readParams() {
    if (!enableConfig()) return false;
    bool ok = command(0x0061, nullptr, 0);
    if (ok && ackLen >= 2 + 1 + 3 + 2 * GATES + 2 && ackVal[2] == 0xAA) {
      const uint8_t *p = ackVal + 3;
      params.maxGate = p[0];
      params.maxMoveGate = p[1];
      params.maxStillGate = p[2];
      memcpy(params.moveSens, p + 3, GATES);
      memcpy(params.stillSens, p + 3 + GATES, GATES);
      params.idleSecs = p[3 + 2 * GATES] | (p[4 + 2 * GATES] << 8);
      params.valid = true;
    } else ok = false;
    endConfig();
    return ok;
  }

  bool readFirmware() {
    if (!enableConfig()) return false;
    bool ok = command(0x00A0, nullptr, 0);
    if (ok && ackLen >= 10) {
      // status(2) type(2) version(2: minor, major) build(4, little endian) -> e.g. V2.04.23022511
      uint32_t build = ackVal[6] | (ackVal[7] << 8) | (ackVal[8] << 16) | ((uint32_t)ackVal[9] << 24);
      snprintf(firmware, sizeof(firmware), "V%x.%02x.%08lx", ackVal[5], ackVal[4], (unsigned long)build);
    }
    endConfig();
    return ok;
  }

  // gate 0..8, or -1 for all gates. Sensitivities 0..100 (higher = less sensitive).
  bool setSensitivity(int gate, uint8_t move, uint8_t still) {
    uint8_t v[18];
    putWord(v, 0, 0x0000, gate < 0 ? 0xFFFF : gate);
    putWord(v, 6, 0x0001, move);
    putWord(v, 12, 0x0002, still);
    if (!enableConfig()) return false;
    bool ok = command(0x0064, v, 18);
    endConfig();
    return ok;
  }

  bool setRange(uint8_t maxMoveGate, uint8_t maxStillGate, uint16_t idleSecs) {
    uint8_t v[18];
    putWord(v, 0, 0x0000, maxMoveGate);
    putWord(v, 6, 0x0001, maxStillGate);
    putWord(v, 12, 0x0002, idleSecs);
    if (!enableConfig()) return false;
    bool ok = command(0x0060, v, 18);
    endConfig();
    return ok;
  }

  bool factoryReset() {
    if (!enableConfig()) return false;
    bool ok = command(0x00A2, nullptr, 0);
    endConfig();
    if (ok) {
      enableConfig();
      command(0x00A3, nullptr, 0);  // restart; module reboots without ACK-ing end-config
    }
    return ok;
  }

 private:
  HardwareSerial *ser = nullptr;
  uint8_t buf[80];
  size_t len = 0;
  bool isAck = false;
  uint16_t ackCmd = 0;
  uint8_t ackVal[64];
  size_t ackLen = 0;
  bool ackReady = false;

  static void putWord(uint8_t *v, int at, uint16_t word, uint32_t value) {
    v[at] = word & 0xFF;
    v[at + 1] = word >> 8;
    v[at + 2] = value & 0xFF;
    v[at + 3] = (value >> 8) & 0xFF;
    v[at + 4] = (value >> 16) & 0xFF;
    v[at + 5] = (value >> 24) & 0xFF;
  }

  // Send a command and wait for its ACK. Report frames received meanwhile are still parsed.
  bool command(uint16_t cmd, const uint8_t *val, size_t n) {
    if (!ser) return false;
    uint8_t f[4 + 2 + 2 + 24 + 4];
    size_t i = 0;
    const uint8_t H[4] = {0xFD, 0xFC, 0xFB, 0xFA}, T[4] = {0x04, 0x03, 0x02, 0x01};
    memcpy(f, H, 4); i = 4;
    f[i++] = (2 + n) & 0xFF; f[i++] = (2 + n) >> 8;
    f[i++] = cmd & 0xFF; f[i++] = cmd >> 8;
    if (n) { memcpy(f + i, val, n); i += n; }
    memcpy(f + i, T, 4); i += 4;
    for (int attempt = 0; attempt < 3; attempt++) {
      ackReady = false;
      ser->write(f, i);
      ser->flush();
      uint32_t t0 = millis();
      while (millis() - t0 < 250) {
        poll();
        if (ackReady && ackCmd == (cmd | 0x0100)) return ackLen >= 2 && ackVal[0] == 0 && ackVal[1] == 0;
        delay(1);
      }
    }
    return false;
  }

  bool feed(uint8_t b) {
    static const uint8_t RH[4] = {0xF4, 0xF3, 0xF2, 0xF1}, AH[4] = {0xFD, 0xFC, 0xFB, 0xFA};
    if (len < 4) {
      if (len == 0) {
        if (b == RH[0]) isAck = false;
        else if (b == AH[0]) isAck = true;
        else return false;
        buf[len++] = b;
        return false;
      }
      if (b == (isAck ? AH : RH)[len]) { buf[len++] = b; return false; }
      len = 0;
      return feed(b);  // this byte might start a new frame
    }
    buf[len++] = b;
    if (len < 6) return false;
    uint16_t n = buf[4] | (buf[5] << 8);
    if (n > sizeof(buf) - 10) { len = 0; return false; }
    if (len < 6u + n + 4u) return false;
    len = 0;
    const uint8_t *d = buf + 6, *t = buf + 6 + n;
    if (isAck) {
      if (!(t[0] == 0x04 && t[1] == 0x03 && t[2] == 0x02 && t[3] == 0x01) || n < 2) return false;
      ackCmd = d[0] | (d[1] << 8);
      ackLen = min((size_t)(n - 2), sizeof(ackVal));
      memcpy(ackVal, d + 2, ackLen);
      ackReady = true;
      return false;
    }
    if (!(t[0] == 0xF8 && t[1] == 0xF7 && t[2] == 0xF6 && t[3] == 0xF5)) return false;
    if (n < 13 || d[1] != 0xAA) return false;
    rep.state = d[2];
    rep.moveCm = d[3] | (d[4] << 8);
    rep.moveEnergy = d[5];
    rep.stillCm = d[6] | (d[7] << 8);
    rep.stillEnergy = d[8];
    rep.detectCm = d[9] | (d[10] << 8);
    rep.engineering = d[0] == 0x01 && n >= 15;
    if (rep.engineering) {
      int nm = d[11] + 1, ns = d[12] + 1;
      size_t need = 13 + nm + ns + 2;  // + tail 0x55 0x00
      if (nm <= GATES && ns <= GATES && n >= need) {
        memset(rep.moveGates, 0, GATES);
        memset(rep.stillGates, 0, GATES);
        memcpy(rep.moveGates, d + 13, nm);
        memcpy(rep.stillGates, d + 13 + nm, ns);
        size_t extra = n - need;
        if (extra >= 2) { rep.light = d[13 + nm + ns]; rep.out = d[14 + nm + ns]; }
      } else rep.engineering = false;
    }
    frames++;
    lastFrameMs = millis();
    return true;
  }
};

}  // namespace ld2410
