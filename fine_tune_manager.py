# -*- coding: utf-8 -*-
"""Dataset discovery and fine-tune workspace manager.

This module only discovers/downloads dataset metadata and creates a local manifest.
It never sends API keys to an LLM and never starts training without explicit user action.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

ROOT = Path(__file__).resolve().parent
FINE_TUNE_DIR = ROOT / "datasets" / "fine_tune"
MANIFEST = FINE_TUNE_DIR / "manifest.json"

PROVIDERS = ("roboflow", "kaggle", "github", "huggingface")

def _load_manifest() -> List[Dict[str, Any]]:
    FINE_TUNE_DIR.mkdir(parents=True, exist_ok=True)
    if not MANIFEST.exists():
        return []
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []

def _save_manifest(items: List[Dict[str, Any]]) -> None:
    FINE_TUNE_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

def provider_status() -> Dict[str, Any]:
    return {
        "roboflow": {"configured": bool(os.getenv("ROBOFLOW_API_KEY")), "env": "ROBOFLOW_API_KEY"},
        "kaggle": {"configured": bool(os.getenv("KAGGLE_USERNAME") and os.getenv("KAGGLE_KEY")), "env": "KAGGLE_USERNAME + KAGGLE_KEY"},
        "github": {"configured": bool(os.getenv("GITHUB_TOKEN")), "env": "GITHUB_TOKEN"},
        "huggingface": {"configured": bool(os.getenv("HF_TOKEN")), "env": "HF_TOKEN"},
    }

def _headers(provider: str) -> Dict[str, str]:
    headers = {"User-Agent": "Neito-Agent-FineTune"}
    if provider == "github" and os.getenv("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.getenv('GITHUB_TOKEN')}"
    if provider == "huggingface" and os.getenv("HF_TOKEN"):
        headers["Authorization"] = f"Bearer {os.getenv('HF_TOKEN')}"
    return headers

def search_datasets(provider: str, query: str, limit: int = 10) -> Dict[str, Any]:
    provider = provider.lower().strip()
    query = query.strip()
    if provider not in PROVIDERS:
        return {"success": False, "error": "Provider không hợp lệ."}
    if not query:
        return {"success": False, "error": "Vui lòng nhập từ khóa dataset."}
    try:
        if provider == "github":
            url = "https://api.github.com/search/repositories"
            data = requests.get(url, params={"q": query, "per_page": limit}, headers=_headers(provider), timeout=15).json()
            results = [{"id": x.get("full_name"), "title": x.get("full_name"), "url": x.get("html_url"), "description": x.get("description")} for x in data.get("items", [])]
        elif provider == "huggingface":
            url = "https://huggingface.co/api/datasets"
            raw = requests.get(url, params={"search": query, "limit": limit}, headers=_headers(provider), timeout=15).json()
            results = [{"id": x.get("id"), "title": x.get("id"), "url": f"https://huggingface.co/datasets/{x.get('id')}", "downloads": x.get("downloads", 0)} for x in raw]
        elif provider == "kaggle":
            url = "https://www.kaggle.com/api/v1/datasets/list"
            raw = requests.get(url, params={"search": query, "pageSize": limit}, timeout=15).json()
            results = [{"id": x.get("ref"), "title": x.get("title"), "url": f"https://www.kaggle.com/datasets/{x.get('ref')}", "downloads": x.get("totalBytes", 0)} for x in raw]
        else:
            url = "https://api.roboflow.com/dataset"
            raw = requests.get(url, params={"api_key": os.getenv("ROBOFLOW_API_KEY", ""), "search": query}, timeout=15).json()
            results = [{"id": x.get("id") or x.get("name"), "title": x.get("name"), "url": x.get("url"), "description": x.get("description")} for x in raw.get("datasets", [])[:limit]]
        return {"success": True, "provider": provider, "results": results}
    except Exception as exc:
        return {"success": False, "provider": provider, "error": str(exc)}

def save_candidate(provider: str, item: Dict[str, Any], protocol_id: str, task_type: str = "detect") -> Dict[str, Any]:
    if provider not in PROVIDERS or not item.get("url"):
        return {"success": False, "error": "Dataset không hợp lệ."}
    entry = {"provider": provider, "protocol_id": protocol_id or "general", "task_type": task_type, "item": item, "status": "candidate", "created_at": time.time()}
    manifest = _load_manifest()
    manifest.append(entry)
    _save_manifest(manifest)
    return {"success": True, "entry": entry}

def get_manifest() -> List[Dict[str, Any]]:
    return _load_manifest()
