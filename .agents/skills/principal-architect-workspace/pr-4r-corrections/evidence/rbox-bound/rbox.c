#include "u8g2.h"
#include <stdio.h>
static u8g2_t g;
static int px(int x,int y){ uint8_t *b=u8g2_GetBufferPtr(&g); return (b[(y/8)*128+x]>>(y%8))&1; }
static void run(const char*kind,int x,int y,int w,int h,int r){
  u8g2_ClearBuffer(&g);
  if(kind[1]=='B') u8g2_DrawRBox(&g,x,y,w,h,r); else u8g2_DrawRFrame(&g,x,y,w,h,r);
  int n=0,out=0,minx=999,maxx=-1,miny=999,maxy=-1;
  for(int yy=0;yy<64;yy++)for(int xx=0;xx<128;xx++) if(px(xx,yy)){n++; if(xx<x||xx>=x+w||yy<y||yy>=y+h) out++;
     if(xx<minx)minx=xx; if(xx>maxx)maxx=xx; if(yy<miny)miny=yy; if(yy>maxy)maxy=yy;}
  printf("%s w=%2d h=%2d r=%2d  2r<=min:%d r<=min-1:%d  pixels=%4d outside_box=%4d  bbox=[%d..%d]x[%d..%d]\n",
    kind,w,h,r,2*r<=(w<h?w:h), r<=(w<h?w:h)-1, n,out,minx,maxx,miny,maxy);
}
int main(){
  u8g2_Setup_ssd1306_128x64_noname_f(&g,U8G2_R0,u8x8_byte_empty,u8x8_dummy_cb);
  u8g2_InitDisplay(&g);
  int sizes[][2]={{10,10},{11,11},{20,8},{8,20},{2,2}};
  for(unsigned s=0;s<sizeof sizes/sizeof*sizes;s++){int w=sizes[s][0],h=sizes[s][1],m=w<h?w:h;
    for(int r=1;r<=m+1;r++){run("RBox  ",40,20,w,h,r);} 
    for(int r=1;r<=m+1;r++){run("RFrame",40,20,w,h,r);} }
  return 0;
}
