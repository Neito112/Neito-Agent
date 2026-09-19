import json
import sqlite3
import os
import time

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pet_memories.db')
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
c = conn.cursor()
c.execute('''CREATE TABLE IF NOT EXISTS memories
             (id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp REAL DEFAULT 0,
              key TEXT NOT NULL,
              value TEXT NOT NULL)''')
conn.commit()

try:
    c.execute('ALTER TABLE memories ADD COLUMN timestamp REAL DEFAULT 0')
    conn.commit()
except Exception:
    pass

def add_memory(key: str, value: str):
    try:
        now = time.time()
        c.execute('INSERT INTO memories (timestamp, key, value) VALUES (?, ?, ?)', (now, key, value))
        conn.commit()
        return True
    except Exception as e:
        print(f'[-] Error adding memory: {e}')
        return False

def search_memory(query: str, limit: int = 5) -> str:
    try:
        words = [w.strip() for w in query.split() if len(w.strip()) > 1]
        results = []
        if words:
            like_clause = ' OR '.join(['key LIKE ? OR value LIKE ?' for _ in words])
            params = []
            for w in words:
                params.extend([f'%{w}%', f'%{w}%'])
            params.append(limit)
            c.execute(f'SELECT key, value FROM memories WHERE {like_clause} ORDER BY id DESC LIMIT ?', params)
            rows = c.fetchall()
            for r in rows:
                results.append(f'- {r[0]}: {r[1]}')
        
        if not results:
            c.execute('SELECT key, value FROM memories ORDER BY id DESC LIMIT 3')
            rows = c.fetchall()
            for r in rows:
                results.append(f'- {r[0]}: {r[1]}')
                
        return '\n'.join(results) if results else 'Chưa có dữ liệu ký ức liên quan.'
    except Exception as e:
        return f'Lỗi tra cứu ký ức: {e}'

def get_all_memories():
    try:
        c.execute('SELECT id, timestamp, key, value FROM memories ORDER BY id DESC')
        rows = c.fetchall()
        return [{'id': r[0], 'timestamp': r[1] or 0, 'key': r[2], 'value': r[3]} for r in rows]
    except Exception as e:
        return []

def delete_memory(mem_id: int):
    try:
        c.execute('DELETE FROM memories WHERE id = ?', (mem_id,))
        conn.commit()
        return True
    except Exception as e:
        return False
