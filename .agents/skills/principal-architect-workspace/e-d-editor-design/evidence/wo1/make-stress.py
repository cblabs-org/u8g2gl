# E-D WO1: write a synthetic screen of N elements (alternating labels and
# boxes) into a copy of the probe project, for the stress rows of the bench.
#   python3 make-stress.py <project copy> <N>
import sys
d, n = sys.argv[1], int(sys.argv[2])
rows = []
for i in range(n):
    x = (i * 13) % 230
    y = (i * 7) % 54
    if i % 2 == 0:
        rows.append(f'        <u8g2gl_label name="l{i}" x="{x}" y="{y}" width="24" height="10" font="u8g2_font_6x10_mr" text="L{i}" />')
    else:
        rows.append(f'        <u8g2gl_box name="b{i}" x="{x}" y="{y}" width="20" height="8" filled="false" />')
with open(f'{d}/screens/screen_departures.xml', 'w') as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n<screen name="departures">\n    <view>\n'
            + '\n'.join(rows) + '\n    </view>\n</screen>\n')
