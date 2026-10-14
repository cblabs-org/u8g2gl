// Replicates u8g2gl_clock::render's Step 5 placement (runtime 0.8.0) on real U8G2, to measure
// the lowest lit row of the HH:MM digits and of the SS digits. Clock: y=18 h=20.
#include <stdio.h>
#include "u8g2.h"
static void bottoms(u8g2_t* u, int x0, int x1, int* top, int* bot) {
  uint8_t* b = u8g2_GetBufferPtr(u); *top = 99; *bot = -1;
  for (int y = 0; y < 64; ++y) for (int x = x0; x < x1; ++x)
    if (b[(y/8)*256 + x] & (1u << (y & 7))) { if (y < *top) *top = y; if (y > *bot) *bot = y; }
}
int main(void) {
  u8g2_t u; u8g2_Setup_ssd1322_nhd_256x64_f(&u, U8G2_R0, u8x8_byte_empty, u8x8_dummy_cb);
  u8g2_InitDisplay(&u); u8g2_ClearBuffer(&u);
  u8g2_SetFontRefHeightAll(&u); u8g2_SetFontPosTop(&u); u8g2_SetFontMode(&u, 1); u8g2_SetDrawColor(&u, 1);
  const uint8_t* mainf = u8g2_font_helvB12_tr; const uint8_t* secf = u8g2_font_helvR08_tr;
  int y = 18, h = 20;
  u8g2_SetFont(&u, mainf);
  int fh = u8g2_GetAscent(&u) - u8g2_GetDescent(&u);
  int dy = y + ((h > fh) ? (h - fh) / 2 : 0);
  u8g2_SetFont(&u, secf);
  int sfh = u8g2_GetAscent(&u) - u8g2_GetDescent(&u);
  int sy = dy + fh - sfh;
  u8g2_SetFont(&u, mainf); int w = u8g2_DrawUTF8(&u, 4, dy, "12:34");
  u8g2_SetFont(&u, secf); u8g2_DrawUTF8(&u, 4 + w + 4, sy, "56");
  int t1,b1,t2,b2; bottoms(&u, 0, 4 + w + 2, &t1, &b1); bottoms(&u, 4 + w + 2, 256, &t2, &b2);
  printf("main fh=%d draw_y=%d | sec fh=%d sec_draw_y=%d\n", fh, dy, sfh, sy);
  printf("HH:MM lit rows %d..%d | SS lit rows %d..%d | SS bottom lower by %d px\n", t1, b1, t2, b2, b2 - b1);
  return 0;
}
