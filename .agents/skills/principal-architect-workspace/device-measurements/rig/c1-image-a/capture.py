import sys, time, serial
port, secs, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
deadline = time.time() + secs
data = b""
while time.time() < deadline:
    try:
        with serial.Serial(port, 115200, timeout=0.5) as s:
            while time.time() < deadline:
                data += s.read(4096)
    except (serial.SerialException, OSError):
        time.sleep(0.3)  # port re-enumerating after a reset
open(out, "wb").write(data)
sys.stdout.write(data.decode("utf-8", "replace"))
