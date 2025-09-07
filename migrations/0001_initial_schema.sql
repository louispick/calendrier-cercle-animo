-- Bénévoles / Utilisateurs
CREATE TABLE IF NOT EXISTS volunteers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  is_admin BOOLEAN DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Types d'activités
CREATE TABLE IF NOT EXISTS activity_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#ffffff',
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Créneaux de planning
CREATE TABLE IF NOT EXISTS time_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- Format YYYY-MM-DD
  day_of_week INTEGER NOT NULL, -- 1=Lundi, 7=Dimanche
  activity_type_id INTEGER NOT NULL,
  volunteer_id INTEGER, -- NULL si personne assigné
  status TEXT DEFAULT 'available', -- available, assigned, searching, cancelled
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_type_id) REFERENCES activity_types(id),
  FOREIGN KEY (volunteer_id) REFERENCES volunteers(id)
);

-- Événements ponctuels
CREATE TABLE IF NOT EXISTS special_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  time TEXT,
  title TEXT NOT NULL,
  description TEXT,
  volunteer_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (volunteer_id) REFERENCES volunteers(id)
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_time_slots_date ON time_slots(date);
CREATE INDEX IF NOT EXISTS idx_time_slots_volunteer ON time_slots(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_activity ON time_slots(activity_type_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_name ON volunteers(name);
CREATE INDEX IF NOT EXISTS idx_special_events_date ON special_events(date);