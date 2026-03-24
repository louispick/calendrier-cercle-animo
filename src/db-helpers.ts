// Database helper functions for Cloudflare D1

export interface ScheduleSlot {
  id: number;
  date: string;
  time: string | null;
  activity_type: string;
  description: string | null;
  notes: string | null;
  status: string;
  volunteer_name: string | null;
  volunteers: string; // JSON array stored as string
  is_urgent_when_free: number; // SQLite uses 0/1 for boolean
  created_at?: string;
  updated_at?: string;
}

// Parse volunteers JSON from DB
export function parseVolunteers(volunteersJson: string): string[] {
  try {
    return JSON.parse(volunteersJson || '[]');
  } catch {
    return [];
  }
}

// Convert DB row to application format
export function dbRowToScheduleSlot(row: any): any {
  // Calculate day_of_week from date (1=Monday, 7=Sunday)
  const date = new Date(row.date);
  const dayOfWeek = date.getDay();
  const adjustedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert Sunday from 0 to 7
  
  return {
    id: row.id,
    date: row.date,
    day_of_week: adjustedDayOfWeek,
    time: row.time,
    activity_type: row.activity_type,
    description: row.description,
    notes: row.notes,
    status: row.status,
    volunteer_name: row.volunteer_name,
    volunteers: parseVolunteers(row.volunteers),
    is_urgent_when_free: row.is_urgent_when_free === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// Get all schedule slots
export async function getAllSchedule(db: D1Database): Promise<any[]> {
  const result = await db.prepare('SELECT * FROM schedule ORDER BY date, time').all();
  return result.results.map(dbRowToScheduleSlot);
}

// Get schedule slot by ID
export async function getScheduleById(db: D1Database, id: number): Promise<any | null> {
  const result = await db.prepare('SELECT * FROM schedule WHERE id = ?').bind(id).first();
  return result ? dbRowToScheduleSlot(result) : null;
}

// Create new schedule slot
export async function createScheduleSlot(db: D1Database, slot: any): Promise<number> {
  const volunteersJson = JSON.stringify(slot.volunteers || []);
  
  const result = await db.prepare(`
    INSERT INTO schedule (date, time, activity_type, description, notes, status, volunteer_name, volunteers, is_urgent_when_free)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    slot.date,
    slot.time || null,
    slot.activity_type,
    slot.description || null,
    slot.notes || null,
    slot.status || 'free',
    slot.volunteer_name || null,
    volunteersJson,
    slot.is_urgent_when_free ? 1 : 0
  ).run();
  
  return result.meta.last_row_id || 0;
}

// Update schedule slot
export async function updateScheduleSlot(db: D1Database, id: number, slot: any): Promise<boolean> {
  const volunteersJson = JSON.stringify(slot.volunteers || []);
  
  const result = await db.prepare(`
    UPDATE schedule 
    SET date = ?, time = ?, activity_type = ?, description = ?, notes = ?, 
        status = ?, volunteer_name = ?, volunteers = ?, is_urgent_when_free = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    slot.date,
    slot.time || null,
    slot.activity_type,
    slot.description || null,
    slot.notes || null,
    slot.status,
    slot.volunteer_name || null,
    volunteersJson,
    slot.is_urgent_when_free ? 1 : 0,
    id
  ).run();
  
  return result.meta.changes > 0;
}

// Delete schedule slot
export async function deleteScheduleSlot(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM schedule WHERE id = ?').bind(id).run();
  return result.meta.changes > 0;
}

// Replace entire schedule (for bulk updates)
export async function replaceSchedule(db: D1Database, schedule: any[]): Promise<boolean> {
  // Delete all existing data first, then insert new data
  const statements = [];
  
  // First statement: DELETE all
  statements.push(db.prepare('DELETE FROM schedule'));
  
  // Then insert all activities
  schedule.forEach(slot => {
    const volunteersJson = JSON.stringify(slot.volunteers || []);
    
    if (slot.id) {
      // Insert with existing ID
      statements.push(db.prepare(`
        INSERT INTO schedule (id, date, time, activity_type, description, notes, status, volunteer_name, volunteers, is_urgent_when_free)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        slot.id,
        slot.date,
        slot.time || null,
        slot.activity_type,
        slot.description || null,
        slot.notes || null,
        slot.status || 'free',
        slot.volunteer_name || null,
        volunteersJson,
        slot.is_urgent_when_free ? 1 : 0
      ));
    } else {
      // Insert new (auto-increment ID)
      statements.push(db.prepare(`
        INSERT INTO schedule (date, time, activity_type, description, notes, status, volunteer_name, volunteers, is_urgent_when_free)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        slot.date,
        slot.time || null,
        slot.activity_type,
        slot.description || null,
        slot.notes || null,
        slot.status || 'free',
        slot.volunteer_name || null,
        volunteersJson,
        slot.is_urgent_when_free ? 1 : 0
      ));
    }
  });
  
  await db.batch(statements);
  return true;
}

// ===== BACKUP FUNCTIONS =====

export interface Backup {
  id: number;
  backup_data: string; // JSON stringifié
  created_at: string;
  backup_type: string;
  description: string | null;
  item_count: number;
}

// Créer un backup automatique du schedule complet
export async function createBackup(
  db: D1Database, 
  schedule: any[], 
  backupType: string = 'auto',
  description: string | null = null
): Promise<number> {
  const backupData = JSON.stringify(schedule);
  const itemCount = schedule.length;
  
  const result = await db.prepare(`
    INSERT INTO backups (backup_data, backup_type, description, item_count)
    VALUES (?, ?, ?, ?)
  `).bind(backupData, backupType, description, itemCount).run();
  
  console.log(`💾 Backup créé: type=${backupType}, items=${itemCount}, id=${result.meta.last_row_id}`);
  return result.meta.last_row_id || 0;
}

// Récupérer tous les backups (limité aux 50 derniers)
export async function getAllBackups(db: D1Database, limit: number = 50): Promise<Backup[]> {
  const result = await db.prepare(`
    SELECT id, created_at, backup_type, description, item_count,
           LENGTH(backup_data) as data_size
    FROM backups 
    ORDER BY created_at DESC 
    LIMIT ?
  `).bind(limit).all();
  
  return result.results as any[];
}

// Récupérer un backup spécifique par ID
export async function getBackupById(db: D1Database, backupId: number): Promise<any[] | null> {
  const result = await db.prepare(`
    SELECT backup_data FROM backups WHERE id = ?
  `).bind(backupId).first();
  
  if (!result) return null;
  
  try {
    return JSON.parse((result as any).backup_data);
  } catch (error) {
    console.error('❌ Erreur parsing backup:', error);
    return null;
  }
}

// Restaurer un backup (remplace le schedule actuel)
export async function restoreBackup(db: D1Database, backupId: number): Promise<boolean> {
  const backupData = await getBackupById(db, backupId);
  
  if (!backupData) {
    console.error('❌ Backup non trouvé:', backupId);
    return false;
  }
  
  // Créer un backup du state actuel avant de restaurer
  const currentSchedule = await getAllSchedule(db);
  await createBackup(db, currentSchedule, 'pre_restore', `Backup automatique avant restauration du backup #${backupId}`);
  
  // Restaurer les données du backup
  await replaceSchedule(db, backupData);
  
  console.log(`✅ Backup #${backupId} restauré avec succès (${backupData.length} items)`);
  return true;
}

// Nettoyer les vieux backups (garder seulement les N derniers)
export async function cleanOldBackups(db: D1Database, keepCount: number = 100): Promise<number> {
  const result = await db.prepare(`
    DELETE FROM backups 
    WHERE id NOT IN (
      SELECT id FROM backups ORDER BY created_at DESC LIMIT ?
    )
  `).bind(keepCount).run();
  
  const deleted = result.meta.changes;
  if (deleted > 0) {
    console.log(`🗑️ ${deleted} ancien(s) backup(s) supprimé(s)`);
  }
  return deleted;
}

// Initialize database with default schedule if empty
export async function initializeScheduleIfEmpty(db: D1Database): Promise<void> {
  const count = await db.prepare('SELECT COUNT(*) as count FROM schedule').first();
  
  if (count && (count as any).count === 0) {
    console.log('📋 Database is empty, initializing with default schedule...');
    
    const today = new Date();
    const schedule = [];
    
    // Find current Monday
    const currentMonday = new Date(today);
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentMonday.setDate(today.getDate() + daysToMonday);
    
    // Generate 4 weeks of schedule
    for (let week = 0; week < 4; week++) {
      for (let day = 0; day < 7; day++) {
        const date = new Date(currentMonday);
        date.setDate(currentMonday.getDate() + (week * 7) + day);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = day + 1; // 1=Lundi, 7=Dimanche
        
        // Nourrissage quotidien (plus d'urgents par défaut)
        schedule.push({
          date: dateStr,
          day_of_week: dayOfWeek,
          time: null,
          activity_type: 'Nourrissage',
          description: 'Nourrissage quotidien des animaux',
          notes: '',
          status: 'free',
          volunteer_name: null,
          volunteers: [],
          is_urgent_when_free: false
        });
        
        // Légumes le lundi - Biocoop
        if (day === 0) { // day 0 = lundi dans la boucle
          schedule.push({
            date: dateStr,
            day_of_week: dayOfWeek,
            time: null,
            activity_type: 'Légumes',
            description: 'Récupération et distribution de légumes',
            notes: 'Biocoop',
            status: 'free',
            volunteer_name: null,
            volunteers: [],
            is_urgent_when_free: false
          });
        }
        
        // Légumes le mardi - Carrefour
        if (day === 1) { // day 1 = mardi dans la boucle
          schedule.push({
            date: dateStr,
            day_of_week: dayOfWeek,
            time: null,
            activity_type: 'Légumes',
            description: 'Récupération et distribution de légumes',
            notes: 'Carrefour',
            status: 'free',
            volunteer_name: null,
            volunteers: [],
            is_urgent_when_free: false
          });
        }
        
        // Réunion vendredi semaine 2
        if (day === 4 && week === 1) {
          schedule.push({
            date: dateStr,
            day_of_week: dayOfWeek,
            time: null,
            activity_type: 'Réunion',
            description: 'Réunion mensuelle',
            notes: 'Réunion mensuelle du Cercle Animo',
            status: 'free',
            volunteer_name: null,
            volunteers: [],
            is_urgent_when_free: false
          });
        }
      }
    }
    
    await replaceSchedule(db, schedule);
    console.log('✅ Database initialized with', schedule.length, 'activities');
  }
}

// ===== JOURNAL DES MODIFICATIONS (AUDIT LOG) =====

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  action_type: string;
  actor_name: string | null;
  actor_ip: string | null;
  slot_id: number | null;
  slot_date: string | null;
  slot_activity: string | null;
  details: string;
}

// Labels lisibles pour chaque type d'action
export const ACTION_LABELS: Record<string, string> = {
  'inscription':           '📝 Inscription à un créneau',
  'desinscription':        '🚫 Désinscription d\'un créneau',
  'ajout_creneau':         '➕ Ajout d\'un créneau',
  'modification_creneau':  '✏️ Modification d\'un créneau',
  'suppression_creneau':   '🗑️ Suppression d\'un créneau',
  'reset_database':        '⚠️ Réinitialisation de la base',
  'restauration_backup':   '🔄 Restauration d\'un backup',
  'creation_backup':       '💾 Création d\'un backup',
};

/**
 * Enregistre une entrée dans le journal des modifications
 */
export async function logAction(
  db: D1Database,
  params: {
    action_type: string;
    actor_name?: string | null;
    actor_ip?: string | null;
    slot_id?: number | null;
    slot_date?: string | null;
    slot_activity?: string | null;
    details: string;
  }
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO audit_log (action_type, actor_name, actor_ip, slot_id, slot_date, slot_activity, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      params.action_type,
      params.actor_name || null,
      params.actor_ip || null,
      params.slot_id || null,
      params.slot_date || null,
      params.slot_activity || null,
      params.details
    ).run();
  } catch (error) {
    // On ne bloque jamais l'action principale si le log échoue
    console.error('⚠️ Erreur lors de l\'enregistrement dans audit_log:', error);
  }
}

/**
 * Récupère les entrées du journal (les plus récentes en premier)
 */
export async function getAuditLog(
  db: D1Database,
  options: {
    limit?: number;
    offset?: number;
    action_type?: string;
    actor_name?: string;
  } = {}
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  // Construire les conditions WHERE dynamiquement
  const conditions: string[] = [];
  const bindings: any[] = [];

  if (options.action_type) {
    conditions.push('action_type = ?');
    bindings.push(options.action_type);
  }
  if (options.actor_name) {
    conditions.push('actor_name LIKE ?');
    bindings.push(`%${options.actor_name}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Compter le total
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM audit_log ${whereClause}
  `).bind(...bindings).first();
  const total = (countResult as any)?.total || 0;

  // Récupérer les entrées (sans actor_ip — visible uniquement via Cloudflare)
  const result = await db.prepare(`
    SELECT id, timestamp, action_type, actor_name, slot_id, slot_date, slot_activity, details
    FROM audit_log
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all();

  return {
    entries: result.results as any[],
    total
  };
}

/**
 * Nettoie les anciennes entrées du journal (garde les N dernières)
 */
export async function cleanOldAuditLog(db: D1Database, keepCount: number = 500): Promise<number> {
  const result = await db.prepare(`
    DELETE FROM audit_log
    WHERE id NOT IN (
      SELECT id FROM audit_log ORDER BY timestamp DESC LIMIT ?
    )
  `).bind(keepCount).run();

  const deleted = result.meta.changes || 0;
  if (deleted > 0) {
    console.log(`🗑️ ${deleted} ancienne(s) entrée(s) de journal supprimée(s)`);
  }
  return deleted;
}

/**
 * Extrait l'adresse IP réelle depuis les headers Cloudflare
 */
export function extractIp(request: Request): string | null {
  // CF-Connecting-IP est injecté automatiquement par Cloudflare
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || null;
}

// ===== AUTO-GESTION DES SEMAINES =====

/**
 * Supprime les semaines trop anciennes (> 7 jours dans le passé)
 * Retourne le nombre d'activités supprimées
 */
export async function cleanOldWeeks(db: D1Database): Promise<number> {
  const today = new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setDate(today.getDate() - 7); // 7 jours dans le passé
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  
  const result = await db.prepare(`
    DELETE FROM schedule WHERE date < ?
  `).bind(cutoffStr).run();
  
  const deleted = result.meta.changes || 0;
  if (deleted > 0) {
    console.log(`🗑️ ${deleted} activité(s) ancienne(s) supprimée(s) (< ${cutoffStr})`);
  }
  
  return deleted;
}

/**
 * Ajoute de nouvelles semaines pour maintenir toujours 12 semaines à l'avance
 * Retourne le nombre d'activités ajoutées
 */
export async function addNewWeeks(db: D1Database, targetWeeks: number = 12): Promise<number> {
  // 1. Trouver la date maximale existante
  const maxDateResult = await db.prepare('SELECT MAX(date) as max_date FROM schedule').first();
  const maxDateStr = (maxDateResult as any)?.max_date;
  
  let lastDate: Date;
  
  if (maxDateStr) {
    lastDate = new Date(maxDateStr);
    lastDate.setDate(lastDate.getDate() + 1); // Commencer le lendemain
  } else {
    // Pas de données : commencer au lundi de cette semaine
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    lastDate = new Date(today);
    lastDate.setDate(today.getDate() + daysToMonday);
  }
  
  // 2. Calculer combien de jours on a déjà à l'avance
  const today = new Date();
  const daysInFuture = Math.ceil((lastDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const targetDays = targetWeeks * 7;
  const daysToAdd = Math.max(0, targetDays - daysInFuture);
  
  if (daysToAdd === 0) {
    console.log(`✅ Planning déjà à jour (${Math.floor(daysInFuture / 7)} semaines à l'avance)`);
    return 0;
  }
  
  // 3. Générer les nouvelles activités
  const newActivities = [];
  const startId = (await db.prepare('SELECT MAX(id) as max_id FROM schedule').first() as any)?.max_id || 0;
  let currentId = startId + 1;
  
  for (let dayOffset = 0; dayOffset < daysToAdd; dayOffset++) {
    const date = new Date(lastDate);
    date.setDate(lastDate.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // 1=Lundi, 7=Dimanche
    
    // Nourrissage quotidien (plus d'urgents par défaut)
    newActivities.push({
      id: currentId++,
      date: dateStr,
      day_of_week: dayOfWeek,
      time: null,
      activity_type: 'Nourrissage',
      description: 'Nourrissage quotidien des animaux',
      notes: '',
      status: 'free',
      volunteer_name: null,
      volunteers: [],
      is_urgent_when_free: false
    });
    
    // Légumes le lundi - Biocoop
    if (dayOfWeek === 1) {
      newActivities.push({
        id: currentId++,
        date: dateStr,
        day_of_week: dayOfWeek,
        time: null,
        activity_type: 'Légumes',
        description: 'Récupération et distribution de légumes',
        notes: 'Biocoop',
        status: 'free',
        volunteer_name: null,
        volunteers: [],
        is_urgent_when_free: false
      });
    }
    
    // Légumes le mardi - Carrefour
    if (dayOfWeek === 2) {
      newActivities.push({
        id: currentId++,
        date: dateStr,
        day_of_week: dayOfWeek,
        time: null,
        activity_type: 'Légumes',
        description: 'Récupération et distribution de légumes',
        notes: 'Carrefour',
        status: 'free',
        volunteer_name: null,
        volunteers: [],
        is_urgent_when_free: false
      });
    }
  }
  
  // 4. Insérer en base de données
  if (newActivities.length > 0) {
    const statements = newActivities.map(activity => {
      const volunteersJson = JSON.stringify(activity.volunteers);
      return db.prepare(`
        INSERT INTO schedule (id, date, time, activity_type, description, notes, status, volunteer_name, volunteers, is_urgent_when_free)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        activity.id,
        activity.date,
        activity.time,
        activity.activity_type,
        activity.description,
        activity.notes,
        activity.status,
        activity.volunteer_name,
        volunteersJson,
        activity.is_urgent_when_free ? 1 : 0
      );
    });
    
    await db.batch(statements);
    console.log(`📅 ${newActivities.length} nouvelle(s) activité(s) ajoutée(s) (${Math.floor(daysToAdd / 7)} semaines)`);
  }
  
  return newActivities.length;
}

/**
 * Maintenance automatique : nettoie les vieilles semaines et ajoute les nouvelles
 * À appeler au chargement du planning
 * @param db - Database instance
 * @param targetWeeks - Nombre de semaines à maintenir à l'avance (par défaut 12)
 * @param enableCleanup - Si true, supprime les semaines anciennes. Si false, garde tout l'historique (par défaut true)
 */
export async function autoManageWeeks(db: D1Database, targetWeeks: number = 12, enableCleanup: boolean = true): Promise<void> {
  console.log('🔄 Auto-gestion des semaines...');
  
  let deleted = 0;
  
  // 1. Supprimer les semaines anciennes (> 7 jours) - OPTIONNEL
  if (enableCleanup) {
    deleted = await cleanOldWeeks(db);
  } else {
    console.log('📚 Conservation de tout l\'historique (pas de suppression)');
  }
  
  // 2. Ajouter de nouvelles semaines pour maintenir le nombre cible
  const added = await addNewWeeks(db, targetWeeks);
  
  console.log(`✅ Auto-gestion terminée : ${deleted} supprimées, ${added} ajoutées`);
}
