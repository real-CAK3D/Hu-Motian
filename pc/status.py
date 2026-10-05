"""Diagnostic: print the radar's JSON lines. python pc\\status.py [seconds] [--reset] [--cmd "params"]"""
import sys
import time

import serial

args = sys.argv[1:]
secs = float(args[0]) if args and args[0][0].isdigit() else 10
s = serial.Serial()
s.port, s.baudrate, s.timeout = "COM6", 115200, 0.5
s.dtr = s.rts = False
s.open()
if "--reset" in args:
    s.rts = True
    time.sleep(0.1)
    s.rts = False
if "--cmd" in args:
    time.sleep(0.5)
    s.write((args[args.index("--cmd") + 1] + "\n").encode())
t, seen = time.time(), {}
while time.time() - t < secs:
    line = s.readline().decode(errors="ignore").strip()
    if not line.startswith("{"):
        continue
    kind = line[6:10]
    seen[kind] = seen.get(kind, 0) + 1
    if kind.startswith(("st", "ack", "boot")) or seen[kind] % 20 == 1:
        print(f"{time.time() - t:5.1f}s {line}")
