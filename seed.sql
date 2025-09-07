-- Insérer les types d'activités basés sur le planning analysé
INSERT OR IGNORE INTO activity_types (name, description, color) VALUES 
  ('Nourrissage', 'Nourrissage quotidien des animaux', '#e3f2fd'),
  ('Légumes', 'Récupération et distribution de légumes', '#f3e5f5'),
  ('Réunion', 'Réunions et événements spéciaux', '#fff3e0');

-- Insérer les bénévoles identifiés dans le planning
INSERT OR IGNORE INTO volunteers (name, is_admin, is_active) VALUES 
  ('Alice', 1, 1),
  ('Manu', 0, 1),
  ('Guillaume', 0, 1),
  ('Eliza', 0, 1),
  ('Sandrine', 0, 1),
  ('Laet', 0, 1),
  ('Les Furgettes', 0, 1);

-- Créer quelques créneaux d'exemple pour tester
-- Septembre 2024 - Nourrissage
INSERT OR IGNORE INTO time_slots (date, day_of_week, activity_type_id, volunteer_id, status) VALUES 
  ('2024-09-01', 1, 1, 1, 'assigned'), -- Alice, Lundi
  ('2024-09-02', 2, 1, 1, 'assigned'), -- Alice, Mardi
  ('2024-09-03', 3, 1, 3, 'assigned'), -- Guillaume, Mercredi
  ('2024-09-04', 4, 1, 3, 'assigned'), -- Guillaume, Jeudi
  ('2024-09-05', 5, 1, 5, 'assigned'), -- Sandrine, Vendredi
  ('2024-09-06', 6, 1, 7, 'assigned'), -- Les Furgettes, Samedi
  ('2024-09-07', 7, 1, 3, 'assigned'); -- Guillaume, Dimanche

-- Septembre 2024 - Légumes
INSERT OR IGNORE INTO time_slots (date, day_of_week, activity_type_id, volunteer_id, status) VALUES 
  ('2024-09-03', 3, 2, 1, 'assigned'); -- Alice, Mercredi légumes

-- Quelques créneaux sans assignation pour tester les statuts
INSERT OR IGNORE INTO time_slots (date, day_of_week, activity_type_id, status) VALUES 
  ('2024-09-08', 1, 1, 'available'),   -- Lundi libre
  ('2024-09-09', 2, 1, 'searching'),   -- Mardi recherche activement
  ('2024-09-10', 3, 1, 'available');   -- Mercredi libre

-- Événement spécial
INSERT OR IGNORE INTO special_events (date, time, title, description) VALUES 
  ('2024-09-02', '18:30', 'Réunion', 'Réunion mensuelle du Cercle Animô');