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
        
        // Nourrissage quotidien
        const nourrissageId = week * 20 + day + 1;
        let nourrissageStatus = 'free';
        let nourrissageVolunteer = null;
        
        // Some test data
        if (day === 0 || day === 3) {
          nourrissageStatus = 'urgent';
        } else if (day === 1) {
          nourrissageStatus = 'assigned';
          nourrissageVolunteer = 'Alice';
        }
        
        schedule.push({
          date: dateStr,
          day_of_week: dayOfWeek,
          time: null,
          activity_type: 'Nourrissage',
          description: 'Nourrissage quotidien des animaux',
          notes: '',
          status: nourrissageStatus,
          volunteer_name: nourrissageVolunteer,
          volunteers: nourrissageVolunteer ? [nourrissageVolunteer] : [],
          is_urgent_when_free: day === 0 || day === 3
        });
        
        // Légumes le mardi
        if (day === 1) {
          schedule.push({
            date: dateStr,
            day_of_week: dayOfWeek,
            time: null,
            activity_type: 'Légumes',
            description: 'Récupération et distribution de légumes',
            notes: '',
            status: 'assigned',
            volunteer_name: 'Clement',
            volunteers: ['Clement'],
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
