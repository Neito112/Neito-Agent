import multiprocessing
import subprocess
import sys
import time
import os

def run_brain():
    print("[+] Khoi dong Brain (Bo nao AI + Mem0 + UDP Server :4242)...")
    subprocess.run([sys.executable, "brain.py"])

def run_vision():
    print("[+] Khoi dong Vision (Mat than mss capture man hinh)...")
    subprocess.run([sys.executable, "vision.py"])

if __name__ == "__main__":
    print("=" * 60)
    print("  TUI BA GANG - DESKTOP AI PET & ASSISTANT ECOSYSTEM")
    print("  Giao tiep noi bo qua UDP Localhost:4242")
    print("=" * 60)

    processes = [
        multiprocessing.Process(target=run_brain, name="BrainProcess"),
        multiprocessing.Process(target=run_vision, name="VisionProcess"),
    ]

    for p in processes:
        p.start()
        time.sleep(1)

    print("\n[OK] He thong da khoi chay thanh cong!")
    print("Nhan Ctrl+C de dung tat ca tien trinh.\n")

    try:
        for p in processes:
            p.join()
    except KeyboardInterrupt:
        print("\n[!] Dang dung he thong...")
        for p in processes:
            p.terminate()
            p.join()
        print("[OK] He thong da dung an toan.")
