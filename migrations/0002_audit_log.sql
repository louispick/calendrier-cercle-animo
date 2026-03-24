-- Migration : Création du journal des modifications (audit log)
-- Date : 2026-03-24

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),  -- Date et heure de la modification
  action_type TEXT NOT NULL,                           -- Type d'action (voir liste ci-dessous)
  actor_name TEXT,                                     -- Nom de la personne (si renseigné)
  actor_ip TEXT,                                       -- Adresse IP complète (visible uniquement via Cloudflare)
  slot_id INTEGER,                                     -- ID du créneau concerné (si applicable)
  slot_date TEXT,                                      -- Date du créneau (copie pour lisibilité)
  slot_activity TEXT,                                  -- Type d'activité (copie pour lisibilité)
  details TEXT                                         -- Description lisible de l'action
);

-- Types d'actions possibles :
-- 'inscription'        : Un bénévole s'inscrit à un créneau
-- 'desinscription'     : Un bénévole se désinscrit d'un créneau
-- 'ajout_creneau'      : Ajout d'un nouveau créneau (admin)
-- 'modification_creneau' : Modification d'un créneau existant (admin)
-- 'suppression_creneau'  : Suppression d'un créneau (admin)
-- 'reset_database'     : Réinitialisation complète de la base (admin)
-- 'restauration_backup': Restauration d'un backup (admin)
-- 'creation_backup'    : Création manuelle d'un backup (admin)

-- Index pour des recherches rapides
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_name ON audit_log(actor_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_slot_id ON audit_log(slot_id);
