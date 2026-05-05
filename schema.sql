CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL,
  lat REAL,
  lng REAL,
  user_id TEXT,
  user_name TEXT,
  distance REAL,
  fare INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time);
CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id);
CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);
