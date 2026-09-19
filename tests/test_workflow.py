import requests
import json
import time
import subprocess
import sys

print("[+] Kiem tra thu nghiem luong van hanh cua Phidata + Smolagents + Mem0...")

# 1. Khoi dong brain.py o background
p = subprocess.Popen([sys.executable, "brain.py"])
time.sleep(2)

try:
    # 2. Test status endpoint
    r_stat = requests.get("http://127.0.0.1:4242/")
    print(f"Status check: {r_stat.status_code} - {r_stat.json()}")

    # 3. Test cau hoi thong thuong (Phidata tra loi, Mem0 luu tru)
    print("\n--- TEST 1: Cau hoi giao tiep thong thuong ---")
    r1 = requests.post("http://127.0.0.1:4242/api/ask", json={"question": "Xin chao Neito, hom nay troi dep khong?"}, timeout=15)
    print(f"Test 1 status: {r1.status_code}")
    res1 = r1.json()
    print("Answer:", res1.get('answer', '').encode('ascii', 'replace').decode('ascii'))
    print(f"Emotion: {res1.get('emotion')}")
    print(f"Needs hands: {res1.get('needs_hands')}")

    # 4. Test yeu cau lien quan den code / GitHub (Kich hoat Smolagents)
    print("\n--- TEST 2: Yeu cau tim kiem GitHub (Smolagents thuc thi) ---")
    r2 = requests.post("http://127.0.0.1:4242/api/ask", json={"question": "Tìm kiếm github repo về desktop pet"}, timeout=60)
    print(f"Test 2 status: {r2.status_code}")
    res2 = r2.json()
    print("Answer:", res2.get('answer', '').encode('ascii', 'replace').decode('ascii'))
    print(f"Emotion: {res2.get('emotion')}")
    print(f"Needs hands: {res2.get('needs_hands')}")
    print("Smolagents result:", str(res2.get('smolagents_result')).encode('ascii', 'replace').decode('ascii'))

    print("\n[OK] Kiem tra thanh cong toan bo luong van hanh!")
finally:
    p.terminate()
    p.wait()
