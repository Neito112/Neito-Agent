# -*- coding: utf-8 -*-
import sys
sys.path.insert(0, r'd:\smolagents')
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

import protocols_manager

print('=== TEST VIDEO & ONLINE DOCS RESEARCH ===')
res = protocols_manager.research_video_and_online_docs('Liên Minh Huyền Thoại', 'lol')
print('Research Success:', res.get('success'))
print('Protocol:', res.get('protocol'))
print('Video Tips Count:', len(res.get('video_tips', [])))
for vt in res.get('video_tips', [])[:3]:
    print('  • Tip:', vt)
print('YOLO Classes:', res.get('yolo_classes', []))
print('=== TEST PASSED ===')
