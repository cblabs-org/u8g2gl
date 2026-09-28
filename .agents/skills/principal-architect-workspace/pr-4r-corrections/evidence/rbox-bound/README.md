# Rounded-box radius bound — measurement, 2026-09-28

Evidence for PROJECT.md "Ruling C's bound does not hold". Not built by the project.

`rbox.c` draws `u8g2_DrawRBox` / `u8g2_DrawRFrame` at (40,20) into a 128x64 full buffer
(`u8g2_Setup_ssd1306_128x64_noname_f`, null byte and GPIO callbacks) for every radius from 1 to
min(w,h)+1, at 10x10, 11x11, 20x8, 8x20 and 2x2, and counts pixels set outside the box.

Built against the pinned submodule (`extern/u8g2` @ `d66b49af`, 2.36.18), host macOS arm64,
`U8G2_16BIT` (u8g2.h defines it unconditionally at 32 bits and wider):

    cc -O0 -w -I extern/u8g2/csrc rbox.c extern/u8g2/csrc/*.c -o rbox && ./rbox

`raw-output.txt` is its unedited output. Every radius with `2r <= min(w,h)` draws nothing
outside the box; every radius with `2r > min(w,h)` does, from 70 to 1753 pixels.
