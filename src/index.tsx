import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { 
  getAllSchedule, 
  getScheduleById, 
  createScheduleSlot, 
  updateScheduleSlot, 
  deleteScheduleSlot, 
  replaceSchedule,
  initializeScheduleIfEmpty,
  createBackup,
  getAllBackups,
  getBackupById,
  restoreBackup,
  cleanOldBackups,
  autoManageWeeks
} from './db-helpers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Middleware CORS pour les API routes
app.use('/api/*', cors())

// Servir les fichiers statiques
app.use('/static/*', serveStatic({ root: './public' }))

// === PERSISTANCE D1 ===
// Les données sont maintenant stockées dans Cloudflare D1
// Persistance permanente garantie !

// Fonction pour générer le planning initial
function generateInitialSchedule() {
  const today = new Date();
  const schedule = [];
  
  // Trouver le lundi de la semaine actuelle (pas la suivante)
  const currentMonday = new Date(today);
  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 0 = dimanche
  currentMonday.setDate(today.getDate() + daysToMonday);
  
  // Générateur de données de test amélioré
  for (let week = 0; week < 4; week++) {
    for (let day = 0; day < 7; day++) {
      const date = new Date(currentMonday);
      date.setDate(currentMonday.getDate() + (week * 7) + day);
      const dateStr = date.toISOString().split('T')[0];
      
      // Nourrissage quotidien avec gestion avancée des statuts
      const nourrissageId = week * 20 + day + 1;
      let nourrissageStatus, nourrissageVolunteer = null;
      
      // Logique de test pour les statuts
      if (day === 0 || day === 3) { // Lundi et Jeudi urgents
        nourrissageStatus = 'urgent';
      } else if (day === 1) { // Mardi assigné
        nourrissageStatus = 'assigned';
        nourrissageVolunteer = 'Alice';
      } else if (day === 5 && week < 2) { // Samedi assigné sur 2 premières semaines
        nourrissageStatus = 'assigned';
        nourrissageVolunteer = 'Les Furgettes';
      } else {
        nourrissageStatus = 'available';
      }
      
      schedule.push({
        id: nourrissageId,
        date: dateStr,
        day_of_week: day + 1,
        activity_type: 'Nourrissage',
        volunteer_name: nourrissageVolunteer,
        volunteers: nourrissageVolunteer ? [nourrissageVolunteer] : [],  // Initialiser le tableau
        status: nourrissageStatus,
        color: '#dc3545', // Rouge pour urgent par défaut
        max_volunteers: 1,
        notes: '',
        is_urgent_when_free: day === 0 || day === 3
      });
      
      // Légumes le mardi avec Clement par défaut
      if (day === 1) {
        schedule.push({
          id: week * 20 + day + 10,
          date: dateStr,
          day_of_week: day + 1,
          activity_type: 'Légumes',
          volunteer_name: 'Clement',
          volunteers: ['Clement'],  // Utiliser le nouveau format
          status: 'assigned',
          color: '#ffc107', // Jaune pour légumes
          max_volunteers: 15,  // Limite uniforme de 15
          notes: '',
          is_urgent_when_free: false
        });
      }
      
      // Quelques réunions d'exemple
      if (day === 4 && week === 1) { // Vendredi semaine 2
        schedule.push({
          id: week * 20 + day + 15,
          date: dateStr,
          day_of_week: day + 1,
          activity_type: 'Réunion',
          volunteer_name: null,
          volunteers: [],  // Utiliser le nouveau format
          status: 'available',
          color: '#6f42c1', // Violet pour réunions
          max_volunteers: 15,  // Limite uniforme de 15
          notes: 'Réunion mensuelle du Cercle Animo',
          is_urgent_when_free: false
        });
      }
    }
  }
  
  return schedule;
}

// Routes API

// API - Récupérer tous les bénévoles
app.get('/api/volunteers', async (c) => {
  try {
    // Toujours retourner les données mockées pour le développement local
    // Cela évite les problèmes de migration/setup de DB
    return c.json([
      { id: 1, name: 'Alice', is_admin: true },
      { id: 2, name: 'Manu', is_admin: false },
      { id: 3, name: 'Guillaume', is_admin: false },
      { id: 4, name: 'Eliza', is_admin: false },
      { id: 5, name: 'Sandrine', is_admin: false },
      { id: 6, name: 'Laet', is_admin: false },
      { id: 7, name: 'Les Furgettes', is_admin: false }
    ]);
  } catch (error) {
    return c.json({ error: 'Erreur lors de la récupération des bénévoles' }, 500);
  }
});

// API - Ajouter un nouveau bénévole
app.post('/api/volunteers', async (c) => {
  try {
    const { name } = await c.req.json();
    
    if (!name || name.trim().length < 2) {
      return c.json({ error: 'Le nom doit contenir au moins 2 caractères' }, 400);
    }

    // En mode développement, simuler l'ajout
    const newVolunteer = {
      id: Date.now(),
      name: name.trim(),
      is_admin: false
    };

    return c.json({ success: true, volunteer: newVolunteer });
  } catch (error) {
    return c.json({ error: 'Erreur lors de ajout du bénévole' }, 500);
  }
});

// API - Récupérer les types d'activités
app.get('/api/activity-types', async (c) => {
  try {
    // Toujours retourner les données mockées pour le développement local
    return c.json([
      { id: 1, name: 'Nourrissage', description: 'Nourrissage quotidien des animaux', color: '#e3f2fd' },
      { id: 2, name: 'Légumes', description: 'Récupération et distribution de légumes', color: '#f3e5f5' },
      { id: 3, name: 'Réunion', description: 'Réunions et événements spéciaux', color: '#fff3e0' }
    ]);
  } catch (error) {
    return c.json({ error: 'Erreur lors de la récupération des activités' }, 500);
  }
});

// API - Récupérer le planning (prochaines 4 semaines)
app.get('/api/schedule', async (c) => {
  try {
    const db = c.env.DB;
    
    // Initialize schedule if database is empty
    await initializeScheduleIfEmpty(db);
    
    // Auto-manage weeks: NO deletion (keep history), add new ones to maintain 52 weeks (1 year) ahead
    // Vue calendrier : historique complet + inscription très en avance
    // Vue détaillée : filtrage côté client si nécessaire
    await autoManageWeeks(db, 52, false); // 52 semaines, pas de suppression
    
    // Get all schedule from D1
    const schedule = await getAllSchedule(db);
    
    console.log('📤 Envoi du planning - count:', schedule.length);
    return c.json(schedule);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du planning:', error);
    return c.json({ error: 'Erreur lors de la récupération du planning' }, 500);
  }
});

// API - S'inscrire sur un créneau
app.post('/api/schedule/:id/assign', async (c) => {
  try {
    const db = c.env.DB;
    const slotId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const volunteer_name = body.volunteer_name;
    
    console.log('✅ Assign API called:', { slotId, volunteer_name });

    // Get the slot from D1
    const slot = await getScheduleById(db, slotId);
    
    if (!slot) {
      console.log('❌ Créneau non trouvé:', slotId);
      return c.json({ error: 'Créneau non trouvé' }, 404);
    }
    
    // Update the slot
    slot.volunteer_name = volunteer_name;
    slot.status = 'assigned';
    
    // Add to volunteers array if not already there
    if (!slot.volunteers.includes(volunteer_name)) {
      slot.volunteers.push(volunteer_name);
    }
    
    await updateScheduleSlot(db, slotId, slot);
    
    console.log('💾 Créneau assigné:', { id: slotId, volunteer: volunteer_name });
    return c.json({ success: true, message: 'Inscription réussie', slot });
    
  } catch (error) {
    console.error('❌ Erreur API assign:', error);
    return c.json({ error: "Erreur lors de l'inscription: " + error.message }, 500);
  }
});

// API - Se désinscrire d'un créneau
app.post('/api/schedule/:id/unassign', async (c) => {
  try {
    const db = c.env.DB;
    const slotId = parseInt(c.req.param('id'));
    
    console.log('🔄 Unassign API called:', { slotId });

    // Get the slot from D1
    const slot = await getScheduleById(db, slotId);
    
    if (!slot) {
      console.log('❌ Créneau non trouvé:', slotId);
      return c.json({ error: 'Créneau non trouvé' }, 404);
    }
    
    // Update the slot
    slot.volunteer_name = null;
    slot.volunteers = [];
    slot.status = slot.is_urgent_when_free ? 'urgent' : 'free';
    
    await updateScheduleSlot(db, slotId, slot);
    
    console.log('💾 Créneau libéré:', { id: slotId });
    return c.json({ success: true, message: 'Désinscription réussie', slot });
    
  } catch (error) {
    console.error('❌ Erreur API unassign:', error);
    return c.json({ error: 'Erreur lors de la désinscription: ' + error.message }, 500);
  }
});

// API - Sauvegarder le planning complet
app.post('/api/schedule', async (c) => {
  try {
    const db = c.env.DB;
    const newSchedule = await c.req.json();
    
    // Valider que c'est bien un tableau
    if (!Array.isArray(newSchedule)) {
      return c.json({ error: 'Le planning doit être un tableau' }, 400);
    }
    
    // PROTECTION: Créer un backup automatique AVANT de sauvegarder
    const currentSchedule = await getAllSchedule(db);
    await createBackup(db, currentSchedule, 'auto', 'Backup automatique avant modification');
    
    // Sauvegarder le planning complet dans D1
    await replaceSchedule(db, newSchedule);
    
    // Nettoyer les vieux backups (garder les 100 derniers)
    await cleanOldBackups(db, 100);
    
    console.log('💾 Planning sauvegardé dans D1 - count:', newSchedule.length);
    return c.json({ 
      success: true, 
      message: 'Planning sauvegardé avec succès',
      count: newSchedule.length 
    });
  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error);
    return c.json({ error: 'Échec de la sauvegarde: ' + error.message }, 500);
  }
});

// API - Reset database (admin only)
app.post('/api/reset-database', async (c) => {
  try {
    const db = c.env.DB;
    
    // PROTECTION: Backup avant reset
    const currentSchedule = await getAllSchedule(db);
    await createBackup(db, currentSchedule, 'pre_reset', 'Backup avant réinitialisation complète');
    
    // Clear all data
    await db.prepare('DELETE FROM schedule').run();
    
    // Reinitialize with fresh data
    await initializeScheduleIfEmpty(db);
    
    const newSchedule = await getAllSchedule(db);
    
    return c.json({ 
      success: true, 
      message: 'Base de données réinitialisée',
      count: newSchedule.length 
    });
  } catch (error) {
    console.error('❌ Erreur reset:', error);
    return c.json({ error: 'Échec de la réinitialisation: ' + error.message }, 500);
  }
});

// API - Liste des backups disponibles
app.get('/api/backups', async (c) => {
  try {
    const db = c.env.DB;
    const backups = await getAllBackups(db, 50);
    
    return c.json({ 
      success: true, 
      backups: backups 
    });
  } catch (error) {
    console.error('❌ Erreur récupération backups:', error);
    return c.json({ error: 'Échec récupération backups: ' + error.message }, 500);
  }
});

// API - Créer un backup manuel
app.post('/api/backups/create', async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json();
    const description = body.description || 'Backup manuel';
    
    const currentSchedule = await getAllSchedule(db);
    const backupId = await createBackup(db, currentSchedule, 'manual', description);
    
    return c.json({ 
      success: true, 
      message: 'Backup créé avec succès',
      backupId: backupId,
      itemCount: currentSchedule.length
    });
  } catch (error) {
    console.error('❌ Erreur création backup:', error);
    return c.json({ error: 'Échec création backup: ' + error.message }, 500);
  }
});

// API - Restaurer un backup
app.post('/api/backups/:id/restore', async (c) => {
  try {
    const db = c.env.DB;
    const backupId = parseInt(c.req.param('id'));
    
    const success = await restoreBackup(db, backupId);
    
    if (!success) {
      return c.json({ error: 'Backup non trouvé ou invalide' }, 404);
    }
    
    const restoredSchedule = await getAllSchedule(db);
    
    return c.json({ 
      success: true, 
      message: 'Backup restauré avec succès',
      count: restoredSchedule.length
    });
  } catch (error) {
    console.error('❌ Erreur restauration backup:', error);
    return c.json({ error: 'Échec restauration: ' + error.message }, 500);
  }
});

// API - Migration des semaines existantes
app.post('/api/migrate-weeks', async (c) => {
  try {
    const db = c.env.DB;
    
    // Backup avant migration
    const currentSchedule = await getAllSchedule(db);
    await createBackup(db, currentSchedule, 'pre_migration', 'Backup automatique avant migration des semaines');
    
    // Calculer le lundi de la semaine prochaine
    const today = new Date();
    const currentMonday = new Date(today);
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentMonday.setDate(today.getDate() + daysToMonday);
    
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(currentMonday.getDate() + 7);
    const nextMondayStr = nextMonday.toISOString().split('T')[0];
    
    const futureActivities = currentSchedule.filter(slot => slot.date >= nextMondayStr);
    
    let updatedCount = 0;
    let addedCount = 0;
    const statements = [];
    
    // Grouper par date
    const byDate = {};
    futureActivities.forEach(slot => {
      if (!byDate[slot.date]) {
        byDate[slot.date] = [];
      }
      byDate[slot.date].push(slot);
    });
    
    const maxId = Math.max(...currentSchedule.map(s => s.id), 0);
    let newId = maxId + 1;
    
    Object.keys(byDate).sort().forEach(dateStr => {
      const activities = byDate[dateStr];
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      
      // Lundi - ajouter Legumes Biocoop si manquant
      if (dayOfWeek === 1) {
        const hasLegumesLundi = activities.some(a => a.activity_type === 'Légumes');
        if (!hasLegumesLundi) {
          statements.push(db.prepare('INSERT INTO schedule (id, date, time, activity_type, description, notes, status, volunteer_name, volunteers, is_urgent_when_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(newId++, dateStr, null, 'Légumes', 'Récupération et distribution de légumes', 'Biocoop', 'free', null, '[]', 0));
          addedCount++;
        }
      }
      
      // Mardi - ajouter Legumes Carrefour si manquant
      if (dayOfWeek === 2) {
        const hasLegumesMardi = activities.some(a => a.activity_type === 'Légumes');
        if (!hasLegumesMardi) {
          statements.push(db.prepare('INSERT INTO schedule (id, date, time, activity_type, description, notes, status, volunteer_name, volunteers, is_urgent_when_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(newId++, dateStr, null, 'Légumes', 'Récupération et distribution de légumes', 'Carrefour', 'free', null, '[]', 0));
          addedCount++;
        }
      }
      
      // Retirer urgents par defaut des nourrissages libres
      activities.forEach(activity => {
        if (activity.activity_type === 'Nourrissage' && activity.is_urgent_when_free) {
          const hasVolunteers = activity.volunteers && activity.volunteers.length > 0;
          if (!hasVolunteers) {
            statements.push(db.prepare('UPDATE schedule SET is_urgent_when_free = 0, status = ? WHERE id = ?').bind('free', activity.id));
            updatedCount++;
          }
        }
      });
    });
    
    if (statements.length > 0) {
      await db.batch(statements);
    }
    
    return c.json({
      success: true,
      message: 'Migration reussie',
      startDate: nextMondayStr,
      nourrissagesUpdated: updatedCount,
      legumesAdded: addedCount,
      totalChanges: statements.length
    });
    
  } catch (error) {
    console.error('Erreur migration:', error);
    return c.json({ error: 'Echec migration: ' + error.message }, 500);
  }
});

// API - Exporter le schedule actuel en JSON
app.get('/api/export', async (c) => {
  try {
    const db = c.env.DB;
    const schedule = await getAllSchedule(db);
    
    return c.json(schedule, 200, {
      'Content-Disposition': 'attachment; filename="calendrier-animo-export-' + new Date().toISOString().split('T')[0] + '.json"'
    });
  } catch (error) {
    console.error('Erreur export:', error);
    return c.json({ error: 'Echec export: ' + error.message }, 500);
  }
});

// Test route
app.get('/test', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head><title>Test Apostrophe Fix</title></head>
    <body>
      <h1>Test de l'apostrophe</h1>
      <script>
        console.log('✅ JavaScript chargé avec succès');
        function testError() {
          // Test avec apostrophe échappée
          console.log('Test apostrophe dans l\\'inscription');
          alert('L\\'apostrophe fonctionne !');
        }
        testError();
      </script>
    </body>
    </html>
  `)
});

// Route principale - Application web
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>❤️ Calendrier du Cercle Animô ❤️</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          /* Couleurs améliorées pour le nourrissage - moins flashy, plus lisibles */
          .status-urgent { 
            background-color: #2563eb; 
            color: white; 
            border: 2px solid #1d4ed8; 
            font-weight: 600;
            position: relative;
          }
          .status-assigned { 
            background-color: #1e40af; 
            color: white; 
            border: 2px solid #1e3a8a;
          }
          .status-available { 
            background-color: #16a34a; 
            color: white; 
            border: 2px solid #15803d;
          }
          
          /* Badge urgent (point d'exclamation) */
          .urgent-badge {
            position: absolute;
            top: -8px;
            right: -8px;
            width: 24px;
            height: 24px;
            background-color: #fbbf24;
            color: #92400e;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            border: 2px solid #f59e0b;
          }
          
          /* Mise en surbrillance du jour actuel */
          .today-highlight {
            background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%) !important;
            border: 3px solid #f59e0b !important;
            box-shadow: 0 0 15px rgba(245, 158, 11, 0.5) !important;
          }
          
          /* Mode admin */
          .admin-mode {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
          }
          
          .day-header { 
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            color: white;
          }
          
          .week-table { 
            min-width: 800px;
          }
          
          .week-table td {
            min-height: 80px;
            vertical-align: top;
            touch-action: pan-y pan-x; /* Allow vertical and horizontal scrolling on mobile */
          }
          
          @media (max-width: 768px) {
            .week-table {
              font-size: 0.875rem;
            }
            .week-table td {
              padding: 0.5rem;
              min-height: 60px;
              touch-action: pan-y pan-x; /* Explicitly allow scrolling on touch */
            }
            
            /* Allow page scroll even when touching calendar container */
            .overflow-x-auto {
              touch-action: pan-y pan-x;
            }
          }
          
          /* Modales */
          .modal {
            backdrop-filter: blur(4px);
          }
          
          .modal-content {
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            transform: translateY(-20px);
            animation: modalSlideIn 0.3s ease-out forwards;
          }
          
          @keyframes modalSlideIn {
            to {
              transform: translateY(0);
            }
          }
          
          .modal.hidden .modal-content {
            animation: modalSlideOut 0.3s ease-in forwards;
          }
          
          @keyframes modalSlideOut {
            to {
              transform: translateY(-20px);
              opacity: 0;
            }
          }
          
          /* Drag and Drop */
          .draggable-slot {
            transition: all 0.2s ease;
          }
          
          .draggable-slot:hover {
            transform: scale(1.02);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }
          
          .draggable-slot.dragging {
            opacity: 0.5;
            transform: rotate(5deg);
            cursor: grabbing !important;
            z-index: 1000;
          }
          
          /* Swipe Hint for Mobile */
          .swipe-hint {
            backdrop-filter: blur(4px);
          }
          
          .swipe-arrow {
            display: inline-block;
            animation: swipeArrow 1.5s ease-in-out infinite;
            font-size: 1.25rem;
            font-weight: bold;
          }
          
          @keyframes swipeArrow {
            0%, 100% {
              transform: translateX(0);
              opacity: 1;
            }
            50% {
              transform: translateX(-8px);
              opacity: 0.6;
            }
          }
          
          .drop-zone {
            transition: background-color 0.2s ease;
          }
          
          .drop-zone.drag-over {
            background-color: #e0f2fe !important;
            border: 2px dashed #0288d1 !important;
          }
          
          .drop-zone.drop-valid {
            background-color: #e8f5e8 !important;
            border: 2px dashed #4caf50 !important;
          }
          
          .drop-zone.drop-invalid {
            background-color: #ffebee !important;
            border: 2px dashed #f44336 !important;
          }
          
          /* Support tactile avancé */
          .touch-dragging {
            animation: touchDragPulse 0.5s ease-in-out infinite alternate;
            border: 3px solid #2196f3;
            box-shadow: 0 0 20px rgba(33, 150, 243, 0.5);
          }
          
          @keyframes touchDragPulse {
            from {
              transform: scale(1.1) rotate(5deg);
              box-shadow: 0 8px 25px rgba(0,0,0,0.3);
            }
            to {
              transform: scale(1.15) rotate(5deg);
              box-shadow: 0 12px 35px rgba(0,0,0,0.4);
            }
          }
          
          /* Améliorations tactiles */
          @media (hover: none) and (pointer: coarse) {
            /* Tous les éléments dans les cellules du tableau permettent le scroll */
            .week-table td * {
              touch-action: pan-x pan-y; /* Permet le scroll horizontal et vertical */
            }
            
            .draggable-slot {
              padding: 0.75rem !important;
              min-height: 80px;
              touch-action: pan-x pan-y; /* Permet le scroll horizontal et vertical par défaut */
            }
            
            /* Boutons dans les slots : ne pas bloquer le scroll */
            .draggable-slot button {
              touch-action: manipulation; /* Permet le scroll tout en gardant les clics */
            }
            
            /* En mode admin, désactiver le scroll pour permettre le drag-and-drop */
            .admin-draggable {
              touch-action: none !important;
            }
            
            .admin-draggable * {
              touch-action: none !important;
            }
            
            .draggable-slot:active {
              transform: scale(0.95);
              background-color: rgba(33, 150, 243, 0.1) !important;
            }
            
            .drop-zone {
              min-height: 100px;
              border-width: 3px !important;
            }
            
            .drop-zone.drag-over {
              animation: dropZonePulse 0.3s ease-in-out infinite alternate;
            }
          }
          
          @keyframes dropZonePulse {
            from { border-color: #0288d1; }
            to { border-color: #81d4fa; }
          }
          
          /* Accessibilité clavier */
          .draggable-slot:focus {
            outline: 3px solid #4caf50;
            outline-offset: 2px;
          }
          
          .keyboard-drag-mode .draggable-slot::after {
            content: "Appuyez sur Entrée pour sélectionner, flèches pour déplacer";
            position: absolute;
            bottom: -20px;
            left: 0;
            right: 0;
            background: #333;
            color: white;
            font-size: 10px;
            padding: 2px 4px;
            border-radius: 3px;
            z-index: 1000;
          }
          
          .keyboard-selected {
            outline: 3px solid #4caf50 !important;
            outline-offset: 3px;
            animation: keyboardSelectedPulse 1s ease-in-out infinite alternate;
          }
          
          @keyframes keyboardSelectedPulse {
            from { 
              box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
            }
            to { 
              box-shadow: 0 0 20px rgba(76, 175, 80, 0.8);
            }
          }
          
          /* Fond d'écran fixe avec image des chèvres */
          body {
            background-image: url('https://page.gensparksite.com/v1/base64_upload/4f478e7ec73b3e6176c7d99f3d825222');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            background-attachment: fixed; /* L'image reste fixe pendant le scroll */
          }
          
          /* Overlay blanc réduit pour mieux voir l'image */
          body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(255, 255, 255, 0.4); /* Overlay blanc plus transparent pour mieux voir l'image */
            z-index: -1;
          }
          
          /* S'assurer que le contenu principal est au-dessus */
          body > div {
            position: relative;
            z-index: 1;
          }
        </style>
    </head>
    <body class="min-h-screen">
        <div class="max-w-full mx-auto p-4 lg:p-6">
            <!-- En-tête -->
            <header class="text-center mb-8">
                <h1 class="text-3xl lg:text-4xl font-bold text-gray-800 mb-2" style="text-shadow: 2px 2px 4px rgba(255,255,255,0.8), -1px -1px 2px rgba(255,255,255,0.8);">
                    ❤️ Planning du Cercle Animô ❤️
                </h1>
                <p class="text-base lg:text-lg font-bold mb-4" style="color: #1f2937; text-shadow: 1px 1px 3px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9), 0 0 10px rgba(255,255,255,0.7);">
                    Calendrier de nourrissage des animaux et activités de la ferme
                </p>
                

            </header>

            <!-- Méthode unique d'entrée du nom (compact après validation) -->
            <div id="nameInputContainer" class="bg-white rounded-lg shadow-md p-4 lg:p-6 mb-6">
                <div class="max-w-md mx-auto">
                    <h2 class="text-xl font-semibold mb-4 text-center">
                        <i class="fas fa-user mr-2"></i>
                        Ton prénom
                    </h2>
                    <div class="flex gap-3">
                        <input 
                            type="text" 
                            id="userName" 
                            placeholder="Saisir ton prénom..." 
                            class="flex-1 px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            maxlength="50"
                            autocomplete="name"
                        >
                        <button 
                            id="validateNameBtn" 
                            class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            <i class="fas fa-check mr-1"></i>
                            OK
                        </button>
                    </div>
                    <div id="nameStatus" class="mt-2 text-sm text-center"></div>
                </div>
            </div>

            <!-- Boutons d'administration (masqués par défaut) -->
            <div id="adminSection" class="hidden bg-white rounded-lg shadow-md p-4 lg:p-6 mb-6">
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-cog mr-2"></i>
                    Administration
                </h2>
                <div class="flex flex-wrap gap-4">
                    <button id="cleanupBtn" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                        <i class="fas fa-trash mr-2"></i>
                        Nettoyer les dates passées
                    </button>
                </div>
            </div>
            
            <!-- Bouton Mode Admin - En haut à droite -->
            <div class="fixed top-4 right-4 z-40">
                <button id="toggleAdminBtn" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-lg">
                    <i class="fas fa-cog mr-2"></i>
                    Admin
                </button>
            </div>

            <!-- Panneau d'administration (masqué par défaut) -->
            <div id="adminPanel" class="hidden admin-mode rounded-lg shadow-md p-4 lg:p-6 mb-6">
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-tools mr-2"></i>
                    Administration
                </h2>
                <div class="grid grid-cols-1 gap-3">
                    <button id="addActivityBtn" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                        <i class="fas fa-plus-circle mr-2"></i>
                        Ajouter Activite
                    </button>
                </div>
            </div>

            <!-- Message d'erreur -->
            <div id="errorMessage" class="hidden bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
                <span id="errorText"></span>
            </div>

            <!-- Calendrier -->
            <div id="calendar" class="space-y-6">
                <!-- Le calendrier sera généré ici par JavaScript -->
            </div>

            <!-- Modal Ajouter Activité -->
            <div id="addActivityModal" class="modal hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div class="modal-content bg-white rounded-lg p-6 mx-4 max-w-md w-full">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">
                            <i class="fas fa-plus-circle mr-2"></i>
                            Ajouter une Activité
                        </h3>
                        <button id="closeAddActivityModal" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="addActivityForm">
                        <div class="mb-4">
                            <label for="activityType" class="block text-sm font-medium text-gray-700 mb-2">
                                Type d&apos;activité
                            </label>
                            <select id="activityType" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                                <option value="">Sélectionner un type</option>
                                <option value="Légumes">Légumes</option>
                                <option value="Réunion">Réunion</option>
                                <option value="Autre">Autre</option>
                            </select>
                        </div>
                        <div class="mb-4" id="customActivityTitle" style="display: none;">
                            <label for="customTitle" class="block text-sm font-medium text-gray-700 mb-2">
                                Titre de l&apos;activité
                            </label>
                            <input type="text" id="customTitle" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Nom de votre activité">
                        </div>
                        <div class="mb-4">
                            <label for="activityDate" class="block text-sm font-medium text-gray-700 mb-2">
                                Date
                            </label>
                            <input type="date" id="activityDate" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                        </div>
                        <div class="mb-4">
                            <label for="activityTime" class="block text-sm font-medium text-gray-700 mb-2">
                                Horaire (optionnel)
                            </label>
                            <input type="time" id="activityTime" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        </div>

                        <div class="mb-4">
                            <label for="activityNotes" class="block text-sm font-medium text-gray-700 mb-2">
                                Notes (optionnel)
                            </label>
                            <textarea id="activityNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Détails supplémentaires..."></textarea>
                        </div>

                        <div class="flex gap-3">
                            <button type="button" id="cancelAddActivity" class="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors">
                                Annuler
                            </button>
                            <button type="submit" class="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                                <i class="fas fa-check mr-2"></i>
                                Ajouter
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Modal Modifier Activité -->
            <div id="modifyActivityModal" class="modal hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div class="modal-content bg-white rounded-lg p-6 mx-4 max-w-md w-full">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">
                            <i class="fas fa-edit mr-2"></i>
                            Modifier l'Activité
                        </h3>
                        <button id="closeModifyActivityModal" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="modifyActivityForm">
                        <input type="hidden" id="modifyActivityId">
                        <div class="mb-4">
                            <label for="modifyActivityType" class="block text-sm font-medium text-gray-700 mb-2">
                                Type d'activité
                            </label>
                            <select id="modifyActivityType" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                                <option value="">Sélectionner un type</option>
                                <option value="Légumes">Légumes</option>
                                <option value="Réunion">Réunion</option>
                                <option value="Autre">Autre</option>
                            </select>
                        </div>
                        <div class="mb-4" id="modifyCustomActivityTitle" style="display: none;">
                            <label for="modifyCustomTitle" class="block text-sm font-medium text-gray-700 mb-2">
                                Titre de l'activité
                            </label>
                            <input type="text" id="modifyCustomTitle" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Nom de votre activité">
                        </div>
                        <div class="mb-4">
                            <label for="modifyActivityDate" class="block text-sm font-medium text-gray-700 mb-2">
                                Date
                            </label>
                            <input type="date" id="modifyActivityDate" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                        </div>
                        <div class="mb-4">
                            <label for="modifyActivityTime" class="block text-sm font-medium text-gray-700 mb-2">
                                Horaire (optionnel)
                            </label>
                            <input type="time" id="modifyActivityTime" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        </div>

                        <div class="mb-4">
                            <label for="modifyActivityNotes" class="block text-sm font-medium text-gray-700 mb-2">
                                Notes (optionnel)
                            </label>
                            <textarea id="modifyActivityNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Détails supplémentaires..."></textarea>
                        </div>

                        <div class="flex gap-3">
                            <button type="button" id="cancelModifyActivity" class="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors">
                                Annuler
                            </button>
                            <button type="submit" class="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                                <i class="fas fa-save mr-2"></i>
                                Sauvegarder
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Modal Ajouter Personne -->
            <div id="addPersonModal" class="modal hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div class="modal-content bg-white rounded-lg p-6 mx-4 max-w-md w-full">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">
                            <i class="fas fa-user-plus mr-2"></i>
                            Ajouter une Personne
                        </h3>
                        <button id="closeAddPersonModal" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="addPersonForm">
                        <div class="mb-4">
                            <label for="personName" class="block text-sm font-medium text-gray-700 mb-2">
                                Nom du bénévole
                            </label>
                            <input type="text" id="personName" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Nom complet" required minlength="2">
                        </div>
                        <div class="mb-6">
                            <label class="flex items-center">
                                <input type="checkbox" id="isAdmin" class="mr-2">
                                <span class="text-sm text-gray-700">Droits d&apos;administration</span>
                            </label>
                        </div>
                        <div class="flex gap-3">
                            <button type="button" id="cancelAddPerson" class="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors">
                                Annuler
                            </button>
                            <button type="submit" class="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                                <i class="fas fa-check mr-2"></i>
                                Ajouter
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Modal Historique -->
            <div id="historyModal" class="modal hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div class="modal-content bg-white rounded-lg p-6 mx-4 max-w-lg w-full max-h-96">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">
                            <i class="fas fa-history mr-2"></i>
                            Historique des Actions
                        </h3>
                        <button id="closeHistoryModal" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="historyList" class="space-y-2 max-h-64 overflow-y-auto">
                        <!-- L'historique sera généré ici -->
                    </div>
                    <div class="mt-4 text-center">
                        <button id="closeHistoryBtn" class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">
                            Fermer
                        </button>
                    </div>
                </div>
            </div>

            <!-- Loading -->
            <div id="loading" class="text-center py-8">
                <i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i>
                <p class="text-gray-600 mt-2">Chargement du planning...</p>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            let currentUser = null;
            let isAdminMode = false;
            let schedule = [];
            // Vue par défaut: calendar (vue calendrier mensuel)
            // Charge la préférence depuis localStorage si elle existe
            let viewMode = localStorage.getItem('viewMode') || 'calendar'; // 'calendar' ou 'table'
            let currentCalendarMonth = new Date(); // Mois affiché dans le calendrier
            let scrollPositions = {}; // Sauvegarder les positions de scroll
            
            // Classe pour gérer l'historique des actions
            class ActionHistory {
                constructor() {
                    this.actions = [];
                    this.currentIndex = -1;
                    this.maxSize = 50;
                }
                
                addAction(action) {
                    // Supprimer les actions après l'index actuel si on en ajoute une nouvelle
                    this.actions = this.actions.slice(0, this.currentIndex + 1);
                    
                    // Ajouter la nouvelle action
                    this.actions.push({
                        ...action,
                        timestamp: new Date(),
                        id: Date.now()
                    });
                    
                    this.currentIndex++;
                    
                    // Limiter la taille
                    if (this.actions.length > this.maxSize) {
                        this.actions.shift();
                        this.currentIndex--;
                    }
                }
                
                canUndo() {
                    return this.currentIndex >= 0;
                }
                
                canRedo() {
                    return this.currentIndex < this.actions.length - 1;
                }
                
                undo() {
                    if (this.canUndo()) {
                        const action = this.actions[this.currentIndex];
                        this.currentIndex--;
                        return action;
                    }
                    return null;
                }
                
                redo() {
                    if (this.canRedo()) {
                        this.currentIndex++;
                        const action = this.actions[this.currentIndex];
                        return action;
                    }
                    return null;
                }
                
                getHistory() {
                    return this.actions.slice().reverse();
                }
            }
            
            const actionHistory = new ActionHistory();

            document.addEventListener('DOMContentLoaded', async () => {
                console.log('🔄 DOMContentLoaded - début');
                try {
                    // La vue par défaut est 'calendar' (vue calendrier mensuel)
                    // L'utilisateur peut changer sa préférence avec le bouton toggle
                    // Ne pas forcer la vue - respecter la préférence localStorage
                    if (!localStorage.getItem('viewMode')) {
                        localStorage.setItem('viewMode', 'calendar');
                        viewMode = 'calendar';
                    }
                    
                    console.log('📚 Chargement utilisateur...');
                    loadUserFromStorage();
                    console.log('🎯 Configuration event listeners...');
                    setupEventListeners();
                    console.log('📅 Chargement planning...');
                    await loadSchedule();
                    console.log('✅ Application chargée avec succès');
                    
                    // DÉSACTIVÉ TEMPORAIREMENT - Causait la perte de données
                    // Démarrer l'auto-refresh toutes les 15 secondes pour voir les changements des autres
                    // startAutoRefresh();
                } catch (error) {
                    console.error('❌ Erreur lors du chargement:', error);
                }
            });

            function loadUserFromStorage() {
                const savedName = localStorage.getItem('cercle_animo_username');
                if (savedName) {
                    document.getElementById('userName').value = savedName;
                    setCurrentUser(savedName);
                }
            }

            function saveUserToStorage(name) {
                localStorage.setItem('cercle_animo_username', name);
            }

            function setCurrentUser(name) {
                currentUser = name;
                updateNameStatus('Connecte en tant que: ' + name, 'text-green-600');
                document.getElementById('loading').style.display = 'none';
                
                // Compacter l'encart du nom après validation pour libérer de l'espace
                const nameContainer = document.getElementById('nameInputContainer');
                if (nameContainer) {
                    nameContainer.className = 'bg-white rounded-lg shadow p-2 mb-4';
                    nameContainer.innerHTML = '<div class="flex items-center justify-between max-w-md mx-auto">' +
                        '<div class="flex items-center gap-2">' +
                            '<span class="text-sm font-medium text-gray-700">👤 ' + name + '</span>' +
                        '</div>' +
                        '<button onclick="editName()" class="text-xs px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors">' +
                            '<i class="fas fa-edit mr-1"></i>Modifier' +
                        '</button>' +
                    '</div>';
                }
                
                // Render calendar only if schedule data is already loaded
                // This prevents rendering with empty data during initial page load
                if (schedule && schedule.length > 0) {
                    renderCalendar();
                }
            }

            function updateNameStatus(message, className = '') {
                const statusDiv = document.getElementById('nameStatus');
                statusDiv.textContent = message;
                statusDiv.className = 'mt-2 text-sm text-center ' + className;
            }
            
            function editName() {
                // Restaurer le formulaire complet pour modifier le nom
                const nameContainer = document.getElementById('nameInputContainer');
                if (nameContainer) {
                    nameContainer.className = 'bg-white rounded-lg shadow-md p-4 lg:p-6 mb-6';
                    nameContainer.innerHTML = '<div class="max-w-md mx-auto">' +
                        '<h2 class="text-xl font-semibold mb-4 text-center">' +
                            '<i class="fas fa-user mr-2"></i>' +
                            'Ton prénom' +
                        '</h2>' +
                        '<div class="flex gap-3">' +
                            '<input ' +
                                'type="text" ' +
                                'id="userName" ' +
                                'placeholder="Saisir ton prénom..." ' +
                                'class="flex-1 px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"' +
                                'maxlength="50"' +
                                'autocomplete="name"' +
                                'value="' + (currentUser || '') + '"' +
                            '>' +
                            '<button ' +
                                'id="validateNameBtn" ' +
                                'class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"' +
                            '>' +
                                '<i class="fas fa-check mr-1"></i>' +
                                'OK' +
                            '</button>' +
                        '</div>' +
                        '<div id="nameStatus" class="mt-2 text-sm text-center"></div>' +
                    '</div>';
                    
                    // Réattacher l'event listener
                    document.getElementById('validateNameBtn').addEventListener('click', validateName);
                    document.getElementById('userName').addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') validateName();
                    });
                    
                    // Focus sur l'input
                    document.getElementById('userName').focus();
                }
            }

            async function loadSchedule() {
                try {
                    console.log('Chargement des données...');
                    const response = await axios.get('/api/schedule');
                    schedule = response.data;
                    console.log('Données reçues:', schedule.length, 'éléments');
                    
                    // DÉSACTIVÉ - Causait la perte de données à chaque actualisation
                    // La suppression des vieilles semaines doit être manuelle via le mode admin
                    // await autoDeleteOldWeek();
                    
                    renderCalendar();
                    console.log('Calendrier rendu avec succès');
                } catch (error) {
                    console.error('Erreur lors du chargement:', error);
                    document.getElementById('loading').innerHTML = 
                        '<p class="text-red-600">❌ Erreur lors du chargement des données</p>';
                }
            }
            
            async function autoDeleteOldWeek() {
                try {
                    const today = new Date();
                    const dayOfWeek = today.getDay(); // 0 = Dimanche, 1 = Lundi, 2 = Mardi, etc.
                    
                    // Ne supprimer que si on est mardi (2) ou après
                    if (dayOfWeek < 2) {
                        console.log('Pas encore mardi, conservation de toutes les semaines');
                        return;
                    }
                    
                    // Trouver le lundi de la semaine actuelle
                    const currentMonday = getMonday(today);
                    const currentMondayStr = currentMonday.toISOString().split('T')[0];
                    
                    // Grouper les activités par semaine
                    const weekGroups = groupByWeeks(schedule);
                    
                    if (weekGroups.length === 0) return;
                    
                    // Trouver la semaine précédente (la première semaine qui n'est pas la semaine actuelle)
                    let weekToDelete = null;
                    let weekIndex = -1;
                    
                    for (let i = 0; i < weekGroups.length; i++) {
                        const week = weekGroups[i];
                        const weekMonday = getMonday(new Date(week[0].date));
                        const weekMondayStr = weekMonday.toISOString().split('T')[0];
                        
                        // Si cette semaine est avant la semaine actuelle, c'est une semaine à supprimer
                        if (weekMondayStr < currentMondayStr) {
                            weekToDelete = week;
                            weekIndex = i;
                            break; // Supprimer seulement la première semaine passée trouvée
                        }
                    }
                    
                    // Si on a trouvé une semaine à supprimer
                    if (weekToDelete && weekToDelete.length > 0) {
                        const idsToDelete = weekToDelete.map(slot => slot.id);
                        
                        const firstDate = new Date(weekToDelete[0].date);
                        const lastDate = new Date(weekToDelete[weekToDelete.length - 1].date);
                        const weekInfo = 'du ' + firstDate.getDate() + '/' + (firstDate.getMonth() + 1) + 
                                       ' au ' + lastDate.getDate() + '/' + (lastDate.getMonth() + 1);
                        
                        console.log('🗑️ Suppression automatique de la semaine précédente (' + weekInfo + ')');
                        
                        // Supprimer de la liste locale
                        schedule = schedule.filter(slot => !idsToDelete.includes(slot.id));
                        
                        // Sauvegarder dans D1
                        await axios.post('/api/schedule', schedule);
                        
                        // Recharger depuis le serveur pour synchroniser
                        const response = await axios.get('/api/schedule');
                        schedule = response.data;
                        
                        console.log('✅ Semaine précédente supprimée automatiquement');
                    } else {
                        console.log('Aucune semaine précédente à supprimer');
                    }
                } catch (error) {
                    console.error('Erreur lors de la suppression automatique:', error);
                    // Ne pas bloquer le chargement en cas d'erreur
                }
            }

            let autoRefreshInterval = null;
            
            function startAutoRefresh() {
                // Rafraîchir toutes les 15 secondes pour voir les changements des autres utilisateurs
                autoRefreshInterval = setInterval(async () => {
                    try {
                        // Sauvegarder les positions de scroll
                        const scrollPositions = {};
                        document.querySelectorAll('.overflow-x-auto').forEach((container, index) => {
                            scrollPositions[index] = container.scrollLeft;
                        });
                        
                        const response = await axios.get('/api/schedule');
                        const newSchedule = response.data;
                        
                        // Vérifier si les données ont changé
                        if (JSON.stringify(newSchedule) !== JSON.stringify(schedule)) {
                            console.log('🔄 Mise à jour auto : nouvelles données détectées');
                            schedule = newSchedule;
                            renderCalendar();
                            
                            // Restaurer les positions de scroll
                            setTimeout(() => {
                                document.querySelectorAll('.overflow-x-auto').forEach((container, index) => {
                                    if (scrollPositions[index] !== undefined) {
                                        container.scrollLeft = scrollPositions[index];
                                    }
                                });
                            }, 50);
                        }
                    } catch (error) {
                        console.error("Erreur lors de l'auto-refresh:", error);
                    }
                }, 15000); // 15 secondes
            }
            
            function stopAutoRefresh() {
                if (autoRefreshInterval) {
                    clearInterval(autoRefreshInterval);
                    autoRefreshInterval = null;
                }
            }

            function setupEventListeners() {
                // Helper function to safely add event listener
                const safeAddListener = (id, event, handler) => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.addEventListener(event, handler);
                    } else {
                        console.warn('Element #' + id + ' not found, skipping event listener');
                    }
                };
                
                // Essential listeners - must exist
                safeAddListener('validateNameBtn', 'click', validateName);
                const userNameInput = document.getElementById('userName');
                if (userNameInput) {
                    userNameInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') validateName();
                    });
                }

                safeAddListener('toggleAdminBtn', 'click', toggleAdminMode);
                
                // Admin panel buttons - may not exist yet
                safeAddListener('addActivityBtn', 'click', openAddActivityModal);
                
                // Modal event listeners - Add Activity
                safeAddListener('closeAddActivityModal', 'click', closeAddActivityModal);
                safeAddListener('cancelAddActivity', 'click', closeAddActivityModal);
                safeAddListener('addActivityForm', 'submit', submitAddActivity);
                safeAddListener('activityType', 'change', handleActivityTypeChange);
                
                // Modal event listeners - Modify Activity
                safeAddListener('closeModifyActivityModal', 'click', closeModifyActivityModal);
                safeAddListener('cancelModifyActivity', 'click', closeModifyActivityModal);
                safeAddListener('modifyActivityForm', 'submit', submitModifyActivity);
                safeAddListener('modifyActivityType', 'change', handleModifyActivityTypeChange);
                
                // Modal event listeners - Add Person  
                safeAddListener('closeAddPersonModal', 'click', closeAddPersonModal);
                safeAddListener('cancelAddPerson', 'click', closeAddPersonModal);
                safeAddListener('addPersonForm', 'submit', submitAddPerson);
                
                // Modal event listeners - History
                safeAddListener('closeHistoryModal', 'click', closeHistoryModal);
                safeAddListener('closeHistoryBtn', 'click', closeHistoryModal);
                
                // Close modals when clicking outside
                const addActivityModal = document.getElementById('addActivityModal');
                if (addActivityModal) {
                    addActivityModal.addEventListener('click', (e) => {
                        if (e.target.id === 'addActivityModal') closeAddActivityModal();
                    });
                }
                
                const modifyActivityModal = document.getElementById('modifyActivityModal');
                if (modifyActivityModal) {
                    modifyActivityModal.addEventListener('click', (e) => {
                        if (e.target.id === 'modifyActivityModal') closeModifyActivityModal();
                    });
                }
                
                const addPersonModal = document.getElementById('addPersonModal');
                if (addPersonModal) {
                    addPersonModal.addEventListener('click', (e) => {
                        if (e.target.id === 'addPersonModal') closeAddPersonModal();
                    });
                }
                
                const historyModal = document.getElementById('historyModal');
                if (historyModal) {
                    historyModal.addEventListener('click', (e) => {
                        if (e.target.id === 'historyModal') closeHistoryModal();
                    });
                }
                
                // Update undo/redo buttons only when needed
                updateUndoRedoButtons();
            }
            
            function validateName() {
                const name = document.getElementById('userName').value.trim();
                
                if (!name || name.length < 2) {
                    updateNameStatus('Veuillez saisir un nom de au moins 2 caracteres', 'text-red-600');
                    return;
                }

                setCurrentUser(name);
                saveUserToStorage(name);
            }

            function showError(message, className = 'text-red-600') {
                const errorDiv = document.getElementById('errorMessage');
                const errorText = document.getElementById('errorText');
                errorText.textContent = message;
                errorText.className = className;
                errorDiv.classList.remove('hidden');
                setTimeout(() => errorDiv.classList.add('hidden'), 5000);
            }

            function toggleAdminMode() {
                if (!currentUser) {
                    showError("Veuillez d'abord saisir ton prénom");
                    return;
                }

                isAdminMode = !isAdminMode;
                const adminPanel = document.getElementById('adminPanel');
                const toggleBtn = document.getElementById('toggleAdminBtn');

                if (isAdminMode) {
                    adminPanel.classList.remove('hidden');
                    toggleBtn.textContent = 'Quitter Mode Admin';
                    toggleBtn.className = 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors';
                    
                    // Ajouter action dans l'historique
                    actionHistory.addAction({
                        type: 'admin_mode_enabled',
                        data: { user: currentUser },
                        undoData: null
                    });
                } else {
                    adminPanel.classList.add('hidden');
                    toggleBtn.innerHTML = '<i class="fas fa-cog mr-2"></i>Mode Admin';
                    toggleBtn.className = 'px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors';
                }

                updateUndoRedoButtons();
                renderCalendar();
            }



            function renderCalendar() {
                console.log('renderCalendar appelé, currentUser:', currentUser, 'viewMode:', viewMode);
                
                if (!currentUser) {
                    document.getElementById('calendar').innerHTML = 
                        '<p class="text-center text-gray-500 py-8">Veuillez saisir ton prénom pour voir le planning</p>';
                    return;
                }

                // Router vers la bonne vue selon le mode
                if (viewMode === 'calendar') {
                    renderCalendarView();
                } else {
                    renderTableView();
                }
            }
            
            function renderCalendarView() {
                console.log('Rendu en mode calendrier mensuel');
                const calendar = document.getElementById('calendar');
                calendar.innerHTML = '';
                
                // Container principal
                const container = document.createElement('div');
                container.className = 'space-y-4';
                
                // Bouton toggle mode (visible sur mobile et desktop) - EN PREMIER
                const toggleDiv = document.createElement('div');
                toggleDiv.className = 'bg-white rounded-lg shadow p-3';
                
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all';
                toggleBtn.innerHTML = '<span>📊</span><span>Passer à la vue détaillée (tableau)</span>';
                toggleBtn.addEventListener('click', toggleViewMode);
                
                toggleDiv.appendChild(toggleBtn);
                container.appendChild(toggleDiv);
                
                // Navigation mois - ENSUITE
                const navDiv = document.createElement('div');
                navDiv.className = 'bg-white rounded-lg shadow p-4 flex items-center justify-between';
                
                const prevBtn = document.createElement('button');
                prevBtn.className = 'px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-medium hover:bg-indigo-200';
                prevBtn.textContent = '◄';
                prevBtn.addEventListener('click', () => changeMonth(-1));
                
                const monthSpan = document.createElement('span');
                monthSpan.id = 'currentMonth';
                monthSpan.className = 'font-bold text-lg';
                
                const nextBtn = document.createElement('button');
                nextBtn.className = 'px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-medium hover:bg-indigo-200';
                nextBtn.textContent = '►';
                nextBtn.addEventListener('click', () => changeMonth(1));
                
                navDiv.appendChild(prevBtn);
                navDiv.appendChild(monthSpan);
                navDiv.appendChild(nextBtn);
                container.appendChild(navDiv);
                
                // Calendrier mensuel
                const calendarContainer = document.createElement('div');
                calendarContainer.className = 'bg-white rounded-lg shadow p-4';
                calendarContainer.id = 'monthlyCalendar';
                container.appendChild(calendarContainer);
                
                // Stats semaine - EN PREMIER
                const statsDiv = document.createElement('div');
                statsDiv.className = 'bg-white rounded-lg shadow p-4';
                statsDiv.id = 'weekStats';
                container.appendChild(statsDiv);
                
                // Légende - ENSUITE
                const legendDiv = document.createElement('div');
                legendDiv.className = 'bg-white rounded-lg shadow p-4 text-sm';
                legendDiv.innerHTML = '<div class="font-semibold mb-3 text-gray-800">Légende :</div>' +
                    '<div class="space-y-2">' +
                        '<div class="flex items-start gap-2">' +
                            '<div class="w-5 h-5 bg-blue-200 border-2 border-blue-500 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">✓</div>' +
                            '<span class="text-gray-700 text-sm"><strong>Bleu :</strong> C&apos;est pris par quelqu&apos;un</span>' +
                        '</div>' +
                        '<div class="flex items-start gap-2">' +
                            '<div class="w-5 h-5 bg-green-100 border-2 border-green-400 rounded flex items-center justify-center text-xs flex-shrink-0 mt-0.5">⭕</div>' +
                            '<span class="text-gray-700 text-sm"><strong>Vert :</strong> C&apos;est dispo, mais Clément est là si besoin</span>' +
                        '</div>' +
                        '<div class="flex items-start gap-2">' +
                            '<div class="w-5 h-5 bg-yellow-100 border-2 border-yellow-400 rounded flex items-center justify-center text-xs flex-shrink-0 mt-0.5">⚠️</div>' +
                            '<span class="text-gray-700 text-sm"><strong>Jaune :</strong> On cherche quelqu&apos;un !!</span>' +
                        '</div>' +
                        '<div class="flex items-center gap-2 pt-2 border-t">' +
                            '<div class="w-4 h-4 bg-orange-200 border-2 border-orange-400 rounded flex items-center justify-center text-xs">🥕</div>' +
                            '<span class="text-gray-600 text-xs">Légumes</span>' +
                            '<div class="w-4 h-4 bg-purple-100 border-2 border-purple-300 rounded flex items-center justify-center text-xs">🎉</div>' +
                            '<span class="text-gray-600 text-xs">Événements</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mt-3 text-xs text-gray-600 bg-blue-50 p-2 rounded">' +
                        '💡 Cliquez sur un jour pour voir les détails et vous inscrire' +
                    '</div>';
                container.appendChild(legendDiv);
                
                calendar.appendChild(container);
                
                // Générer le calendrier
                generateMonthlyCalendar();
            }
            
            function generateMonthlyCalendar() {
                const currentMonth = currentCalendarMonth.getMonth();
                const currentYear = currentCalendarMonth.getFullYear();
                
                // Fonction locale pour obtenir le lundi d'une date (en string YYYY-MM-DD)
                const getMondayLocal = (dateStr) => {
                    const parts = dateStr.split('-');
                    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    const day = d.getDay();
                    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                    d.setDate(diff);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const dayNum = String(d.getDate()).padStart(2, '0');
                    return year + '-' + month + '-' + dayNum;
                };
                
                // Vérifier quelles semaines existent dans le schedule
                const existingMondays = new Set();
                schedule.forEach(slot => {
                    const monday = getMondayLocal(slot.date);
                    existingMondays.add(monday);
                });
                
                console.log('Semaines existantes:', Array.from(existingMondays));
                
                // Mettre à jour le titre
                const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                                   'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                document.getElementById('currentMonth').textContent = monthNames[currentMonth] + ' ' + currentYear;
                
                // Grouper les activités par date
                const activitiesByDate = {};
                schedule.forEach(slot => {
                    if (!activitiesByDate[slot.date]) {
                        activitiesByDate[slot.date] = [];
                    }
                    activitiesByDate[slot.date].push(slot);
                });
                
                console.log('📅 Calendrier mensuel:', monthNames[currentMonth], currentYear);
                console.log('📊 Total activités:', schedule.length);
                console.log('🗓️ Dates avec activités:', Object.keys(activitiesByDate).sort());
                
                // Calculer les dates du mois
                const firstDay = new Date(currentYear, currentMonth, 1);
                const lastDay = new Date(currentYear, currentMonth + 1, 0);
                const startDay = firstDay.getDay() || 7; // Lundi = 1
                const daysInMonth = lastDay.getDate();
                
                // Créer le calendrier
                const calendarHtml = '<div class="mb-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-600">' +
                        '<div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div><div>D</div>' +
                    '</div>' +
                    '<div class="grid grid-cols-7 gap-2" id="calendarDays"></div>';
                document.getElementById('monthlyCalendar').innerHTML = calendarHtml;
                
                const calendarDays = document.getElementById('calendarDays');
                
                // Jours vides avant le 1er
                for (let i = 1; i < startDay; i++) {
                    const emptyDiv = document.createElement('div');
                    emptyDiv.className = 'aspect-square';
                    calendarDays.appendChild(emptyDiv);
                }
                
                // Date du jour pour la surbrillance
                const today = new Date();
                const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
                
                // Jours du mois
                for (let day = 1; day <= daysInMonth; day++) {
                    // Construire la date en string directement pour éviter les problèmes de timezone
                    const dateStr = currentYear + '-' + String(currentMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
                    const activities = activitiesByDate[dateStr] || [];
                    
                    // Vérifier si c'est aujourd'hui
                    const isToday = dateStr === todayStr;
                    
                    // Vérifier si la semaine de ce jour existe
                    const mondayStr = getMondayLocal(dateStr);
                    const weekExists = existingMondays.has(mondayStr);
                    
                    const dayDiv = document.createElement('button');
                    dayDiv.className = 'aspect-square flex flex-col items-center justify-center border-2 rounded-lg p-1 transition-all';
                    
                    if (!weekExists) {
                        // Semaine n'existe pas - griser et désactiver
                        dayDiv.className += ' bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-50';
                        dayDiv.disabled = true;
                    } else {
                        dayDiv.className += ' hover:shadow-lg';
                    }
                    
                    // Compter les types d'activités
                    let hasUrgent = false;
                    let hasFreeNourrissage = false;
                    let hasTakenNourrissage = false;
                    let hasEvent = false;
                    let hasLegumes = false;
                    
                    activities.forEach(act => {
                        const isNourrissage = act.activity_type === 'Nourrissage';
                        const isLegumes = act.activity_type === 'Légumes';
                        const volunteers = act.volunteers || [];
                        const isFree = volunteers.length === 0;
                        
                        // Marquer comme urgent UNIQUEMENT si libre ET marqué urgent
                        if ((act.is_urgent_when_free || act.status === 'urgent') && isFree) {
                            hasUrgent = true;
                        }
                        
                        if (isNourrissage) {
                            if (isFree) {
                                hasFreeNourrissage = true;
                            } else {
                                hasTakenNourrissage = true;
                            }
                        } else if (isLegumes) {
                            hasLegumes = true;
                        } else {
                            // Tous les autres types d'activités sont des événements (Réunion, Nettoyage, Autre, etc.)
                            hasEvent = true;
                        }
                    });
                    
                    // Appliquer le style selon la priorité (seulement si la semaine existe)
                    if (weekExists) {
                        if (hasUrgent) {
                            dayDiv.className += ' bg-yellow-100 border-yellow-400 animate-pulse';
                        } else if (hasFreeNourrissage) {
                            // Nourrissage libre = VERT (comme dans la vue détaillée)
                            dayDiv.className += ' bg-green-100 border-green-400';
                        } else if (hasTakenNourrissage) {
                            // Nourrissage pris = BLEU FONCÉ (comme dans la vue détaillée)
                            dayDiv.className += ' bg-blue-200 border-blue-500';
                        } else {
                            dayDiv.className += ' border-gray-200';
                        }
                        
                        // Surbrillance du jour actuel avec bordure épaisse et fond distinct
                        if (isToday) {
                            dayDiv.className += ' !border-4 !border-indigo-600 ring-2 ring-indigo-300 bg-gradient-to-br from-indigo-50 to-purple-50';
                        }
                    }
                    
                    // Contenu du jour
                    const daySpan = document.createElement('span');
                    daySpan.className = 'text-sm font-medium ' + (hasUrgent ? 'text-red-700 font-bold' : 'text-gray-800');
                    daySpan.textContent = day.toString();
                    
                    // Afficher TOUTES les icônes pertinentes (seulement si semaine existe)
                    const iconsDiv = document.createElement('div');
                    iconsDiv.className = 'flex flex-wrap gap-0.5 mt-1 justify-center';
                    let iconsHtml = '';
                    
                    if (weekExists) {
                        // Icône de nourrissage (prioritaire)
                        if (hasUrgent) {
                            iconsHtml += '<span class="text-xs">⚠️</span>';
                        } else if (hasFreeNourrissage) {
                            iconsHtml += '<span class="text-xs">⭕</span>';
                        } else if (hasTakenNourrissage) {
                            iconsHtml += '<span class="text-xs">✓</span>';
                        }
                        
                        // Icône légumes/récup (carotte)
                        if (hasLegumes) {
                            iconsHtml += '<span class="text-xs">🥕</span>';
                        }
                        
                        // Icône événement spécial
                        if (hasEvent) {
                            iconsHtml += '<span class="text-xs">🎉</span>';
                        }
                    }
                    
                    iconsDiv.innerHTML = iconsHtml;
                    
                    // Créer un div pour afficher les prénoms inscrits
                    const namesDiv = document.createElement('div');
                    // Police plus petite, overflow géré par CSS automatiquement
                    namesDiv.style.fontSize = '10px';
                    namesDiv.style.lineHeight = '12px';
                    namesDiv.className = 'mt-1 px-0.5 w-full overflow-hidden whitespace-nowrap text-ellipsis';
                    
                    if (weekExists) {
                        // Récupérer le nourrissage du jour pour afficher qui est inscrit
                        const nourrissageOfDay = activities.find(act => act.activity_type === 'Nourrissage');
                        
                        if (nourrissageOfDay) {
                            const volunteers = nourrissageOfDay.volunteers || [];
                            const isUrgentSlot = (nourrissageOfDay.is_urgent_when_free || nourrissageOfDay.status === 'urgent') && volunteers.length === 0;
                            
                            if (isUrgentSlot) {
                                // Urgent : afficher "URGENT !" en rouge
                                namesDiv.className += ' text-red-600 font-bold';
                                namesDiv.textContent = 'URGENT !';
                            } else if (volunteers.length === 0) {
                                // Vert libre : afficher "Clément" en gris clair
                                namesDiv.className += ' text-gray-500';
                                namesDiv.textContent = 'Clément';
                            } else {
                                // Bleu pris : afficher le(s) prénom(s) en gras
                                namesDiv.className += ' font-semibold text-gray-800';
                                if (volunteers.length === 1) {
                                    // Laisser CSS gérer la troncature automatiquement
                                    namesDiv.textContent = volunteers[0];
                                } else {
                                    // Plusieurs inscrits : afficher le premier + nombre
                                    namesDiv.textContent = volunteers[0] + ' +' + (volunteers.length - 1);
                                }
                            }
                        }
                    }
                    
                    dayDiv.appendChild(daySpan);
                    dayDiv.appendChild(iconsDiv);
                    dayDiv.appendChild(namesDiv);
                    
                    // Ouvrir la modal seulement si la semaine existe
                    if (weekExists) {
                        dayDiv.onclick = () => openDayModal(dateStr, activities);
                    }
                    
                    calendarDays.appendChild(dayDiv);
                }
                
                // Calculer les stats de la semaine actuelle
                updateWeekStats();
            }
            
            function updateWeekStats() {
                const today = new Date();
                const monday = getMonday(today);
                const sundayDate = new Date(monday);
                sundayDate.setDate(monday.getDate() + 6);
                
                let toTakeCount = 0;     // Créneaux à prendre (libres)
                let urgentCount = 0;     // Créneaux urgents
                let eventCount = 0;      // Événements (Réunion, Autre)
                
                schedule.forEach(slot => {
                    const slotDate = new Date(slot.date);
                    if (slotDate >= monday && slotDate <= sundayDate) {
                        const hasVolunteers = slot.volunteers && slot.volunteers.length > 0;
                        const isUrgent = slot.is_urgent_when_free || slot.status === 'urgent';
                        const isEvent = slot.activity_type === 'Réunion' || slot.activity_type === 'Autre';
                        
                        // Compter les événements (Réunion, Autre)
                        if (isEvent) {
                            eventCount++;
                        }
                        
                        // Compter les créneaux à prendre (sans inscrits)
                        if (!hasVolunteers) {
                            toTakeCount++;
                            
                            // Compter les urgents UNIQUEMENT s'ils sont libres (sans inscrits)
                            if (isUrgent) {
                                urgentCount++;
                            }
                        }
                    }
                });
                
                const statsHtml = '<div class="font-semibold mb-3 text-gray-800">Cette semaine :</div>' +
                    '<div class="grid grid-cols-3 gap-3">' +
                        '<div class="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">' +
                            '<div class="text-2xl font-bold text-blue-600">' + toTakeCount + '</div>' +
                            '<div class="text-xs text-gray-600 mt-1">À prendre</div>' +
                        '</div>' +
                        '<div class="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-300">' +
                            '<div class="text-2xl font-bold text-red-600">' + urgentCount + '</div>' +
                            '<div class="text-xs text-gray-600 mt-1">Urgents ⚠️</div>' +
                        '</div>' +
                        '<div class="text-center p-3 bg-purple-50 rounded-lg border border-purple-300">' +
                            '<div class="text-2xl font-bold text-purple-600">' + eventCount + '</div>' +
                            '<div class="text-xs text-gray-600 mt-1">Événements 🎉</div>' +
                        '</div>' +
                    '</div>';
                document.getElementById('weekStats').innerHTML = statsHtml;
            }
            
            // Fonctions wrapper pour fermer la modale après inscription/désinscription
            async function assignSlotAndCloseModal(slotId) {
                await assignSlot(slotId);
                // Fermer la modale - utiliser un sélecteur spécifique pour éviter de supprimer d'autres éléments fixed
                const modal = document.querySelector('.modal-overlay');
                if (modal) modal.remove();
            }
            
            async function unassignSlotAndCloseModal(slotId) {
                await unassignSlot(slotId);
                // Fermer la modale - utiliser un sélecteur spécifique
                const modal = document.querySelector('.modal-overlay');
                if (modal) modal.remove();
            }
            
            function openDayModal(dateStr, activities) {
                const date = new Date(dateStr);
                const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                const dayName = dayNames[date.getDay()];
                const formattedDate = date.getDate() + ' ' + ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 
                    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][date.getMonth()];
                
                // Créer le modal
                const modal = document.createElement('div');
                modal.className = 'modal-overlay fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
                modal.onclick = (e) => {
                    if (e.target === modal) modal.remove();
                };
                
                const modalContent = document.createElement('div');
                modalContent.className = 'bg-white rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto shadow-2xl';
                
                let activitiesHtml = '';
                if (activities.length === 0) {
                    activitiesHtml = '<p class="text-center text-gray-500 py-4">Aucune activité ce jour</p>';
                } else {
                    activities.forEach(slot => {
                        const isUrgent = slot.is_urgent_when_free || slot.status === 'urgent';
                        const isFree = !slot.volunteers || slot.volunteers.length === 0;
                        const volunteers = slot.volunteers || [];
                        const isUserRegistered = volunteers.includes(currentUser);
                        const isNourrissage = slot.activity_type === 'Nourrissage';
                        const maxVolunteers = isNourrissage ? 1 : 15;
                        const isFull = volunteers.length >= maxVolunteers;
                        
                        let bgColor = 'bg-blue-50 border-blue-300';
                        let statusText = '⭕ Libre';
                        let buttonHtml = '';
                        
                        // Urgent UNIQUEMENT si libre ET marqué urgent
                        if (isUrgent && isFree) {
                            bgColor = 'bg-yellow-50 border-yellow-400';
                            statusText = '⚠️ URGENT - Personne inscrit';
                            // Texte pour les nourrissages urgents : "Je m'inscris !"
                            buttonHtml = '<button onclick="assignSlotAndCloseModal(' + slot.id + ')" class="w-full px-4 py-2 bg-red-500 text-white rounded font-bold hover:bg-red-600">Je m&apos;inscris !</button>';
                        } else if (isUserRegistered) {
                            bgColor = 'bg-gray-100 border-gray-400';
                            statusText = '✓ Vous êtes inscrit - ' + volunteers.join(', ') + (isNourrissage ? '' : ' (' + volunteers.length + '/' + maxVolunteers + ')');
                            buttonHtml = '<button onclick="unassignSlotAndCloseModal(' + slot.id + ')" class="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">Me désinscrire</button>';
                        } else if (isFull) {
                            bgColor = 'bg-gray-200 border-gray-400';
                            statusText = '✓ Complet - ' + volunteers.join(', ') + ' (' + volunteers.length + '/' + maxVolunteers + ')';
                        } else if (!isFree) {
                            bgColor = 'bg-gray-50 border-gray-300';
                            statusText = '👤 ' + volunteers.join(', ') + (isNourrissage ? '' : ' (' + volunteers.length + '/' + maxVolunteers + ')');
                            if (!isFull) {
                                // Texte pour inscription sur créneaux partiellement pris : "M'inscrire aussi"
                                buttonHtml = '<button onclick="assignSlotAndCloseModal(' + slot.id + ')" class="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">M&apos;inscrire aussi</button>';
                            }
                        } else {
                            // Texte pour inscription sur créneaux libres : "M'inscrire"
                            buttonHtml = '<button onclick="assignSlotAndCloseModal(' + slot.id + ')" class="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">M&apos;inscrire</button>';
                        }
                        
                        activitiesHtml += '<div class="border-l-4 ' + bgColor + ' p-3 rounded mb-3">' +
                                '<div class="font-medium text-sm mb-1">' + slot.activity_type + (slot.time ? ' - ' + slot.time : '') + '</div>' +
                                '<div class="text-xs text-gray-600 mb-2">' + statusText + '</div>' +
                                (slot.notes ? '<div class="text-xs italic text-gray-500 mb-2">' + slot.notes + '</div>' : '') +
                                buttonHtml +
                            '</div>';
                    });
                }
                
                modalContent.innerHTML = '<div class="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-t-lg flex justify-between items-center">' +
                        '<div>' +
                            '<h2 class="font-bold text-lg">' + dayName + '</h2>' +
                            '<p class="text-sm opacity-90">' + formattedDate + '</p>' +
                        '</div>' +
                        '<button onclick="this.closest(\\'.fixed\\').remove()" class="text-3xl hover:bg-white hover:bg-opacity-20 rounded px-2">×</button>' +
                    '</div>' +
                    '<div class="p-4">' +
                        activitiesHtml +
                    '</div>';
                
                modal.appendChild(modalContent);
                document.body.appendChild(modal);
            }
            
            function changeMonth(direction) {
                // Changer le mois affiché
                currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + direction, 1);
                // Régénérer le calendrier
                generateMonthlyCalendar();
            }
            
            function toggleViewMode() {
                viewMode = viewMode === 'calendar' ? 'table' : 'calendar';
                localStorage.setItem('viewMode', viewMode);
                renderCalendar();
                
                // Scroll en haut après changement de vue
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            
            function renderTableView() {
                console.log('Rendu du calendrier en mode tableau pour:', currentUser);
                
                // Sauvegarder les positions de scroll avant de re-render
                const containers = document.querySelectorAll('.overflow-x-auto');
                containers.forEach((container, index) => {
                    scrollPositions['table_' + index] = container.scrollLeft;
                });
                
                const calendar = document.getElementById('calendar');
                calendar.innerHTML = '';
                
                // Bouton toggle mode (visible sur mobile et desktop)
                const toggleDiv = document.createElement('div');
                toggleDiv.className = 'bg-white rounded-lg shadow p-3 mb-4';
                
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 hover:from-purple-700 hover:to-indigo-700 transition-all';
                toggleBtn.innerHTML = '<span>📅</span><span>Passer à la vue calendrier (mois)</span>';
                toggleBtn.addEventListener('click', toggleViewMode);
                
                toggleDiv.appendChild(toggleBtn);
                calendar.appendChild(toggleDiv);

                // Filtrer le schedule pour la vue détaillée : 8 semaines
                // (semaine dernière + semaine actuelle + 6 semaines suivantes)
                const today = new Date();
                const currentMonday = getMonday(today);
                const lastMonday = new Date(currentMonday);
                lastMonday.setDate(currentMonday.getDate() - 7); // Semaine dernière
                const endDate = new Date(currentMonday);
                endDate.setDate(currentMonday.getDate() + (7 * 7)); // +7 semaines = semaine actuelle + 6 suivantes
                
                const filteredSchedule = schedule.filter(slot => {
                    const slotDate = new Date(slot.date);
                    return slotDate >= lastMonday && slotDate < endDate;
                });
                
                console.log('Vue détaillée : affichage de', filteredSchedule.length, 'activités sur 8 semaines');
                
                const weekGroups = groupByWeeks(filteredSchedule);
                const todayStr = today.toISOString().split('T')[0];

                weekGroups.forEach((week, weekIndex) => {
                    const weekDiv = document.createElement('div');
                    weekDiv.className = 'bg-white rounded-lg shadow-lg overflow-hidden';
                    
                    // Conteneur avec scroll horizontal sur mobile
                    const tableContainer = document.createElement('div');
                    tableContainer.className = 'overflow-x-auto relative';
                    
                    // Indicateur de scroll permanent pour mobile (disparaît définitivement après premier scroll)
                    const swipeHintSeen = localStorage.getItem('swipeHintSeen');
                    
                    if (!swipeHintSeen) {
                        const swipeHint = document.createElement('div');
                        swipeHint.className = 'swipe-hint lg:hidden absolute right-0 top-1/2 transform -translate-y-1/2 bg-gradient-to-l from-indigo-600 to-indigo-500 text-white px-4 py-3 rounded-l-lg shadow-xl pointer-events-none z-20 transition-all duration-300';
                        swipeHint.innerHTML = '<div class="flex items-center gap-2 font-semibold text-sm">' +
                            '<span class="swipe-arrow">↔</span>' +
                            '<span>Glissez</span>' +
                            '</div>';
                        
                        // Gérer la visibilité selon le scroll - masquer définitivement dès le premier scroll
                        tableContainer.addEventListener('scroll', () => {
                            const scrollLeft = tableContainer.scrollLeft;
                            
                            // Masquer définitivement dès qu'on scrolle (pas de réapparition)
                            if (scrollLeft > 10) {
                                swipeHint.style.opacity = '0';
                                swipeHint.style.transform = 'translateX(100%) translateY(-50%)';
                                localStorage.setItem('swipeHintSeen', 'true');
                                // Retirer complètement l'élément du DOM après la transition
                                setTimeout(() => {
                                    if (swipeHint.parentNode) {
                                        swipeHint.parentNode.removeChild(swipeHint);
                                    }
                                }, 300);
                            }
                        });
                        
                        tableContainer.appendChild(swipeHint);
                    }
                    
                    // Créer le tableau
                    const table = document.createElement('table');
                    table.className = 'week-table w-full';

                    // En-tête avec les jours de la semaine
                    const thead = document.createElement('thead');
                    thead.className = 'day-header';
                    
                    const headerRow = document.createElement('tr');
                    
                    // Jours de la semaine (commence lundi)
                    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
                    const currentWeekStart = getMonday(new Date(week[0].date));
                    
                    dayNames.forEach((dayName, dayIndex) => {
                        const th = document.createElement('th');
                        th.className = 'p-3 lg:p-4 text-center font-semibold text-white border-r border-white/20 last:border-r-0 relative';
                        
                        const dayDate = new Date(currentWeekStart);
                        dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                        const isToday = dayDate.toISOString().split('T')[0] === todayStr;
                        
                        // Bouton X pour supprimer la ligne de semaine (seulement sur première colonne et après semaine 4)
                        let deleteButton = '';
                        if (isAdminMode && weekIndex >= 4 && dayIndex === 0) { // Seulement première colonne, après semaine 4
                            deleteButton = '<button onclick="deleteWeekRow(' + weekIndex + ')" class="absolute top-1 left-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600" title="Supprimer cette semaine">×</button>';
                        }
                        
                        th.innerHTML = 
                            deleteButton +
                            '<div class="text-sm font-medium">' + dayName + '</div>' +
                            '<div class="text-lg lg:text-xl font-bold ' + (isToday ? 'text-yellow-300' : '') + '">' + dayDate.getDate() + '</div>' +
                            '<div class="text-xs opacity-75">' + dayDate.toLocaleDateString('fr-FR', { month: 'short' }) + '</div>';
                        headerRow.appendChild(th);
                    });
                    
                    thead.appendChild(headerRow);
                    table.appendChild(thead);

                    // Corps du tableau avec les activités
                    const tbody = document.createElement('tbody');
                    
                    // Organiser les activités par jour pour chaque ligne
                    // Ligne 1 : Nourrissages
                    // Lignes 2+ : Autres activités (autant de lignes que nécessaire)
                    
                    // Créer la ligne des nourrissages (toujours en premier)
                    const nourrissageRow = document.createElement('tr');
                    nourrissageRow.className = 'border-b border-gray-200 hover:bg-gray-50';
                    
                    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
                        const cell = document.createElement('td');
                        cell.className = 'p-2 lg:p-3 border-r border-gray-200 last:border-r-0 align-top';
                        
                        const dayDate = new Date(currentWeekStart);
                        dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                        const isToday = dayDate.toISOString().split('T')[0] === todayStr;
                        
                        if (isToday) {
                            cell.classList.add('today-highlight');
                        }
                        
                        // Trouver le nourrissage pour ce jour
                        const nourrissage = week.find(slot => 
                            slot.day_of_week === (dayIndex + 1) && 
                            slot.activity_type === 'Nourrissage'
                        );
                        
                        if (nourrissage) {
                            const slotDiv = renderSlot(nourrissage);
                            cell.appendChild(slotDiv);
                        }
                        
                        nourrissageRow.appendChild(cell);
                    }
                    tbody.appendChild(nourrissageRow);
                    
                    // Organiser les autres activités par jour
                    const otherActivitiesByDay = {};
                    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
                        otherActivitiesByDay[dayIndex] = week.filter(slot => 
                            slot.day_of_week === (dayIndex + 1) && 
                            slot.activity_type !== 'Nourrissage'
                        );
                    }
                    
                    // Trouver le nombre maximum d'activités non-nourrissage sur un même jour
                    const maxActivitiesPerDay = Math.max(
                        0,
                        ...Object.values(otherActivitiesByDay).map(acts => acts.length)
                    );
                    
                    // Créer autant de lignes que nécessaire pour les autres activités
                    for (let rowIndex = 0; rowIndex < maxActivitiesPerDay; rowIndex++) {
                        const row = document.createElement('tr');
                        row.className = 'border-b border-gray-200 hover:bg-gray-50';
                        
                        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
                            const cell = document.createElement('td');
                            cell.className = 'p-2 lg:p-3 border-r border-gray-200 last:border-r-0 align-top';
                            
                            const dayDate = new Date(currentWeekStart);
                            dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                            const isToday = dayDate.toISOString().split('T')[0] === todayStr;
                            
                            if (isToday) {
                                cell.classList.add('today-highlight');
                            }
                            
                            // Rendre la cellule capable d'accepter les drops si en mode admin
                            if (isAdminMode) {
                                cell.setAttribute('data-day-index', dayIndex);
                                cell.setAttribute('data-row-index', rowIndex + 1); // +1 car ligne 0 = nourrissage
                                cell.setAttribute('data-date', dayDate.toISOString().split('T')[0]);
                                cell.classList.add('drop-zone');
                                
                                // Event listeners pour le drop
                                cell.addEventListener('dragover', handleDragOver);
                                cell.addEventListener('drop', handleDrop);
                                cell.addEventListener('dragenter', handleDragEnter);
                                cell.addEventListener('dragleave', handleDragLeave);
                            }
                            
                            // Afficher l'activité correspondant à cette ligne
                            const activities = otherActivitiesByDay[dayIndex];
                            if (activities && activities[rowIndex]) {
                                const slotDiv = renderSlot(activities[rowIndex]);
                                cell.appendChild(slotDiv);
                            }
                            
                            row.appendChild(cell);
                        }
                        
                        tbody.appendChild(row);
                    }

                    table.appendChild(tbody);
                    tableContainer.appendChild(table);
                    weekDiv.appendChild(tableContainer);
                    calendar.appendChild(weekDiv);
                });
                
                // NOTE: Bouton "Ajouter une semaine" supprimé (génération automatique active)
                // La fonction addNewWeek() est conservée dans le code pour future réimplémentation
                
                // Légende en bas pour la vue tableau
                const legendDiv = document.createElement('div');
                legendDiv.className = 'bg-white rounded-lg shadow p-4 text-sm mt-6';
                legendDiv.innerHTML = '<div class="font-semibold mb-3 text-gray-800">Légende :</div>' +
                    '<div class="grid grid-cols-2 md:grid-cols-3 gap-3">' +
                        '<div class="flex items-center gap-2">' +
                            '<div class="w-6 h-6 rounded" style="background-color: #16a34a; border: 2px solid #15803d;"></div>' +
                            '<span class="text-gray-700">Nourrissage libre</span>' +
                        '</div>' +
                        '<div class="flex items-center gap-2">' +
                            '<div class="w-6 h-6 rounded" style="background-color: #1e40af; border: 2px solid #1e3a8a;"></div>' +
                            '<span class="text-gray-700">Nourrissage pris</span>' +
                        '</div>' +
                        '<div class="flex items-center gap-2">' +
                            '<div class="w-6 h-6 rounded relative" style="background-color: #16a34a; border: 2px solid #15803d;">' +
                                '<div class="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-xs">!</div>' +
                            '</div>' +
                            '<span class="text-gray-700">Urgent</span>' +
                        '</div>' +
                        '<div class="flex items-center gap-2">' +
                            '<div class="w-6 h-6 rounded" style="background-color: #ff8c00; border: 2px solid #e67e00;"></div>' +
                            '<span class="text-gray-700">Légumes</span>' +
                        '</div>' +
                        '<div class="flex items-center gap-2">' +
                            '<div class="w-6 h-6 rounded" style="background-color: #6f42c1; border: 2px solid #5a32a3;"></div>' +
                            '<span class="text-gray-700">Réunion</span>' +
                        '</div>' +
                        '<div class="flex items-center gap-2">' +
                            '<div class="w-6 h-6 rounded" style="background-color: #17a2b8; border: 2px solid #138496;"></div>' +
                            '<span class="text-gray-700">Autre</span>' +
                        '</div>' +
                    '</div>';
                calendar.appendChild(legendDiv);
                
                // Initialiser la délégation d'événements pour optimiser les performances
                if (isAdminMode) {
                    initEventDelegation();
                }
                
                // Restaurer les positions de scroll après le render (setTimeout pour attendre le DOM)
                setTimeout(() => {
                    const newContainers = document.querySelectorAll('.overflow-x-auto');
                    newContainers.forEach((container, index) => {
                        const savedPosition = scrollPositions['table_' + index];
                        if (savedPosition !== undefined) {
                            container.scrollLeft = savedPosition;
                        }
                    });
                }, 0);
            }

            function renderSlot(slot) {
                const slotDiv = document.createElement('div');
                
                let statusClass = '';
                let showUrgentBadge = false;
                
                // Définir les couleurs par type d'activité
                const activityColors = {
                    'Nourrissage': { bg: '#dc3545', border: '#c82333' },  // Rouge
                    'Légumes': { bg: '#ff8c00', border: '#e67e00' },      // Orange
                    'Réunion': { bg: '#6f42c1', border: '#5a32a3' },      // Violet
                    'default': { bg: '#17a2b8', border: '#138496' }       // Cyan pour autres
                };
                
                const activityColor = activityColors[slot.activity_type] || activityColors['default'];
                
                if (slot.activity_type.toLowerCase().includes('nourrissage')) {
                    // Pour le nourrissage : bleu si pris, vert si libre
                    // Badge urgent UNIQUEMENT si le créneau est libre
                    if (slot.volunteer_name) {
                        // Créneau pris : bleu normal, SANS badge urgent (quelqu'un est inscrit)
                        statusClass = 'status-assigned'; // Bleu
                        showUrgentBadge = false; // Pas de badge urgent quand quelqu'un est inscrit
                    } else {
                        // Créneau libre : vert, avec badge urgent si marqué comme urgent
                        statusClass = 'status-available'; // Toujours vert pour les créneaux libres
                        showUrgentBadge = slot.status === 'urgent' || slot.is_urgent_when_free;
                    }
                } else {
                    // Pour les autres activités : utiliser les couleurs définies par type
                    statusClass = 'status-' + slot.status;
                    slotDiv.style.backgroundColor = activityColor.bg;
                    slotDiv.style.border = '2px solid ' + activityColor.border;
                    slotDiv.style.borderRadius = '0.375rem';
                }
                
                slotDiv.className = statusClass + ' rounded p-2 mb-2 transition-all hover:shadow-md text-xs lg:text-sm relative draggable-slot';
                
                // Rendre l'élément déplaçable si en mode admin (sauf nourrissages)
                if (isAdminMode && slot.activity_type !== 'Nourrissage') {
                    slotDiv.draggable = true;
                    slotDiv.setAttribute('data-slot-id', slot.id);
                    slotDiv.style.cursor = 'grab';
                    slotDiv.classList.add('admin-draggable'); // Marquer pour délégation d'événements
                    
                    // Les event listeners sont maintenant gérés par délégation dans initEventDelegation()
                }

                // Gérer les bénévoles : tableau pour multi-bénévoles, ou ancien format volunteer_name
                let volunteers = [];
                if (slot.volunteers && Array.isArray(slot.volunteers)) {
                    volunteers = slot.volunteers;
                } else if (slot.volunteer_name) {
                    volunteers = [slot.volunteer_name];
                }
                
                // Limite : 1 pour nourrissages, 15 pour tout le reste
                const maxVolunteers = slot.activity_type === 'Nourrissage' ? 1 : 15;
                const isFull = volunteers.length >= maxVolunteers;
                const isUserRegistered = volunteers.includes(currentUser);
                
                // Affichage des bénévoles - Toujours afficher tous les noms
                let volunteersDisplay = '';
                if (volunteers.length > 0) {
                    // Afficher tous les prénoms séparés par des virgules
                    volunteersDisplay = '👤 ' + volunteers.join(', ');
                } else {
                    volunteersDisplay = '⭕ Libre';
                }

                let actionButton = '';
                if (currentUser) {
                    if (isAdminMode) {
                        // Mode admin : boutons pour assigner/désassigner n'importe qui
                        
                        // Bouton urgent/normal (UNIQUEMENT pour les nourrissages)
                        let urgentButton = '';
                        if (slot.activity_type === 'Nourrissage') {
                            const urgentButtonText = (slot.status === 'urgent' || slot.is_urgent_when_free) ? 'Normal' : 'Urgent';
                            const urgentButtonClass = (slot.status === 'urgent' || slot.is_urgent_when_free) ? 'bg-gray-500 hover:bg-gray-600' : 'bg-yellow-500 hover:bg-yellow-600';
                            urgentButton = '<button onclick="toggleUrgentSlot(' + slot.id + ')" class="w-full px-2 py-1 ' + urgentButtonClass + ' text-white text-xs rounded">' + urgentButtonText + '</button>';
                        }
                        
                        // Boutons pour activités non-nourrissage
                        let modifyButton = '';
                        let deleteButton = '';
                        if (slot.activity_type !== 'Nourrissage') {
                            modifyButton = '<button onclick="modifyActivity(' + slot.id + ')" class="w-full px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">Modifier</button>';
                            deleteButton = '<button onclick="deleteActivity(' + slot.id + ')" class="w-full px-2 py-1 bg-red-800 text-white text-xs rounded hover:bg-red-900">Supprimer</button>';
                        }
                        
                        if (volunteers.length > 0) {
                            actionButton = '<div class="mt-1 space-y-1">' +
                                '<button onclick="adminAssignSlot(' + slot.id + ')" class="w-full px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600">Ajouter</button>' +
                                '<button onclick="adminUnassignSlot(' + slot.id + ')" class="w-full px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Retirer</button>' +
                                (urgentButton ? urgentButton : '') +
                                (modifyButton ? modifyButton : '') +
                                (deleteButton ? deleteButton : '') +
                                '</div>';
                        } else {
                            actionButton = '<div class="mt-1 space-y-1">' +
                                '<button onclick="adminAssignSlot(' + slot.id + ')" class="w-full px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600">Assigner</button>' +
                                (urgentButton ? urgentButton : '') +
                                (modifyButton ? modifyButton : '') +
                                (deleteButton ? deleteButton : '') +
                                '</div>';
                        }
                    } else {
                        // Mode normal : boutons pour l'utilisateur actuel
                        // Pour les nourrissages : système classique (1 personne max)
                        if (slot.activity_type === 'Nourrissage') {
                            if (!volunteers.length || volunteers.length === 0) {
                                actionButton = '<button onclick="assignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 w-full">Inscription</button>';
                            } else if (isUserRegistered) {
                                actionButton = '<button onclick="unassignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 w-full">Désinscription</button>';
                            }
                        } else {
                            // Pour les autres activités : multi-bénévoles
                            if (isUserRegistered) {
                                actionButton = '<button onclick="unassignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 w-full">Désinscription</button>';
                            } else if (!isFull) {
                                actionButton = '<button onclick="assignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 w-full">Inscription</button>';
                            } else {
                                actionButton = '<div class="mt-1 px-2 py-1 bg-gray-300 text-gray-600 text-xs rounded text-center">Complet</div>';
                            }
                        }
                    }
                }

                // Pictogramme urgent
                let urgentBadge = '';
                if (showUrgentBadge) {
                    urgentBadge = '<div class="urgent-badge"><i class="fas fa-exclamation"></i></div>';
                }

                // Échapper les caractères spéciaux dans les notes
                const safeNotes = slot.notes ? slot.notes.replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';
                
                // Formatage de l'heure si elle existe
                let timeDisplay = '';
                if (slot.time) {
                    timeDisplay = '<div class="text-xs mb-1 font-medium opacity-80">🕐 ' + slot.time + '</div>';
                }
                
                slotDiv.innerHTML = urgentBadge +
                                   '<div class="font-medium text-xs lg:text-sm mb-1">' + slot.activity_type + '</div>' +
                                   timeDisplay +
                                   '<div class="text-xs mb-1">' + volunteersDisplay + '</div>' +
                                   (safeNotes ? '<div class="text-xs italic mb-1 opacity-90">' + safeNotes + '</div>' : '') +
                                   actionButton;

                return slotDiv;
            }

            // Initialisation de la délégation d'événements pour optimiser les performances
            function initEventDelegation() {
                const calendar = document.getElementById('calendar');
                
                // Supprimer les anciens listeners s'ils existent
                if (calendar.dragListenerAdded) return;
                
                calendar.addEventListener('dragstart', function(e) {
                    if (e.target.classList.contains('admin-draggable')) {
                        handleDragStart(e);
                    }
                });
                
                calendar.addEventListener('dragend', function(e) {
                    if (e.target.classList.contains('admin-draggable')) {
                        handleDragEnd(e);
                    }
                });
                
                calendar.dragListenerAdded = true;
            }

            async function assignSlot(slotId) {
                try {
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) {
                        showError('Créneau non trouvé');
                        return;
                    }
                    
                    // Gérer le tableau de bénévoles
                    if (!slot.volunteers) {
                        slot.volunteers = [];
                    }
                    
                    // Vérifier si l'utilisateur est déjà inscrit
                    if (slot.volunteers.includes(currentUser)) {
                        showError('Vous êtes déjà inscrit à cette activité');
                        return;
                    }
                    
                    // Vérifier la limite
                    const maxVolunteers = slot.max_volunteers || 15;
                    if (slot.volunteers.length >= maxVolunteers) {
                        showError('Cette activité est complète (' + maxVolunteers + ' personnes max)');
                        return;
                    }
                    
                    // Ajouter le bénévole
                    slot.volunteers.push(currentUser);
                    
                    // Pour compatibilité avec l'ancien système (nourrissages)
                    if (slot.activity_type === 'Nourrissage') {
                        slot.volunteer_name = currentUser;
                    }
                    
                    // Mettre à jour le statut : si c'était urgent, retirer le statut urgent
                    // car maintenant quelqu'un est inscrit
                    slot.status = 'assigned';
                    // Ne pas retirer is_urgent_when_free car on veut le garder pour la réinscription
                    
                    // Sauvegarder la position de scroll avant de re-rendre
                    const scrollPositions = {};
                    document.querySelectorAll('.overflow-x-auto').forEach((container, index) => {
                        scrollPositions[index] = container.scrollLeft;
                    });
                    
                    // Sauvegarder sur le serveur
                    try {
                        await axios.post('/api/schedule', schedule);
                    } catch (saveError) {
                        console.error('Save error:', saveError);
                    }
                    
                    renderCalendar();
                    
                    // Restaurer les positions de scroll
                    setTimeout(() => {
                        document.querySelectorAll('.overflow-x-auto').forEach((container, index) => {
                            if (scrollPositions[index] !== undefined) {
                                container.scrollLeft = scrollPositions[index];
                            }
                        });
                    }, 50);
                    
                    showError('Inscription réussie !', 'text-green-600');
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors de l'inscription");
                }
            }

            async function unassignSlot(slotId) {
                try {
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) {
                        showError('Créneau non trouvé');
                        return;
                    }
                    
                    // Sauvegarder l'état avant changement pour l'historique
                    const oldState = { ...slot, volunteers: [...(slot.volunteers || [])] };
                    
                    // Gérer le tableau de bénévoles
                    if (!slot.volunteers) {
                        slot.volunteers = [];
                    }
                    
                    // Retirer le bénévole du tableau
                    slot.volunteers = slot.volunteers.filter(v => v !== currentUser);
                    
                    // Pour compatibilité avec l'ancien système (nourrissages)
                    if (slot.activity_type === 'Nourrissage') {
                        slot.volunteer_name = null;
                    }
                    
                    // Mettre à jour le statut
                    if (slot.volunteers.length === 0) {
                        slot.status = slot.is_urgent_when_free ? 'urgent' : 'available';
                    }
                    
                    // Sauvegarder la position de scroll avant de re-rendre
                    const scrollPositions = {};
                    document.querySelectorAll('.overflow-x-auto').forEach((container, index) => {
                        scrollPositions[index] = container.scrollLeft;
                    });
                    
                    // Sauvegarder sur le serveur
                    try {
                        await axios.post('/api/schedule', schedule);
                    } catch (saveError) {
                        console.error('Save error:', saveError);
                    }
                    
                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'unassign_slot',
                        data: { slotId: slotId, user: currentUser },
                        undoData: oldState
                    });
                    
                    updateUndoRedoButtons();
                    renderCalendar();
                    
                    // Restaurer les positions de scroll
                    setTimeout(() => {
                        document.querySelectorAll('.overflow-x-auto').forEach((container, index) => {
                            if (scrollPositions[index] !== undefined) {
                                container.scrollLeft = scrollPositions[index];
                            }
                        });
                    }, 50);
                    
                    showError('Désinscription réussie', 'text-orange-600');
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors de la désinscription");
                }
            }

            // === FONCTIONS ADMIN POUR GESTION DES CRÉNEAUX ===

            async function adminAssignSlot(slotId) {
                try {
                    const volunteerName = prompt('Ajouter quelle personne à cette activité ?');
                    
                    if (!volunteerName || !volunteerName.trim()) return;
                    
                    const selectedVolunteer = volunteerName.trim();
                    
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) {
                        showError('Créneau non trouvé');
                        return;
                    }
                    
                    // Initialiser le tableau si nécessaire
                    if (!slot.volunteers) {
                        slot.volunteers = [];
                    }
                    
                    // Vérifier si la personne est déjà inscrite
                    if (slot.volunteers.includes(selectedVolunteer)) {
                        showError(selectedVolunteer + ' est déjà inscrit à cette activité');
                        return;
                    }
                    
                    // Vérifier la limite
                    const maxVolunteers = slot.activity_type === 'Nourrissage' ? 1 : 15;
                    if (slot.volunteers.length >= maxVolunteers) {
                        showError('Cette activité est complète (' + maxVolunteers + ' personnes max)');
                        return;
                    }
                    
                    // Sauvegarder l'état avant pour l'historique
                    const previousVolunteers = [...slot.volunteers];
                    
                    // Ajouter le bénévole au tableau
                    slot.volunteers.push(selectedVolunteer);
                    
                    // Pour compatibilité avec l'ancien système (nourrissages)
                    if (slot.activity_type === 'Nourrissage') {
                        slot.volunteer_name = selectedVolunteer;
                    }
                    
                    slot.status = 'assigned';
                    
                    // Sauvegarder sur le serveur
                    try {
                        await axios.post('/api/schedule', schedule);
                    } catch (saveError) {
                        console.error('Save error:', saveError);
                    }
                    
                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'admin_assign_slot',
                        data: { slotId: slotId, volunteer: selectedVolunteer, admin: currentUser },
                        undoData: { slotId: slotId, previousVolunteers: previousVolunteers }
                    });
                    
                    updateUndoRedoButtons();
                    renderCalendar();
                    showError(selectedVolunteer + " ajouté à l'activité", 'text-green-600');
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors de l'assignation admin");
                }
            }

            async function adminUnassignSlot(slotId) {
                try {
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) {
                        showError('Créneau non trouvé');
                        return;
                    }
                    
                    // Si pas de bénévoles inscrits
                    if (!slot.volunteers || slot.volunteers.length === 0) {
                        showError('Aucun bénévole inscrit à cette activité');
                        return;
                    }
                    
                    // Si un seul bénévole, le retirer directement
                    let volunteerToRemove;
                    if (slot.volunteers.length === 1) {
                        volunteerToRemove = slot.volunteers[0];
                        if (!confirm('Retirer ' + volunteerToRemove + ' de ce créneau ?')) return;
                    } else {
                        // Si plusieurs bénévoles, demander lequel retirer
                        const volunteersList = slot.volunteers.join(', ');
                        volunteerToRemove = prompt("Retirer quelle personne ?\\n\\nInscrits actuellement: " + volunteersList);
                        
                        if (!volunteerToRemove || !volunteerToRemove.trim()) return;
                        
                        volunteerToRemove = volunteerToRemove.trim();
                        
                        // Vérifier que la personne est bien inscrite
                        if (!slot.volunteers.includes(volunteerToRemove)) {
                            showError(volunteerToRemove + " n'est pas inscrit à cette activité");
                            return;
                        }
                    }
                    
                    // Sauvegarder l'état avant pour l'historique
                    const previousVolunteers = [...slot.volunteers];
                    
                    // Retirer le bénévole du tableau
                    slot.volunteers = slot.volunteers.filter(v => v !== volunteerToRemove);
                    
                    // Pour compatibilité avec l'ancien système (nourrissages)
                    if (slot.activity_type === 'Nourrissage') {
                        slot.volunteer_name = null;
                    }
                    
                    // Mettre à jour le statut
                    if (slot.volunteers.length === 0) {
                        slot.status = slot.is_urgent_when_free ? 'urgent' : 'available';
                    }
                    
                    // Sauvegarder sur le serveur
                    try {
                        await axios.post('/api/schedule', schedule);
                    } catch (saveError) {
                        console.error('Save error:', saveError);
                    }
                    
                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'admin_unassign_slot',
                        data: { slotId: slotId, volunteer: volunteerToRemove, admin: currentUser },
                        undoData: { slotId: slotId, previousVolunteers: previousVolunteers }
                    });
                    
                    updateUndoRedoButtons();
                    renderCalendar();
                    showError(volunteerToRemove + " retiré de l'activité", 'text-orange-600');
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors du retrait admin');
                }
            }

            async function deleteActivity(slotId) {
                if (!isAdminMode) {
                    showError('Seuls les administrateurs peuvent supprimer des activités');
                    return;
                }
                
                try {
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) {
                        showError('Activité non trouvée');
                        return;
                    }
                    
                    // Empêcher la suppression des activités de nourrissage
                    if (slot.activity_type === 'Nourrissage') {
                        showError('Impossible de supprimer les activités de nourrissage');
                        return;
                    }
                    
                    const activityDesc = slot.activity_type + ' du ' + formatDate(slot.date);
                    
                    if (!confirm("Supprimer définitivement cette activité : " + activityDesc + " ?")) {
                        return;
                    }
                    
                    // Sauvegarder l'activité pour l'historique (undo)
                    const deletedActivity = { ...slot };
                    
                    // Supprimer l'activité du planning
                    schedule = schedule.filter(s => s.id !== slotId);
                    
                    // Sauvegarder sur le serveur
                    await axios.post('/api/schedule', schedule);
                    console.log('✅ Activity deletion saved to server');
                    
                    // Recharger depuis le serveur pour synchroniser
                    const response = await axios.get('/api/schedule');
                    schedule = response.data;
                    
                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'delete_activity',
                        data: { 
                            slotId: slotId, 
                            activityType: slot.activity_type,
                            date: slot.date,
                            user: currentUser 
                        },
                        undoData: { deletedActivity: deletedActivity }
                    });
                    
                    updateUndoRedoButtons();
                    renderCalendar();
                    
                    showError('Activité "' + activityDesc + '" supprimée', 'text-red-600');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors de la suppression de l'activité");
                }
            }

            async function toggleUrgentSlot(slotId) {
                if (!isAdminMode) {
                    showError('Seuls les administrateurs peuvent marquer les créneaux comme urgents');
                    return;
                }
                
                try {
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) {
                        showError('Créneau non trouvé');
                        return;
                    }
                    
                    // Déterminer l'état actuel
                    const wasUrgent = slot.status === 'urgent' || slot.is_urgent_when_free;
                    const newUrgentState = !wasUrgent;
                    
                    // Mettre à jour l'état
                    if (newUrgentState) {
                        // Marquer comme urgent
                        slot.is_urgent_when_free = true;
                        // Si le créneau est libre, changer le statut
                        if (!slot.volunteers || slot.volunteers.length === 0) {
                            slot.status = 'urgent';
                        }
                    } else {
                        // Retirer l'urgence
                        slot.is_urgent_when_free = false;
                        // Si le créneau est libre et était urgent, le passer en disponible
                        if (slot.status === 'urgent' && (!slot.volunteers || slot.volunteers.length === 0)) {
                            slot.status = 'available';
                        }
                    }
                    
                    // Sauvegarder sur le serveur
                    try {
                        await axios.post('/api/schedule', schedule);
                    } catch (saveError) {
                        console.error('Save error:', saveError);
                    }
                    
                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'toggle_urgent',
                        data: { 
                            slotId: slotId, 
                            newState: newUrgentState, 
                            activityType: slot.activity_type,
                            date: slot.date,
                            admin: currentUser 
                        },
                        undoData: { slotId: slotId, oldState: wasUrgent }
                    });
                    
                    updateUndoRedoButtons();
                    renderCalendar();
                    
                    const statusText = newUrgentState ? 'marqué comme urgent' : 'retiré du mode urgent';
                    showError('Créneau ' + statusText, 'text-blue-600');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors du changement d'urgence");
                }
            }

            // === FONCTIONS GESTION SEMAINES ===

            async function addNewWeek() {
                if (!isAdminMode) return;
                
                try {
                    // Trouver toutes les dates uniques et les trier
                    const uniqueDates = [...new Set(schedule.map(slot => slot.date))].sort();
                    const firstDateStr = uniqueDates[0];
                    const lastDateStr = uniqueDates[uniqueDates.length - 1];
                    
                    // Détecter les semaines manquantes dans le planning existant
                    const missingWeeks = [];
                    const firstDate = new Date(firstDateStr);
                    const lastDate = new Date(lastDateStr);
                    
                    // Obtenir le lundi de la première semaine
                    const firstMonday = new Date(firstDate);
                    const firstDayOfWeek = firstDate.getDay();
                    const daysToFirstMonday = firstDayOfWeek === 0 ? -6 : -(firstDayOfWeek - 1);
                    firstMonday.setDate(firstDate.getDate() + daysToFirstMonday);
                    
                    // Parcourir toutes les semaines entre la première et la dernière
                    let currentMonday = new Date(firstMonday);
                    while (currentMonday <= lastDate) {
                        const mondayStr = currentMonday.toISOString().split('T')[0];
                        
                        // Vérifier si cette semaine a au moins une activité
                        const weekHasActivities = schedule.some(slot => {
                            const slotDate = new Date(slot.date);
                            const slotMonday = new Date(slotDate);
                            const slotDayOfWeek = slotDate.getDay();
                            const daysToMonday = slotDayOfWeek === 0 ? -6 : -(slotDayOfWeek - 1);
                            slotMonday.setDate(slotDate.getDate() + daysToMonday);
                            
                            return slotMonday.toISOString().split('T')[0] === mondayStr;
                        });
                        
                        if (!weekHasActivities) {
                            missingWeeks.push(new Date(currentMonday));
                        }
                        
                        // Passer à la semaine suivante
                        currentMonday.setDate(currentMonday.getDate() + 7);
                    }
                    
                    // Déterminer quelle semaine ajouter
                    let targetMonday;
                    let message;
                    
                    if (missingWeeks.length > 0) {
                        // Il y a des semaines manquantes : remplir la première
                        targetMonday = missingWeeks[0];
                        message = 'Semaine manquante remplie (' + targetMonday.toISOString().split('T')[0] + ')';
                        console.log('Remplissage de semaine manquante:', targetMonday.toISOString().split('T')[0]);
                    } else {
                        // Pas de semaines manquantes : ajouter après la dernière
                        const dayOfWeek = lastDate.getDay();
                        let daysToAdd;
                        
                        if (dayOfWeek === 0) { // Dimanche
                            daysToAdd = 1;
                        } else { // Lundi à Samedi
                            daysToAdd = 8 - dayOfWeek;
                        }
                        
                        targetMonday = new Date(lastDate);
                        targetMonday.setDate(lastDate.getDate() + daysToAdd);
                        message = 'Nouvelle semaine ajoutée à la fin';
                        console.log('Ajout de nouvelle semaine à la fin:', targetMonday.toISOString().split('T')[0]);
                    }
                    
                    // Générer les activités pour la semaine
                    const newActivities = [];
                    
                    for (let day = 0; day < 7; day++) {
                        const date = new Date(targetMonday);
                        date.setDate(targetMonday.getDate() + day);
                        const dateStr = date.toISOString().split('T')[0];
                        const dayOfWeek = day + 1;
                        
                        // Nourrissage quotidien
                        const nourrissageActivity = {
                            date: dateStr,
                            day_of_week: dayOfWeek,
                            time: null,
                            activity_type: 'Nourrissage',
                            description: 'Nourrissage quotidien des animaux',
                            notes: '',
                            volunteer_name: null,
                            volunteers: [],
                            status: 'free',
                            is_urgent_when_free: false
                        };
                        
                        newActivities.push(nourrissageActivity);
                    }
                    
                    // Sauvegarder dans D1
                    await axios.post('/api/schedule', [...schedule, ...newActivities]);
                    
                    // Recharger le planning depuis le serveur
                    const response = await axios.get('/api/schedule');
                    const oldSchedule = schedule;
                    schedule = response.data;
                    
                    // Trouver les IDs des nouvelles activités ajoutées
                    const newActivityIds = newActivities.map(act => {
                        // Trouver l'activité correspondante dans le nouveau schedule
                        const matchingActivity = schedule.find(s => 
                            s.date === act.date && 
                            s.activity_type === act.activity_type &&
                            !oldSchedule.some(old => old.id === s.id)
                        );
                        return matchingActivity ? matchingActivity.id : null;
                    }).filter(id => id !== null);
                    
                    // Ajouter à l'historique pour l'undo
                    actionHistory.addAction({
                        type: 'add_new_week',
                        data: {
                            activities: newActivities,
                            user: currentUser,
                            monday: targetMonday.toISOString().split('T')[0]
                        },
                        undoData: {
                            activitiesToRemove: newActivityIds
                        }
                    });
                    
                    // Rafraîchir l'affichage
                    renderCalendar();
                    updateUndoRedoButtons();
                    
                    showError(message + ' avec ' + newActivities.length + ' nourrissages', 'text-green-600');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors de l'ajout de nouvelle semaine");
                }
            }

            async function deleteWeekRow(weekIndex) {
                if (!isAdminMode) {
                    showError('Seuls les administrateurs peuvent supprimer des semaines');
                    return;
                }
                
                if (weekIndex < 4) {
                    showError('Impossible de supprimer les 4 premières semaines');
                    return;
                }
                
                try {
                    // Grouper les activités par semaine
                    const weekGroups = groupByWeeks(schedule);
                    
                    // Vérifier que weekIndex est valide
                    if (weekIndex >= weekGroups.length) {
                        showError('Semaine non trouvée');
                        return;
                    }
                    
                    const weekToDelete = weekGroups[weekIndex];
                    
                    // Trouver les dates min et max de cette semaine
                    const datesInWeek = weekToDelete.map(slot => slot.date).sort();
                    const firstDateStr = datesInWeek[0];
                    const lastDateStr = datesInWeek[datesInWeek.length - 1];
                    const firstDate = new Date(firstDateStr);
                    const lastDate = new Date(lastDateStr);
                    
                    const weekInfo = 'du ' + firstDate.getDate() + '/' + (firstDate.getMonth() + 1) + 
                                   ' au ' + lastDate.getDate() + '/' + (lastDate.getMonth() + 1);
                    
                    if (!confirm("Supprimer définitivement la semaine (" + weekInfo + ") ?\\n\\nToutes les activités de cette semaine seront supprimées.")) {
                        return;
                    }
                    
                    // IDs des activités à supprimer
                    const idsToDelete = weekToDelete.map(slot => slot.id);
                    
                    console.log('Suppression de', idsToDelete.length, 'activités, IDs:', idsToDelete);
                    
                    // Sauvegarder les activités pour l'undo
                    const deletedActivities = weekToDelete.map(slot => ({...slot}));
                    
                    // Supprimer de la liste locale
                    schedule = schedule.filter(slot => !idsToDelete.includes(slot.id));
                    
                    console.log('Nouvelles activités après suppression:', schedule.length);
                    
                    // Sauvegarder dans D1
                    await axios.post('/api/schedule', schedule);
                    
                    // Recharger depuis le serveur
                    const response = await axios.get('/api/schedule');
                    schedule = response.data;
                    
                    console.log('Activités après rechargement:', schedule.length);
                    
                    // Ajouter à l'historique pour l'undo
                    actionHistory.addAction({
                        type: 'delete_week_row',
                        data: {
                            weekIndex: weekIndex,
                            user: currentUser,
                            weekInfo: weekInfo
                        },
                        undoData: {
                            deletedActivities: deletedActivities
                        }
                    });
                    
                    // Rafraîchir l'affichage
                    renderCalendar();
                    updateUndoRedoButtons();
                    
                    showError('Semaine supprimée (' + idsToDelete.length + ' activités)', 'text-red-600');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors de la suppression de la semaine');
                }
            }

            // === FONCTIONS UNDO/REDO ===

            async function undoAction() {
                try {
                    const action = actionHistory.undo();
                    if (!action) return;

                    // Traiter différents types d'actions
                    if (action.type === 'add_new_week' && action.undoData) {
                        // Supprimer les activités qui avaient été ajoutées
                        const activitiesToRemove = action.undoData.activitiesToRemove;
                        schedule = schedule.filter(slot => !activitiesToRemove.includes(slot.id));
                        
                        // Sauvegarder dans D1
                        await axios.post('/api/schedule', schedule);
                        
                        // Recharger depuis le serveur
                        const response = await axios.get('/api/schedule');
                        schedule = response.data;
                        
                        renderCalendar();
                        showError('Semaine supprimée (annulation)', 'text-orange-600');
                    } else if (action.type === 'delete_week_row' && action.undoData) {
                        // Restaurer les activités qui avaient été supprimées
                        const activitiesToRestore = action.undoData.deletedActivities;
                        schedule.push(...activitiesToRestore);
                        
                        // Sauvegarder dans D1
                        await axios.post('/api/schedule', schedule);
                        
                        // Recharger depuis le serveur
                        const response = await axios.get('/api/schedule');
                        schedule = response.data;
                        
                        renderCalendar();
                        showError('Semaine restaurée (annulation suppression)', 'text-orange-600');
                    } else if (action.type === 'add_activity' && action.undoData) {
                        // Supprimer l'activité qui avait été ajoutée
                        const activityId = action.undoData.activityId;
                        schedule = schedule.filter(activity => activity.id !== activityId);
                        renderCalendar();
                        showError('Activité supprimée (annulation)', 'text-orange-600');
                    } else if (action.type === 'modify_activity' && action.undoData) {
                        // Restaurer l'ancienne version de l'activité
                        const slotId = action.undoData.slotId;
                        const oldData = action.undoData.oldData;
                        const slotIndex = schedule.findIndex(s => s.id === slotId);
                        if (slotIndex !== -1) {
                            schedule[slotIndex] = oldData;
                            renderCalendar();
                            showError('Modifications annulées', 'text-orange-600');
                        }
                    } else if (action.type === 'delete_activity' && action.undoData) {
                        // Restaurer l'activité qui avait été supprimée
                        const deletedActivity = action.undoData.deletedActivity;
                        schedule.push(deletedActivity);
                        
                        // Sauvegarder dans D1
                        await axios.post('/api/schedule', schedule);
                        
                        // Recharger depuis le serveur
                        const response = await axios.get('/api/schedule');
                        schedule = response.data;
                        
                        renderCalendar();
                        showError('Activité restaurée (annulation suppression)', 'text-orange-600');
                    } else if (action.type === 'toggle_urgent' && action.undoData) {
                        // Restaurer l'état urgent précédent
                        const slotId = action.undoData.slotId;
                        const oldState = action.undoData.oldState;
                        const slot = schedule.find(s => s.id === slotId);
                        if (slot) {
                            slot.is_urgent_when_free = oldState;
                            if (oldState) {
                                if (!slot.volunteers || slot.volunteers.length === 0) {
                                    slot.status = 'urgent';
                                }
                            } else {
                                if (slot.status === 'urgent' && (!slot.volunteers || slot.volunteers.length === 0)) {
                                    slot.status = 'available';
                                }
                            }
                            await axios.post('/api/schedule', schedule);
                            renderCalendar();
                            const statusText = oldState ? 'rétabli en urgent' : 'rétabli en normal';
                            showError('Créneau ' + statusText + ' (annulation)', 'text-orange-600');
                        }
                    } else {
                        // Pour les autres types d'actions, juste afficher un message
                        showError('Action annulée: ' + action.type, 'text-orange-600');
                    }
                    
                    updateUndoRedoButtons();
                    
                    // En production, ici on ferait l'appel API pour annuler
                    // await axios.post('/api/undo');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors de l'annulation");
                }
            }

            async function redoAction() {
                try {
                    const action = actionHistory.redo();
                    if (!action) return;

                    // Traiter différents types d'actions
                    if (action.type === 'add_new_week' && action.data) {
                        // Restaurer les activités qui avaient été ajoutées
                        const activitiesToRestore = action.data.activities;
                        schedule.push(...activitiesToRestore);
                        
                        // Sauvegarder dans D1
                        await axios.post('/api/schedule', schedule);
                        
                        // Recharger depuis le serveur
                        const response = await axios.get('/api/schedule');
                        schedule = response.data;
                        
                        renderCalendar();
                        showError('Semaine restaurée (refait)', 'text-green-600');
                    } else if (action.type === 'delete_week_row' && action.data) {
                        // Refaire la suppression de semaine
                        const deletedActivities = action.undoData.deletedActivities;
                        const idsToDelete = deletedActivities.map(slot => slot.id);
                        schedule = schedule.filter(slot => !idsToDelete.includes(slot.id));
                        
                        // Sauvegarder dans D1
                        await axios.post('/api/schedule', schedule);
                        
                        // Recharger depuis le serveur
                        const response = await axios.get('/api/schedule');
                        schedule = response.data;
                        
                        renderCalendar();
                        showError('Semaine supprimée (refait)', 'text-red-600');
                    } else if (action.type === 'add_activity' && action.data) {
                        // Refaire l'ajout d'activité
                        const activityToRestore = action.data.activity;
                        schedule.push(activityToRestore);
                        renderCalendar();
                        showError('Activité restaurée (refait)', 'text-green-600');
                    } else if (action.type === 'modify_activity' && action.data) {
                        // Refaire la modification d'activité
                        const slotId = action.data.slotId;
                        const newData = action.data.newData;
                        const slotIndex = schedule.findIndex(s => s.id === slotId);
                        if (slotIndex !== -1) {
                            schedule[slotIndex] = newData;
                            renderCalendar();
                            showError('Modifications restaurées (refait)', 'text-green-600');
                        }
                    } else if (action.type === 'delete_activity' && action.data) {
                        // Refaire la suppression d'activité
                        const slotId = action.data.slotId;
                        schedule = schedule.filter(s => s.id !== slotId);
                        
                        // Sauvegarder dans D1
                        await axios.post('/api/schedule', schedule);
                        
                        // Recharger depuis le serveur
                        const response = await axios.get('/api/schedule');
                        schedule = response.data;
                        
                        renderCalendar();
                        showError('Activité supprimée (refait)', 'text-red-600');
                    } else if (action.type === 'toggle_urgent' && action.data) {
                        // Refaire le toggle urgent
                        const slotId = action.data.slotId;
                        const newState = action.data.newState;
                        const slot = schedule.find(s => s.id === slotId);
                        if (slot) {
                            slot.is_urgent_when_free = newState;
                            if (newState) {
                                if (!slot.volunteers || slot.volunteers.length === 0) {
                                    slot.status = 'urgent';
                                }
                            } else {
                                if (slot.status === 'urgent' && (!slot.volunteers || slot.volunteers.length === 0)) {
                                    slot.status = 'available';
                                }
                            }
                            await axios.post('/api/schedule', schedule);
                            renderCalendar();
                            const statusText = newState ? 'marqué comme urgent' : 'retiré du mode urgent';
                            showError('Créneau ' + statusText + ' (refait)', 'text-green-600');
                        }
                    } else {
                        // Pour les autres types d'actions, juste afficher un message
                        showError('Action restaurée: ' + action.type, 'text-green-600');
                    }
                    
                    updateUndoRedoButtons();
                    
                    // En production, ici on ferait l'appel API pour restaurer
                    // await axios.post('/api/redo');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors de la restauration');
                }
            }

            function updateUndoRedoButtons() {
                if (!isAdminMode) return;
                
                const undoBtn = document.getElementById('undoBtn');
                const redoBtn = document.getElementById('redoBtn');
                
                if (undoBtn && redoBtn) {
                    const canUndo = actionHistory.canUndo();
                    const canRedo = actionHistory.canRedo();
                    
                    undoBtn.disabled = !canUndo;
                    undoBtn.className = canUndo ?
                        'px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors' :
                        'px-4 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed';
                        
                    redoBtn.disabled = !canRedo;
                    redoBtn.className = canRedo ?
                        'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors' :
                        'px-4 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed';
                }
            }

            // === FONCTIONS MODALES ===

            function formatHistoryMessage(action) {
                const user = action.data?.user || action.data?.admin || 'Utilisateur inconnu';
                const date = action.data?.date ? new Date(action.data.date).toLocaleDateString('fr-FR') : '';
                
                switch(action.type) {
                    case 'add_activity':
                        return 'Activité "' + action.data.activity.activity_type + '" du ' + 
                               new Date(action.data.activity.date).toLocaleDateString('fr-FR') + 
                               ' ajoutée par ' + user;
                    
                    case 'delete_activity':
                        return 'Activité "' + action.data.activityType + '" du ' + 
                               new Date(action.data.date).toLocaleDateString('fr-FR') + 
                               ' supprimée par ' + user;
                    
                    case 'modify_activity':
                        return 'Activité modifiée par ' + user;
                    
                    case 'admin_assign_slot':
                        return user + ' a assigné ' + action.data.volunteer + ' à un créneau';
                    
                    case 'admin_unassign_slot':
                        return user + " a retiré " + action.undoData.previousVolunteer + " d'un créneau";
                    
                    case 'admin_change_slot':
                        return user + ' a changé ' + action.undoData.previousVolunteer + 
                               ' par ' + action.data.newVolunteer;
                    
                    case 'assign_slot':
                        return user + " s'est inscrit à un créneau";
                    
                    case 'unassign_slot':
                        return user + " s'est désinscrit d'un créneau";
                    
                    case 'add_new_week':
                        return 'Semaine ' + (action.data.weekIndex + 1) + ' ajoutée par ' + user;
                    
                    case 'delete_week_row':
                        return 'Semaine ' + (action.data.weekIndex + 1) + ' supprimée par ' + user;
                    
                    case 'admin_mode_enabled':
                        return user + ' a activé le mode admin';
                    
                    case 'add_person':
                        return 'Bénévole "' + action.data.person.name + '" ajouté par ' + user;
                    
                    case 'toggle_urgent':
                        const urgentStatus = action.data.newState ? 'marqué comme urgent' : 'retiré du mode urgent';
                        const activityInfo = action.data.activityType && action.data.date ? 
                            ' "' + action.data.activityType + '" du ' + new Date(action.data.date).toLocaleDateString('fr-FR') : '';
                        return 'Créneau' + activityInfo + ' ' + urgentStatus + ' par ' + user;
                    
                    default:
                        return action.type + ' par ' + user;
                }
            }

            function openHistoryModal() {
                const history = actionHistory.getHistory();
                const historyList = document.getElementById('historyList');
                
                if (history.length === 0) {
                    historyList.innerHTML = '<p class="text-gray-500 text-center py-4">Aucun historique</p>';
                } else {
                    historyList.innerHTML = history.map(action => {
                        const timeStr = action.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        const dateStr = action.timestamp.toLocaleDateString('fr-FR');
                        const message = formatHistoryMessage(action);
                        
                        return '<div class="p-3 bg-gray-50 rounded border hover:bg-gray-100 transition-colors">' +
                            '<div class="font-medium text-gray-800">' + message + '</div>' +
                            '<div class="text-xs text-gray-500 mt-1">' +
                            '<i class="fas fa-clock mr-1"></i>' + dateStr + ' à ' + timeStr +
                            '</div>' +
                            '</div>';
                    }).join('');
                }
                
                document.getElementById('historyModal').classList.remove('hidden');
            }

            function closeHistoryModal() {
                document.getElementById('historyModal').classList.add('hidden');
            }

            function openAddActivityModal() {
                // Réinitialiser le formulaire
                document.getElementById('addActivityForm').reset();
                
                // Définir la date par défaut à aujourd'hui
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('activityDate').value = today;
                
                // Masquer le champ titre personnalisé par défaut
                document.getElementById('customActivityTitle').style.display = 'none';
                
                document.getElementById('addActivityModal').classList.remove('hidden');
            }

            function closeAddActivityModal() {
                document.getElementById('addActivityModal').classList.add('hidden');
            }

            function openAddPersonModal() {
                // Réinitialiser le formulaire
                document.getElementById('addPersonForm').reset();
                document.getElementById('addPersonModal').classList.remove('hidden');
            }

            function closeAddPersonModal() {
                document.getElementById('addPersonModal').classList.add('hidden');
            }

            function handleActivityTypeChange() {
                const activityType = document.getElementById('activityType').value;
                const customTitleDiv = document.getElementById('customActivityTitle');
                
                if (activityType === 'Autre') {
                    customTitleDiv.style.display = 'block';
                    document.getElementById('customTitle').required = true;
                } else {
                    customTitleDiv.style.display = 'none';
                    document.getElementById('customTitle').required = false;
                    document.getElementById('customTitle').value = '';
                }
            }

            async function submitAddActivity(e) {
                e.preventDefault();
                
                try {
                    let activityType = document.getElementById('activityType').value;
                    const customTitle = document.getElementById('customTitle').value.trim();
                    const activityTime = document.getElementById('activityTime').value;
                    
                    // Si c'est "Autre", utiliser le titre personnalisé
                    if (activityType === 'Autre' && customTitle) {
                        activityType = customTitle;
                    }
                    
                    const formData = {
                        type: activityType,
                        date: document.getElementById('activityDate').value,
                        time: activityTime,
                        maxVolunteers: 15,  // Limite par défaut à 15 personnes
                        notes: document.getElementById('activityNotes').value.trim()
                    };

                    // Validation
                    if (!formData.type || !formData.date) {
                        showError('Veuillez remplir tous les champs obligatoires');
                        return;
                    }
                    
                    if (document.getElementById('activityType').value === 'Autre' && !customTitle) {
                        showError('Veuillez saisir un titre pour votre activité');
                        return;
                    }

                    // Calculer le day_of_week à partir de la date
                    const activityDate = new Date(formData.date);
                    const dayOfWeek = activityDate.getDay() === 0 ? 7 : activityDate.getDay(); // Dimanche = 7, Lundi = 1
                    
                    // Vérifier que la date appartient à une semaine existante
                    const selectedDate = new Date(formData.date);
                    const selectedMonday = getMonday(selectedDate);
                    const selectedMondayStr = selectedMonday.toISOString().split('T')[0];
                    
                    // Obtenir toutes les semaines existantes
                    const existingWeeks = groupByWeeks(schedule);
                    const existingMondayDates = existingWeeks.map(week => {
                        const firstSlot = week[0];
                        const slotDate = new Date(firstSlot.date);
                        return getMonday(slotDate).toISOString().split('T')[0];
                    });
                    
                    // Vérifier si la semaine de la date sélectionnée existe
                    if (!existingMondayDates.includes(selectedMondayStr)) {
                        showError("Impossible de créer une activité hors des semaines existantes. Veuillez d'abord ajouter la semaine correspondante.");
                        return;
                    }
                    
                    // Générer un ID unique simple et sûr
                    // Trouver le plus grand ID existant et ajouter 1
                    const existingIds = schedule.map(s => s.id);
                    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
                    const newId = maxId + 1;
                    
                    // Créer la nouvelle activité
                    const newActivity = {
                        id: newId,
                        date: formData.date,
                        day_of_week: dayOfWeek,
                        activity_type: formData.type,
                        volunteer_name: null,
                        volunteers: [],  // Liste des bénévoles inscrits (pour multi-personnes)
                        status: 'available',
                        max_volunteers: formData.maxVolunteers,
                        notes: formData.notes,
                        time: formData.time,
                        is_urgent_when_free: false,
                        color: getColorForActivityType(formData.type)
                    };

                    // Ajouter l'activité au planning
                    schedule.push(newActivity);

                    // Sauvegarder sur le serveur
                    try {
                        await axios.post('/api/schedule', schedule);
                        console.log('✅ Activity saved to server');
                    } catch (saveError) {
                        console.error('⚠️ Save error:', saveError);
                        // L'activité reste dans le planning local même si la sauvegarde échoue
                    }

                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'add_activity',
                        data: { activity: newActivity, user: currentUser },
                        undoData: { activityId: newActivity.id }
                    });

                    // Rafraîchir l'affichage
                    renderCalendar();
                    updateUndoRedoButtons();
                    closeAddActivityModal();
                    showError('Activité "' + formData.type + '" ajoutée pour le ' + formData.date, 'text-green-600');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors de ajout de activité');
                }
            }

            async function submitAddPerson(e) {
                e.preventDefault();
                
                try {
                    const formData = {
                        name: document.getElementById('personName').value.trim(),
                        isAdmin: document.getElementById('isAdmin').checked
                    };

                    // Validation
                    if (!formData.name || formData.name.length < 2) {
                        showError('Le nom doit contenir au moins 2 caractères');
                        return;
                    }

                    // En mode développement, simuler l'ajout
                    const newPerson = {
                        id: Date.now(),
                        name: formData.name,
                        is_admin: formData.isAdmin
                    };

                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'add_person',
                        data: { person: newPerson, user: currentUser },
                        undoData: null
                    });

                    updateUndoRedoButtons();
                    closeAddPersonModal();
                    showError('Bénévole "' + formData.name + '" ajouté avec succès', 'text-green-600');
                    
                    // En production, recharger la liste des bénévoles
                    // await loadVolunteers();
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors de ajout du bénévole');
                }
            }

            // === FONCTIONS DE MODIFICATION D'ACTIVITÉ ===

            function modifyActivity(slotId) {
                const slot = schedule.find(s => s.id === slotId);
                if (!slot) {
                    showError('Activité non trouvée');
                    return;
                }

                // Ne permettre la modification que pour les activités non-nourrissage
                if (slot.activity_type === 'Nourrissage') {
                    showError('Les nourrissages ne peuvent pas être modifiés');
                    return;
                }

                // Pré-remplir le formulaire avec les données actuelles
                document.getElementById('modifyActivityId').value = slotId;
                
                // Gérer le type d'activité
                const activityTypeSelect = document.getElementById('modifyActivityType');
                const customTitleDiv = document.getElementById('modifyCustomActivityTitle');
                const customTitleInput = document.getElementById('modifyCustomTitle');
                
                // Vérifier si c'est un type prédéfini ou personnalisé
                const predefinedTypes = ['Légumes', 'Réunion'];
                if (predefinedTypes.includes(slot.activity_type)) {
                    activityTypeSelect.value = slot.activity_type;
                    customTitleDiv.style.display = 'none';
                    customTitleInput.required = false;
                    customTitleInput.value = '';
                } else {
                    // Type personnalisé
                    activityTypeSelect.value = 'Autre';
                    customTitleDiv.style.display = 'block';
                    customTitleInput.required = true;
                    customTitleInput.value = slot.activity_type;
                }

                document.getElementById('modifyActivityDate').value = slot.date;
                document.getElementById('modifyActivityTime').value = slot.time || '';
                document.getElementById('modifyActivityNotes').value = slot.notes || '';

                // Ouvrir le modal
                document.getElementById('modifyActivityModal').classList.remove('hidden');
            }

            function closeModifyActivityModal() {
                document.getElementById('modifyActivityModal').classList.add('hidden');
            }

            function handleModifyActivityTypeChange() {
                const activityType = document.getElementById('modifyActivityType').value;
                const customTitleDiv = document.getElementById('modifyCustomActivityTitle');
                const customTitleInput = document.getElementById('modifyCustomTitle');
                
                if (activityType === 'Autre') {
                    customTitleDiv.style.display = 'block';
                    customTitleInput.required = true;
                } else {
                    customTitleDiv.style.display = 'none';
                    customTitleInput.required = false;
                    customTitleInput.value = '';
                }
            }

            async function submitModifyActivity(e) {
                e.preventDefault();
                
                try {
                    const slotId = parseInt(document.getElementById('modifyActivityId').value);
                    let activityType = document.getElementById('modifyActivityType').value;
                    const customTitle = document.getElementById('modifyCustomTitle').value.trim();
                    const activityTime = document.getElementById('modifyActivityTime').value;
                    
                    // Si c'est "Autre", utiliser le titre personnalisé
                    if (activityType === 'Autre' && customTitle) {
                        activityType = customTitle;
                    }
                    
                    const formData = {
                        type: activityType,
                        date: document.getElementById('modifyActivityDate').value,
                        time: activityTime,
                        maxVolunteers: 15,  // Limite par défaut à 15 personnes
                        notes: document.getElementById('modifyActivityNotes').value.trim()
                    };

                    // Validation
                    if (!formData.type || !formData.date) {
                        showError('Veuillez remplir tous les champs obligatoires');
                        return;
                    }
                    
                    if (document.getElementById('modifyActivityType').value === 'Autre' && !customTitle) {
                        showError('Veuillez saisir un titre pour votre activité');
                        return;
                    }

                    // Trouver l'activité à modifier
                    const slotIndex = schedule.findIndex(s => s.id === slotId);
                    if (slotIndex === -1) {
                        showError('Activité non trouvée');
                        return;
                    }

                    // Sauvegarder l'ancien état pour l'historique
                    const oldSlot = { ...schedule[slotIndex] };

                    // Calculer le day_of_week à partir de la nouvelle date
                    const activityDate = new Date(formData.date);
                    const dayOfWeek = activityDate.getDay() === 0 ? 7 : activityDate.getDay(); // Dimanche = 7, Lundi = 1
                    
                    // Mettre à jour l'activité
                    schedule[slotIndex] = {
                        ...schedule[slotIndex],
                        activity_type: formData.type,
                        date: formData.date,
                        day_of_week: dayOfWeek,
                        time: formData.time,
                        max_volunteers: formData.maxVolunteers,
                        notes: formData.notes,
                        is_urgent_when_free: false,
                        color: getColorForActivityType(formData.type)
                    };

                    // En production, faire l'appel API
                    // await axios.put('/api/schedule/' + slotId, formData);

                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'modify_activity',
                        data: { 
                            slotId: slotId,
                            newData: schedule[slotIndex],
                            user: currentUser 
                        },
                        undoData: { 
                            slotId: slotId,
                            oldData: oldSlot 
                        }
                    });

                    // Reconstruire le calendrier avec les nouvelles données
                    renderCalendar();
                    
                    updateUndoRedoButtons();
                    closeModifyActivityModal();
                    showError('Activité "' + formData.type + '" modifiée avec succès', 'text-green-600');
                    
                    // Recharger le planning (en production)
                    // await loadSchedule();
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors de la modification de l'activité");
                }
            }

            function getColorForActivityType(type) {
                const colorMap = {
                    'Nourrissage': '#dc3545',
                    'Légumes': '#ff8c00', 
                    'Réunion': '#6f42c1',
                    'Autre': '#20c997'
                };
                return colorMap[type] || '#6c757d';
            }

            // === FONCTIONS DRAG-AND-DROP ===
            
            let draggedSlot = null;
            let draggedElement = null;

            function handleDragStart(e) {
                if (!isAdminMode) return;
                
                draggedElement = e.target;
                draggedSlot = schedule.find(s => s.id == e.target.getAttribute('data-slot-id'));
                
                if (!draggedSlot) return;
                
                // Ajouter classe de drag
                draggedElement.classList.add('dragging');
                
                // Configurer les données de transfert
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', draggedElement.outerHTML);
                
                // Créer image de drag personnalisée
                const dragImage = draggedElement.cloneNode(true);
                dragImage.style.transform = 'rotate(5deg)';
                dragImage.style.opacity = '0.8';
                document.body.appendChild(dragImage);
                e.dataTransfer.setDragImage(dragImage, 0, 0);
                
                // Nettoyer l'image après un délai
                setTimeout(() => {
                    if (document.body.contains(dragImage)) {
                        document.body.removeChild(dragImage);
                    }
                }, 1);
                
                console.log('Drag started for activity:', draggedSlot.activity_type);
            }

            function handleDragEnd(e) {
                if (!isAdminMode) return;
                
                // Nettoyer les classes et états
                if (draggedElement) {
                    draggedElement.classList.remove('dragging');
                }
                
                // Nettoyer toutes les zones de drop
                document.querySelectorAll('.drop-zone').forEach(zone => {
                    zone.classList.remove('drag-over', 'drop-valid', 'drop-invalid');
                });
                
                draggedSlot = null;
                draggedElement = null;
            }

            function handleDragOver(e) {
                if (!isAdminMode || !draggedSlot) return;
                
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }

            function handleDragEnter(e) {
                if (!isAdminMode || !draggedSlot) return;
                
                e.preventDefault();
                const dropZone = e.currentTarget;
                
                // Vérifier si le drop est valide
                const targetDate = dropZone.getAttribute('data-date');
                const targetActivityType = dropZone.getAttribute('data-activity-type');
                
                const isValidDrop = canDropActivity(draggedSlot, targetDate, targetActivityType);
                
                // Appliquer les styles appropriés
                dropZone.classList.add('drag-over');
                if (isValidDrop) {
                    dropZone.classList.add('drop-valid');
                    dropZone.classList.remove('drop-invalid');
                } else {
                    dropZone.classList.add('drop-invalid');
                    dropZone.classList.remove('drop-valid');
                }
            }

            function handleDragLeave(e) {
                if (!isAdminMode) return;
                
                const dropZone = e.currentTarget;
                
                // Vérifier si on quitte vraiment la zone (pas un enfant)
                if (!dropZone.contains(e.relatedTarget)) {
                    dropZone.classList.remove('drag-over', 'drop-valid', 'drop-invalid');
                }
            }

            function handleDrop(e) {
                if (!isAdminMode || !draggedSlot) return;
                
                e.preventDefault();
                const dropZone = e.currentTarget;
                
                const targetDate = dropZone.getAttribute('data-date');
                const targetActivityType = dropZone.getAttribute('data-activity-type');
                
                // Vérifier si le drop est valide
                if (!canDropActivity(draggedSlot, targetDate, targetActivityType)) {
                    showError('Déplacement impossible: les activités de types différents ne peuvent pas être mélangées');
                    return;
                }
                
                // Utiliser la fonction commune
                performActivityMove(draggedSlot, targetDate, targetActivityType);
                
                console.log('Activity moved successfully via mouse');
                
                // En production, on ferait ici un appel API
                // await axios.put('/api/schedule/' + draggedSlot.id + '/move', {...});
            }

            function canDropActivity(slot, targetDate, targetActivityType) {
                // Règle : on ne peut déplacer une activité que vers une cellule du même type
                return slot.activity_type === targetActivityType;
            }

            // === SUPPORT TACTILE AVANCÉ ===
            
            let touchStartData = null;
            let touchMoveActive = false;
            let touchClone = null;
            let currentTouchDropZone = null;

            function addTouchSupport(element, slotId) {
                if (!isAdminMode) return;
                
                element.addEventListener('touchstart', handleTouchStart, { passive: false });
                element.addEventListener('touchmove', handleTouchMove, { passive: false });
                element.addEventListener('touchend', handleTouchEnd, { passive: false });
            }

            function handleTouchStart(e) {
                if (!isAdminMode) return;
                
                e.preventDefault();
                const touch = e.touches[0];
                const element = e.currentTarget;
                const slotId = element.getAttribute('data-slot-id');
                
                touchStartData = {
                    element: element,
                    slot: schedule.find(s => s.id == slotId),
                    startX: touch.clientX,
                    startY: touch.clientY,
                    startTime: Date.now()
                };
                
                // Vibration légère sur les appareils compatibles
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
                
                // Ajouter un délai pour distinguer touch vs scroll
                setTimeout(() => {
                    if (touchStartData && !touchMoveActive) {
                        startTouchDrag(touchStartData);
                    }
                }, 150);
            }

            function startTouchDrag(data) {
                touchMoveActive = true;
                draggedSlot = data.slot;
                draggedElement = data.element;
                
                // Créer un clone visuel pour le drag
                touchClone = data.element.cloneNode(true);
                touchClone.style.position = 'fixed';
                touchClone.style.zIndex = '9999';
                touchClone.style.pointerEvents = 'none';
                touchClone.style.opacity = '0.8';
                touchClone.style.transform = 'scale(1.1) rotate(5deg)';
                touchClone.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
                touchClone.classList.add('touch-dragging');
                
                document.body.appendChild(touchClone);
                
                // Style original
                data.element.classList.add('dragging');
                
                console.log('Touch drag started for:', data.slot.activity_type);
            }

            function handleTouchMove(e) {
                if (!touchMoveActive || !touchClone) return;
                
                e.preventDefault();
                const touch = e.touches[0];
                
                // Déplacer le clone
                touchClone.style.left = (touch.clientX - 50) + 'px';
                touchClone.style.top = (touch.clientY - 50) + 'px';
                
                // Trouver l'élément sous le doigt
                const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
                const dropZone = elementBelow ? elementBelow.closest('.drop-zone') : null;
                
                // Nettoyer les anciens highlights
                if (currentTouchDropZone && currentTouchDropZone !== dropZone) {
                    currentTouchDropZone.classList.remove('drag-over', 'drop-valid', 'drop-invalid');
                }
                
                // Appliquer le highlight à la nouvelle zone
                if (dropZone && dropZone !== currentTouchDropZone) {
                    const targetDate = dropZone.getAttribute('data-date');
                    const targetActivityType = dropZone.getAttribute('data-activity-type');
                    const isValid = canDropActivity(draggedSlot, targetDate, targetActivityType);
                    
                    dropZone.classList.add('drag-over');
                    if (isValid) {
                        dropZone.classList.add('drop-valid');
                        // Vibration de confirmation
                        if (navigator.vibrate) {
                            navigator.vibrate(30);
                        }
                    } else {
                        dropZone.classList.add('drop-invalid');
                        // Vibration d'erreur
                        if (navigator.vibrate) {
                            navigator.vibrate([50, 50, 50]);
                        }
                    }
                }
                
                currentTouchDropZone = dropZone;
            }

            function handleTouchEnd(e) {
                if (!touchStartData) return;
                
                // Si le drag était actif, traiter le drop
                if (touchMoveActive && currentTouchDropZone) {
                    const targetDate = currentTouchDropZone.getAttribute('data-date');
                    const targetActivityType = currentTouchDropZone.getAttribute('data-activity-type');
                    
                    if (canDropActivity(draggedSlot, targetDate, targetActivityType)) {
                        // Exécuter le drop
                        performActivityMove(draggedSlot, targetDate, targetActivityType);
                        
                        // Vibration de succès
                        if (navigator.vibrate) {
                            navigator.vibrate([100, 50, 100]);
                        }
                    } else {
                        showError('Déplacement impossible: types activités différents');
                        
                        // Vibration d'erreur
                        if (navigator.vibrate) {
                            navigator.vibrate([200, 100, 200]);
                        }
                    }
                }
                
                // Nettoyer l'état tactile
                cleanupTouchDrag();
            }

            function cleanupTouchDrag() {
                touchStartData = null;
                touchMoveActive = false;
                
                // Supprimer le clone
                if (touchClone) {
                    document.body.removeChild(touchClone);
                    touchClone = null;
                }
                
                // Nettoyer les styles
                if (draggedElement) {
                    draggedElement.classList.remove('dragging');
                }
                
                // Nettoyer les drop zones
                if (currentTouchDropZone) {
                    currentTouchDropZone.classList.remove('drag-over', 'drop-valid', 'drop-invalid');
                    currentTouchDropZone = null;
                }
                
                document.querySelectorAll('.drop-zone').forEach(zone => {
                    zone.classList.remove('drag-over', 'drop-valid', 'drop-invalid');
                });
                
                draggedSlot = null;
                draggedElement = null;
            }

            // Fonction commune pour exécuter le déplacement
            function performActivityMove(slot, targetDate, targetActivityType) {
                // Sauvegarder l'état pour undo
                const oldState = {
                    id: slot.id,
                    date: slot.date,
                    day_of_week: slot.day_of_week,
                    activity_type: slot.activity_type
                };
                
                // Calculer le nouveau day_of_week
                const targetDateObj = new Date(targetDate);
                const newDayOfWeek = (targetDateObj.getDay() + 6) % 7 + 1;
                
                // Mettre à jour l'activité
                slot.date = targetDate;
                slot.day_of_week = newDayOfWeek;
                slot.activity_type = targetActivityType;
                
                // Ajouter à l'historique
                actionHistory.addAction({
                    type: 'move_activity',
                    data: {
                        slotId: slot.id,
                        newDate: targetDate,
                        newActivityType: targetActivityType,
                        user: currentUser,
                        method: touchMoveActive ? 'touch' : 'mouse'
                    },
                    undoData: oldState
                });
                
                updateUndoRedoButtons();
                renderCalendar();
                
                showError('Activité déplacée avec succès vers le ' + targetDate, 'text-green-600');
            }

            // === SUPPORT CLAVIER POUR ACCESSIBILITÉ ===
            
            let selectedSlotForKeyboard = null;
            let keyboardDragMode = false;

            function addKeyboardSupport(element, slotId) {
                if (!isAdminMode) return;
                
                element.tabIndex = 0; // Rendre l'élément focusable
                element.setAttribute('role', 'button');
                element.setAttribute('aria-label', 'Activité déplaçable. Appuyez sur Entrée pour sélectionner.');
                
                element.addEventListener('keydown', handleKeyboardDrag);
                element.addEventListener('focus', handleSlotFocus);
                element.addEventListener('blur', handleSlotBlur);
            }

            function handleSlotFocus(e) {
                const element = e.currentTarget;
                if (selectedSlotForKeyboard === element) {
                    element.setAttribute('aria-label', 'Activité sélectionnée. Utilisez les flèches pour déplacer, Échap pour annuler.');
                } else {
                    element.setAttribute('aria-label', 'Activité déplaçable. Appuyez sur Entrée pour sélectionner.');
                }
            }

            function handleSlotBlur(e) {
                // Ne pas désélectionner automatiquement pour permettre la navigation au clavier
            }

            function handleKeyboardDrag(e) {
                const element = e.currentTarget;
                const slotId = element.getAttribute('data-slot-id');
                const slot = schedule.find(s => s.id == slotId);
                
                if (!slot) return;
                
                switch(e.key) {
                    case 'Enter':
                    case ' ':
                        e.preventDefault();
                        if (selectedSlotForKeyboard === element) {
                            // Désélectionner
                            cancelKeyboardSelection();
                        } else {
                            // Sélectionner
                            selectSlotForKeyboard(element, slot);
                        }
                        break;
                        
                    case 'Escape':
                        e.preventDefault();
                        cancelKeyboardSelection();
                        break;
                        
                    case 'ArrowUp':
                    case 'ArrowDown':
                    case 'ArrowLeft':
                    case 'ArrowRight':
                        if (selectedSlotForKeyboard === element) {
                            e.preventDefault();
                            moveSlotWithKeyboard(e.key, slot);
                        }
                        break;
                }
            }

            function selectSlotForKeyboard(element, slot) {
                // Désélectionner l'ancien si existe
                cancelKeyboardSelection();
                
                selectedSlotForKeyboard = element;
                draggedSlot = slot;
                keyboardDragMode = true;
                
                element.classList.add('keyboard-selected');
                element.setAttribute('aria-pressed', 'true');
                document.body.classList.add('keyboard-drag-mode');
                
                // Vibration si supportée
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
                
                showError('Activité sélectionnée. Utilisez les flèches pour déplacer.', 'text-blue-600');
            }

            function cancelKeyboardSelection() {
                if (selectedSlotForKeyboard) {
                    selectedSlotForKeyboard.classList.remove('keyboard-selected');
                    selectedSlotForKeyboard.setAttribute('aria-pressed', 'false');
                    selectedSlotForKeyboard = null;
                }
                
                draggedSlot = null;
                keyboardDragMode = false;
                document.body.classList.remove('keyboard-drag-mode');
                
                // Nettoyer toutes les zones de drop
                document.querySelectorAll('.drop-zone').forEach(zone => {
                    zone.classList.remove('drag-over', 'drop-valid', 'drop-invalid');
                });
            }

            function moveSlotWithKeyboard(direction, slot) {
                const currentDate = new Date(slot.date);
                let newDate = new Date(currentDate);
                
                switch(direction) {
                    case 'ArrowLeft':
                        newDate.setDate(currentDate.getDate() - 1);
                        break;
                    case 'ArrowRight':
                        newDate.setDate(currentDate.getDate() + 1);
                        break;
                    case 'ArrowUp':
                        newDate.setDate(currentDate.getDate() - 7);
                        break;
                    case 'ArrowDown':
                        newDate.setDate(currentDate.getDate() + 7);
                        break;
                }
                
                const targetDateStr = newDate.toISOString().split('T')[0];
                
                // Vérifier si la nouvelle date est valide (dans le planning)
                const targetSlot = schedule.find(s => 
                    s.date === targetDateStr && 
                    s.activity_type === slot.activity_type
                );
                
                if (targetSlot && canDropActivity(slot, targetDateStr, slot.activity_type)) {
                    performActivityMove(slot, targetDateStr, slot.activity_type);
                    cancelKeyboardSelection();
                    
                    // Vibration de succès
                    if (navigator.vibrate) {
                        navigator.vibrate([50, 50, 50]);
                    }
                } else {
                    // Vibration d'erreur
                    if (navigator.vibrate) {
                        navigator.vibrate([100, 50, 100]);
                    }
                    showError('Déplacement impossible dans cette direction', 'text-red-600');
                }
            }

            // Utilitaires
            function groupByWeeks(scheduleData) {
                const weeks = {};
                
                scheduleData.forEach(slot => {
                    const slotDate = new Date(slot.date);
                    const monday = getMonday(slotDate);
                    const weekStart = monday.toISOString().split('T')[0];
                    
                    if (!weeks[weekStart]) {
                        weeks[weekStart] = [];
                    }
                    weeks[weekStart].push(slot);
                });
                
                // Convertir en tableau et trier par date
                return Object.values(weeks).sort((a, b) => 
                    new Date(a[0].date) - new Date(b[0].date)
                );
            }

            function getMonday(date) {
                const d = new Date(date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajuster pour lundi
                const monday = new Date(d.setDate(diff));
                return monday;
            }

            function formatDate(dateStr) {
                const date = new Date(dateStr);
                return date.toLocaleDateString('fr-FR', { 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                });
            }
        </script>
    </body>
    </html>
  `)
});

export default app