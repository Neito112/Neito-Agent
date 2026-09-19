import os
import requests

chars_dir = r"D:\smolagents\neito-agent\ui\assets\characters"

chars = {
    "dog": "https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/dog/akita_idle_8fps.gif",
    "panda": "https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/panda/black_idle_8fps.gif",
    "totoro": "https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/totoro/gray_idle_8fps.gif",
    "cat": "https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/cat.svg"
}

for name, url in chars.items():
    folder = os.path.join(chars_dir, name)
    os.makedirs(folder, exist_ok=True)
    ext = "svg" if url.endswith(".svg") else "gif"
    target = os.path.join(folder, f"default.{ext}")
    try:
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            with open(target, "wb") as f:
                f.write(r.content)
            print(f"[OK] Da tai {name} -> {target}")
    except Exception as e:
        print(f"[-] Loi tai {name}: {e}")

print("Xong bo sung nhan vat!")
