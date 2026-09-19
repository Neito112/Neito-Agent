# Neito Agent

Neito Agent is a Windows-first desktop companion with a local Python brain and a Tauri desktop UI.

## One-click local start

Run `start_app.bat` from the repository root. The launcher:

1. Creates the local `venv` if needed.
2. Installs Python dependencies from `requirements.txt`.
3. Installs frontend dependencies in `neito-agent/node_modules`.
4. Checks that Python, Node.js/npm, and Rust/Cargo are available.
5. Starts the Brain Server at `127.0.0.1:4242`.
6. Starts the Tauri UI from the project directory.

All runtime files stay inside this project folder (`venv`, `node_modules`, `logs`, local database and downloaded model cache).

## Required runtimes

The launcher can install project packages automatically, but it cannot reliably install the runtimes themselves. Install these once if missing:

- Python 3.10+
- Node.js 18+
- Rust and Cargo via [rustup](https://rustup.rs/)
- Microsoft C++ Build Tools for Tauri on Windows

After installation, run `start_app.bat` again.

## Manual commands

```cmd
python -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
cd neito-agent
npm install
npm run tauri:dev
```

The backend log is written to `logs\brain.log`.
