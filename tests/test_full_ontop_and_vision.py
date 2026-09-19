# -*- coding: utf-8 -*-
import sys
import os
import json
import time

sys.path.insert(0, r'd:\smolagents')
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

import protocols_manager
import foreground_watcher
import vision
import yolo_world_advisor

print('=== 1. KIEM TRA MATCHING TIEN TRINH ON-TOP ===')
test_cases = [
    ('LeagueClientUx.exe', 'League of Legends (TM) Client', 'Liên Minh Huyền Thoại'),
    ('VALORANT-Win64-Shipping.exe', 'VALORANT', 'Valorant (Van Di)'),
    ('Code.exe', 'neito_brain.py - smolagents - Visual Studio Code', 'Lập Trình & Tự Động Hóa'),
    ('GenshinImpact.exe', 'Genshin Impact', 'Genshin Impact'),
    ('EXCEL.EXE', 'Book1 - Excel', 'Văn Phòng & Excel')
]

for proc, title, expected_name in test_cases:
    matched = protocols_manager.match_protocol_by_window(proc, title)
    assert matched is not None, f'Failed to match {proc}'
    assert matched['name'] == expected_name, f'Expected {expected_name}, got {matched["name"]}'
    print(f'  [✓] {proc} -> Matched: {matched["name"]}')

print('\n=== 2. KIEM TRA CO CHE 1 ACTIVE, 2 QUEUED KHI ON-TOP APP DOI ===')
# Kích hoạt LOL
protocols_manager.activate_protocol('lol')
p_active = protocols_manager.get_active_protocol()
print(f'  Active: {p_active["name"]}')

# Giả lập user mở Valorant
matched_val = protocols_manager.match_protocol_by_window('VALORANT-Win64-Shipping.exe', 'VALORANT')
protocols_manager.activate_protocol(matched_val['id'])

all_p = protocols_manager.get_all_protocols()
active_p = next(p for p in all_p if p['status'] == 'active')
q1_p = next(p for p in all_p if p.get('queuePosition') == 1)
q2_p = next(p for p in all_p if p.get('queuePosition') == 2)

print(f'  [✓] Active moi: {active_p["name"]}')
print(f'  [✓] Queue #1: {q1_p["name"]}')
print(f'  [✓] Queue #2: {q2_p["name"]}')
assert active_p['id'] == 'valorant'
assert q1_p['id'] == 'lol'

print('\n=== 3. KIEM TRA DUAL VISION (YOLO11n + YOLO-World) ===')
ve = vision.get_vision_engine()
st = ve.get_status()
print(f'  Engine Mode: {st["engine_mode"]}')
print(f'  Active Classes Count: {st["active_classes_count"]}')

# Nạp nhãn cho YOLO-World
ve.set_active_classes(active_p.get('yolo_classes', []))
st2 = ve.get_status()
print(f'  Active Classes sau khi nap cho YOLO-World: {st2["active_classes"]}')

advisor_st = yolo_world_advisor.get_advisor_status()
print(f'  Advisor Status: Active Proto = {advisor_st["active_protocol"]}')

print('\n=== TAT CA KIEM THU DA HOAN TAT XUAT SAC! ===')
