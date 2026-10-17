import sys

def analyze_lines(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    total = len(lines)
    blank_lines = []
    comment_lines = []
    code_lines = []
    
    in_comment = False
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if not s:
            blank_lines.append((i, line))
            continue
        
        if in_comment:
            comment_lines.append((i, line))
            if '-->' in s:
                in_comment = False
        elif s.startswith('<!--'):
            comment_lines.append((i, line))
            if '-->' not in s:
                in_comment = True
        else:
            code_lines.append((i, line))
            
    return total, blank_lines, comment_lines, code_lines

for fp in ["tmp/g-probe-source/layoutSWR.json", "tmp/g-probe/departures_static.xml", "tmp/g-probe/departures_workaround.xml"]:
    total, blanks, comments, codes = analyze_lines(fp)
    print(f"=== {fp} ===")
    print(f"Total: {total}, Blank: {len(blanks)}, Comment: {len(comments)}, Code: {len(codes)}")
