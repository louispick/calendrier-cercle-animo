-- Schema for Backups
-- Table for storing automatic backups of the schedule

CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_data TEXT NOT NULL,  -- JSON stringifié du schedule complet
  created_at TEXT DEFAULT (datetime('now')),
  backup_type TEXT DEFAULT 'auto',  -- 'auto', 'manual', 'pre_delete', 'pre_admin'
  description TEXT,
  item_count INTEGER DEFAULT 0
);

-- Index for faster queries by date
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

-- Index for faster queries by type
CREATE INDEX IF NOT EXISTS idx_backups_type ON backups(backup_type);
