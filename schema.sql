-- Schema for Calendrier Cercle Animô
-- Table for storing schedule slots and activities

DROP TABLE IF EXISTS schedule;

CREATE TABLE schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  time TEXT,
  activity_type TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'free',
  volunteer_name TEXT,
  volunteers TEXT DEFAULT '[]',
  is_urgent_when_free INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for faster queries by date
CREATE INDEX idx_schedule_date ON schedule(date);

-- Index for faster queries by status
CREATE INDEX idx_schedule_status ON schedule(status);

-- Index for faster queries by activity_type
CREATE INDEX idx_schedule_activity_type ON schedule(activity_type);
