import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Stockage en mémoire pour le développement
let globalSchedule: any[] = [];
let scheduleInitialized = false;

// Middleware CORS pour les API routes
app.use('/api/*', cors())

// Servir les fichiers statiques
app.use('/static/*', serveStatic({ root: './public' }))

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

// API - Récupérer les types d\'activités
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

// Fonction pour initialiser le planning de base
function initializeSchedule() {
  if (scheduleInitialized) return globalSchedule;
  
  console.log('🔄 Initialisation du planning de base...');
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
            status: 'assigned',
            color: '#ffc107', // Jaune pour légumes
            max_volunteers: 2,
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
            status: 'available',
            color: '#6f42c1', // Violet pour réunions
            max_volunteers: 5,
            notes: 'Réunion mensuelle du Cercle Animo',
            is_urgent_when_free: false
          });
        }
      }
    }
    
    globalSchedule = schedule;
    scheduleInitialized = true;
    console.log('✅ Planning initialisé avec', schedule.length, 'éléments');
    return globalSchedule;
}

// API - Récupérer le planning (prochaines 4 semaines)
app.get('/api/schedule', async (c) => {
  try {
    // Si le planning global existe (avec des données sauvegardées), l'utiliser
    // Sinon, initialiser le planning de base
    const schedule = globalSchedule.length > 0 ? globalSchedule : initializeSchedule();
    console.log('📅 Envoi du planning:', schedule.length, 'éléments (source: ' + (globalSchedule.length > 0 ? 'sauvegardé' : 'initial') + ')');
    return c.json(schedule);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération:', error);
    return c.json({ error: 'Erreur lors de la récupération du planning' }, 500);
  }
});

// API - S'inscrire sur un créneau
app.post('/api/schedule/:id/assign', async (c) => {
  try {
    const { env } = c;
    const slotId = c.req.param('id');
    const body = await c.req.json();
    const volunteer_name = body.volunteer_name;
    
    console.log('Assign API called:', { slotId, volunteer_name, hasDB: !!(env && env.DB) });

    // Mode développement - toujours simuler (pas de vraie DB configurée)
    console.log('Mode développement - simulation assign');
    return c.json({ success: true, message: 'Inscription réussie (dev)' });
    
    const result = await env.DB.prepare(`
      UPDATE time_slots 
      SET volunteer_id = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(volunteer_name, slotId).run();
    
    if (result.changes > 0) {
      return c.json({ success: true, message: 'Inscription réussie' });
    } else {
      return c.json({ error: 'Créneau non trouvé' }, 404);
    }
  } catch (error) {
    console.error('Erreur API assign:', error);
    return c.json({ error: "Erreur lors de l\'inscription: " + error.message }, 500);
  }
});

// API - Se désinscrire d'un créneau
app.post('/api/schedule/:id/unassign', async (c) => {
  try {
    const { env } = c;
    const slotId = c.req.param('id');
    
    console.log('Unassign API called:', { slotId, hasDB: !!(env && env.DB) });

    // Mode développement - toujours simuler (pas de vraie DB configurée)
    console.log('Mode développement - simulation unassign');
    return c.json({ success: true, message: 'Désinscription réussie (dev)' });
    
    const result = await env.DB.prepare(`
      UPDATE time_slots 
      SET volunteer_id = NULL, status = 'available', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(slotId).run();
    
    if (result.changes > 0) {
      return c.json({ success: true, message: 'Désinscription réussie' });
    } else {
      return c.json({ error: 'Créneau non trouvé' }, 404);
    }
  } catch (error) {
    console.error('Erreur API unassign:', error);
    return c.json({ error: 'Erreur lors de la désinscription: ' + error.message }, 500);
  }
});

// API - Sauvegarder le planning complet
app.post('/api/schedule', async (c) => {
  try {
    // Vérifier la taille de la requête avant de la traiter
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB limit
      throw new Error('Données trop volumineuses');
    }
    
    const newSchedule = await c.req.json();
    
    // Valider que newSchedule est un tableau
    if (!Array.isArray(newSchedule)) {
      throw new Error('Le planning doit être un tableau');
    }
    
    // Limiter le nombre d\\'éléments pour éviter les problèmes de mémoire
    if (newSchedule.length > 1000) {
      throw new Error("Trop d'activités dans le planning (max: 1000)");
    }
    
    // Initialiser le planning de base si pas encore fait
    initializeSchedule();
    
    // Nettoyer et valider chaque élément pour optimiser la mémoire
    const cleanSchedule = newSchedule.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`Élément invalide à l'index ${index}`);
      }
      
      return {
        id: item.id || Date.now() + index,
        date: String(item.date || ''),
        day_of_week: Number(item.day_of_week) || 0,
        activity_type: String(item.activity_type || ''),
        volunteer_name: item.volunteer_name ? String(item.volunteer_name) : null,
        status: String(item.status || 'available'),
        max_volunteers: Number(item.max_volunteers) || 1,
        notes: String(item.notes || ''),
        time: String(item.time || ''),
        is_urgent_when_free: Boolean(item.is_urgent_when_free)
      };
    });
    
    // Remplacer complètement le planning global
    globalSchedule = cleanSchedule;
    
    console.log('💾 Planning sauvegardé avec succès:', globalSchedule.length, 'éléments');
    
    return c.json({ 
      success: true, 
      message: 'Planning sauvegardé avec succès',
      count: globalSchedule.length 
    });
  } catch (error) {
    console.error('❌ Erreur de sauvegarde:', error);
    return c.json({ error: 'Échec de la sauvegarde: ' + error.message }, 500);
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
          console.log('Test apostrophe dans inscription');
          alert('Apostrophe fonctionne !');
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
          }
          
          @media (max-width: 768px) {
            .week-table {
              font-size: 0.875rem;
            }
            .week-table td {
              padding: 0.5rem;
              min-height: 60px;
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
            .draggable-slot {
              padding: 0.75rem !important;
              min-height: 80px;
              touch-action: none;
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
        </style>
    </head>
    <body class="bg-gray-100 min-h-screen">
        <div class="max-w-full mx-auto p-4 lg:p-6">
            <!-- En-tête -->
            <header class="text-center mb-8">
                <h1 class="text-3xl lg:text-4xl font-bold text-gray-800 mb-2">
                    ❤️ Planning du Cercle Animô ❤️
                </h1>
                <p class="text-base lg:text-lg text-gray-600 mb-4">
                    Calendrier de nourrissage des animaux et activités de la ferme
                </p>
                
                <div class="text-center mb-6">
                    <div class="flex flex-wrap justify-center gap-2 lg:gap-4 text-sm">
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4 bg-green-600 border-2 border-green-700"></div>
                            <span>🟢 Libre</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4 bg-blue-600 border-2 border-blue-700"></div>
                            <span>🔵 Pris</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 bg-yellow-400 border border-yellow-500 rounded-full flex items-center justify-center text-xs text-yellow-800 font-bold">!</div>
                            <span>Créneau à prendre en priorité</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-4 h-4" style="background-color: #ffc107;"></div>
                            <span>🟡 Légumes</span>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Méthode unique d'entrée du nom -->
            <div class="bg-white rounded-lg shadow-md p-4 lg:p-6 mb-6">
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
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <button id="addActivityBtn" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                        <i class="fas fa-plus-circle mr-2"></i>
                        Ajouter Activité
                    </button>
                    <button id="undoBtn" class="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors" disabled>
                        <i class="fas fa-undo mr-2"></i>
                        Annuler
                    </button>
                    <button id="redoBtn" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors" disabled>
                        <i class="fas fa-redo mr-2"></i>
                        Refaire
                    </button>
                    <button id="historyBtn" class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors">
                        <i class="fas fa-history mr-2"></i>
                        Historique
                    </button>
                </div>
                
                <div class="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded text-sm text-black">
                    <i class="fas fa-info-circle mr-2 text-yellow-600"></i>
                    <strong>Mode Admin activé :</strong> Glisser-déposer pour déplacer les activités • Boutons X pour supprimer les semaines • Gestion des urgences
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
                            <label for="maxVolunteers" class="block text-sm font-medium text-gray-700 mb-2">
                                Nombre maximum de bénévoles
                            </label>
                            <input type="number" id="maxVolunteers" min="1" max="10" value="1" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                        </div>
                        <div class="mb-4">
                            <label for="activityNotes" class="block text-sm font-medium text-gray-700 mb-2">
                                Notes (optionnel)
                            </label>
                            <textarea id="activityNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Détails supplémentaires..."></textarea>
                        </div>
                        <div class="mb-6">
                            <label class="flex items-center">
                                <input type="checkbox" id="isUrgent" class="mr-2">
                                <span class="text-sm text-gray-700">Marquer comme urgent si libre</span>
                            </label>
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
                                Type d\'activité
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
                                Titre de l\'activité
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
                            <label for="modifyMaxVolunteers" class="block text-sm font-medium text-gray-700 mb-2">
                                Nombre maximum de bénévoles
                            </label>
                            <input type="number" id="modifyMaxVolunteers" min="1" max="10" value="1" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                        </div>
                        <div class="mb-4">
                            <label for="modifyActivityNotes" class="block text-sm font-medium text-gray-700 mb-2">
                                Notes (optionnel)
                            </label>
                            <textarea id="modifyActivityNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Détails supplémentaires..."></textarea>
                        </div>
                        <div class="mb-6">
                            <label class="flex items-center">
                                <input type="checkbox" id="modifyIsUrgent" class="mr-2">
                                <span class="text-sm text-gray-700">Marquer comme urgent si libre</span>
                            </label>
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
            
            // Classe pour gérer historique des actions
            class ActionHistory {
                constructor() {
                    this.actions = [];
                    this.currentIndex = -1;
                    this.maxSize = 50;
                }
                
                addAction(action) {
                    // Supprimer les actions après index actuel si on en ajoute une nouvelle
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
                    console.log('📚 Chargement utilisateur...');
                    loadUserFromStorage();
                    console.log('🎯 Configuration event listeners...');
                    setupEventListeners();
                    console.log('📅 Chargement planning...');
                    await loadSchedule();
                    console.log('✅ Application chargée avec succès');
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
                updateNameStatus('Connecté en tant que: ' + name, 'text-green-600');
                document.getElementById('loading').style.display = 'none';
                renderCalendar();
            }

            function updateNameStatus(message, className = '') {
                const statusDiv = document.getElementById('nameStatus');
                statusDiv.textContent = message;
                statusDiv.className = 'mt-2 text-sm text-center ' + className;
            }

            async function loadSchedule() {
                try {
                    console.log('Chargement des données...');
                    const response = await axios.get('/api/schedule');
                    schedule = response.data;
                    console.log('Données reçues:', schedule.length, 'éléments');
                    renderCalendar();
                    console.log('Calendrier rendu avec succès');
                } catch (error) {
                    console.error('Erreur lors du chargement:', error);
                    document.getElementById('loading').innerHTML = 
                        '<p class="text-red-600">❌ Erreur lors du chargement des données</p>';
                }
            }

            function setupEventListeners() {
                document.getElementById('validateNameBtn').addEventListener('click', validateName);
                document.getElementById('userName').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') validateName();
                });

                document.getElementById('toggleAdminBtn').addEventListener('click', toggleAdminMode);
                
                // Admin panel buttons
                document.getElementById('addActivityBtn').addEventListener('click', openAddActivityModal);
                document.getElementById('undoBtn').addEventListener('click', undoAction);
                document.getElementById('redoBtn').addEventListener('click', redoAction);
                document.getElementById('historyBtn').addEventListener('click', openHistoryModal);
                
                // Modal event listeners - Add Activity
                document.getElementById('closeAddActivityModal').addEventListener('click', closeAddActivityModal);
                document.getElementById('cancelAddActivity').addEventListener('click', closeAddActivityModal);
                document.getElementById('addActivityForm').addEventListener('submit', submitAddActivity);
                document.getElementById('activityType').addEventListener('change', handleActivityTypeChange);
                
                // Modal event listeners - Modify Activity
                document.getElementById('closeModifyActivityModal').addEventListener('click', closeModifyActivityModal);
                document.getElementById('cancelModifyActivity').addEventListener('click', closeModifyActivityModal);
                document.getElementById('modifyActivityForm').addEventListener('submit', submitModifyActivity);
                document.getElementById('modifyActivityType').addEventListener('change', handleModifyActivityTypeChange);
                
                // Modal event listeners - Add Person  
                document.getElementById('closeAddPersonModal').addEventListener('click', closeAddPersonModal);
                document.getElementById('cancelAddPerson').addEventListener('click', closeAddPersonModal);
                document.getElementById('addPersonForm').addEventListener('submit', submitAddPerson);
                
                // Modal event listeners - History
                document.getElementById('closeHistoryModal').addEventListener('click', closeHistoryModal);
                document.getElementById('closeHistoryBtn').addEventListener('click', closeHistoryModal);
                
                // Close modals when clicking outside
                document.getElementById('addActivityModal').addEventListener('click', (e) => {
                    if (e.target.id === 'addActivityModal') closeAddActivityModal();
                });
                document.getElementById('modifyActivityModal').addEventListener('click', (e) => {
                    if (e.target.id === 'modifyActivityModal') closeModifyActivityModal();
                });
                document.getElementById('addPersonModal').addEventListener('click', (e) => {
                    if (e.target.id === 'addPersonModal') closeAddPersonModal();
                });
                document.getElementById('historyModal').addEventListener('click', (e) => {
                    if (e.target.id === 'historyModal') closeHistoryModal();
                });
                
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
                
                // Nettoyer les anciennes classes de couleur
                errorText.className = errorText.className.replace(/text-\w+-\d+/g, '');
                
                // Ajouter la nouvelle classe de couleur
                errorText.classList.add(className);
                
                errorDiv.classList.remove('hidden');
                setTimeout(() => errorDiv.classList.add('hidden'), 5000);
            }

            function toggleAdminMode() {
                if (!currentUser) {
                    showError(\"Veuillez d\\'abord saisir ton prénom\");
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



            // Protection contre les appels concurrents de renderCalendar
            let isRendering = false;
            
            function renderCalendar() {
                console.log('renderCalendar appelé, currentUser:', currentUser);
                
                // Protection contre les appels multiples simultanés
                if (isRendering) {
                    console.log('🔄 Rendu déjà en cours, ignoré');
                    return;
                }
                
                if (!currentUser) {
                    document.getElementById('calendar').innerHTML = 
                        '<p class="text-center text-gray-500 py-8">Veuillez saisir ton prénom pour voir le planning</p>';
                    return;
                }

                isRendering = true;
                console.log('Rendu du calendrier pour:', currentUser, '- Éléments schedule:', schedule.length);
                
                // PROTECTION RENFORCÉE CONTRE OUT OF MEMORY
                // Limite plus stricte en mode admin car il génère plus d'éléments DOM
                const maxElements = isAdminMode ? 30 : 100;
                if (schedule.length > maxElements) {
                    console.error("🚨 TROP D'ÉLÉMENTS dans schedule:", schedule.length, "Mode admin:", isAdminMode);
                    const modeText = isAdminMode ? " (Mode Admin: limite réduite)" : "";
                    document.getElementById('calendar').innerHTML = 
                        '<p class="text-center text-red-600 py-8">❌ Erreur: Trop de données à afficher (' + schedule.length + ' éléments)<br>Limite: ' + maxElements + ' activités' + modeText + '</p>' +
                        (isAdminMode ? '<p class="text-center text-orange-600 mt-4">💡 Conseil: Désactivez le mode admin pour voir plus d\\'activités</p>' : '');
                    return;
                }

                const calendar = document.getElementById('calendar');
                if (!calendar) {
                    console.error('❌ Élément calendar non trouvé');
                    return;
                }
                
                // Protection contre les erreurs de rendu
                try {
                    calendar.innerHTML = '';

                    console.log('🔄 Début groupByWeeks...');
                    const weekGroups = groupByWeeks(schedule);
                    console.log('✅ groupByWeeks terminé - Semaines:', weekGroups.length);
                
                const today = new Date().toISOString().split('T')[0];

                // PROTECTION CONTRE TROP DE SEMAINES
                if (weekGroups.length > 20) {
                    console.error('🚨 TROP DE SEMAINES:', weekGroups.length);
                    calendar.innerHTML = '<p class="text-center text-red-600 py-8">❌ Erreur: Trop de semaines à afficher</p>';
                    return;
                }

                weekGroups.forEach((week, weekIndex) => {
                    console.log('🗓️ Rendu semaine', weekIndex + 1, '/', weekGroups.length);
                    
                    // OPTIMISATION: Limiter le nombre d'activités par semaine (plus strict en mode admin)
                    const maxPerWeek = isAdminMode ? 20 : 50;
                    if (week.length > maxPerWeek) {
                        console.warn("Semaine " + (weekIndex + 1) + " surchargée: " + week.length + " activités (limite: " + maxPerWeek + ")");
                        week = week.slice(0, maxPerWeek);
                    }
                    
                    const weekDiv = document.createElement('div');
                    weekDiv.className = 'bg-white rounded-lg shadow-lg overflow-hidden';
                    
                    // Conteneur avec scroll horizontal sur mobile
                    const tableContainer = document.createElement('div');
                    tableContainer.className = 'overflow-x-auto';
                    
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
                        const isToday = dayDate.toISOString().split('T')[0] === today;
                        
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
                    
                    // Organiser les activités par type
                    const activityTypesInWeek = [...new Set(week.map(slot => slot.activity_type))];
                    
                    activityTypesInWeek.forEach((activityType, typeIndex) => {
                        const row = document.createElement('tr');
                        row.className = 'border-b border-gray-200 hover:bg-gray-50';
                        
                        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
                            const cell = document.createElement('td');
                            cell.className = 'p-2 lg:p-3 border-r border-gray-200 last:border-r-0 align-top';
                            
                            const dayDate = new Date(currentWeekStart);
                            dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                            const isToday = dayDate.toISOString().split('T')[0] === today;
                            
                            if (isToday) {
                                cell.classList.add('today-highlight');
                            }
                            
                            // Rendre la cellule capable d'accepter les drops si en mode admin
                            if (isAdminMode) {
                                cell.setAttribute('data-day-index', dayIndex);
                                cell.setAttribute('data-activity-type', activityType);
                                cell.setAttribute('data-date', dayDate.toISOString().split('T')[0]);
                                cell.classList.add('drop-zone');
                                
                                // OPTIMISATION: Event listeners gérés par délégation dans initEventDelegation()
                                // Au lieu de créer 4 listeners par cellule (explosion mémoire)
                            }
                            
                            // Optimisation: Pré-filtrer les activités au lieu de filtrer à chaque cellule
                            const dayActivities = week.filter(slot => 
                                slot.day_of_week === (dayIndex + 1) && 
                                slot.activity_type === activityType
                            );
                            
                            // Limiter le nombre d'activités par cellule (plus strict en mode admin)
                            const maxActivitiesPerCell = isAdminMode ? 5 : 10;
                            const limitedActivities = dayActivities.slice(0, maxActivitiesPerCell);
                            
                            if (dayActivities.length > maxActivitiesPerCell) {
                                console.warn("Cellule surchargée: " + dayActivities.length + " activités (limite: " + maxActivitiesPerCell + ")");
                            }
                            
                            limitedActivities.forEach(slot => {
                                try {
                                    const slotDiv = renderSlot(slot);
                                    cell.appendChild(slotDiv);
                                } catch (slotError) {
                                    console.error('❌ Erreur renderSlot:', slotError);
                                    // Continuer avec les autres slots
                                }
                            });
                            
                            // Afficher un indicateur s'il y a trop d'activités
                            if (dayActivities.length > maxActivitiesPerCell) {
                                const moreDiv = document.createElement('div');
                                moreDiv.className = 'text-xs text-gray-500 italic mt-1';
                                moreDiv.textContent = "... et " + (dayActivities.length - maxActivitiesPerCell) + " autres";
                                cell.appendChild(moreDiv);
                            }

                            row.appendChild(cell);
                        }
                        
                        tbody.appendChild(row);
                    });

                    table.appendChild(tbody);
                    tableContainer.appendChild(table);
                    weekDiv.appendChild(tableContainer);
                    calendar.appendChild(weekDiv);
                });
                
                // Bouton + en bas pour ajouter une nouvelle semaine (seulement en mode admin)
                if (isAdminMode) {
                    const addWeekDiv = document.createElement('div');
                    addWeekDiv.className = 'text-center mt-6';
                    
                    // Calculer les semaines manquantes restaurables
                    const existingWeekIndexes = [...new Set(schedule.map(slot => Math.floor(slot.id / 20)))];
                    const maxWeek = existingWeekIndexes.length > 0 ? Math.max(...existingWeekIndexes) : -1;
                    const missingWeeks = [];
                    for (let i = 4; i <= maxWeek; i++) {
                        if (!existingWeekIndexes.includes(i)) {
                            missingWeeks.push(i + 1);  // +1 pour affichage utilisateur
                        }
                    }
                    
                    let buttonText = '<i class="fas fa-plus mr-2"></i>Ajouter une semaine';
                    let titleText = 'Ajouter une nouvelle semaine';
                    let extraInfo = '';
                    
                    if (missingWeeks.length > 0) {
                        buttonText = '<i class="fas fa-plus mr-2"></i>Restaurer semaine ' + missingWeeks[0];
                        titleText = 'Restaurer la semaine supprimée ' + missingWeeks[0];
                        if (missingWeeks.length > 1) {
                            extraInfo = '<div class="text-sm text-gray-600 mt-2">Semaines restaurables : ' + missingWeeks.join(', ') + '</div>';
                        }
                    }
                    
                    addWeekDiv.innerHTML = '<button onclick="addNewWeek()" class="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors" title="' + titleText + '">' +
                        buttonText + '</button>' + extraInfo;
                    calendar.appendChild(addWeekDiv);
                }
                
                // Initialiser la délégation d'événements pour optimiser les performances
                if (isAdminMode) {
                    initEventDelegation();
                }
                
                } catch (renderError) {
                    console.error('❌ Erreur dans renderCalendar:', renderError);
                    const calendar = document.getElementById('calendar');
                    if (calendar) {
                        calendar.innerHTML = '<p class="text-center text-red-600 py-8">❌ Erreur lors du rendu du calendrier<br><small>Essayez de désactiver le mode admin</small></p>';
                    }
                    throw renderError; // Re-lancer pour être attrapée par le gestionnaire principal
                } finally {
                    isRendering = false; // Toujours réinitialiser le flag
                }
            }

            function renderSlot(slot) {
                const slotDiv = document.createElement('div');
                
                let statusClass = '';
                let showUrgentBadge = false;
                
                if (slot.activity_type.toLowerCase().includes('nourrissage')) {
                    // Pour le nourrissage : bleu si pris, vert si libre
                    // Les créneaux urgents sont TOUJOURS verts + pictogramme (même si pris)
                    if (slot.volunteer_name) {
                        // Créneau pris : bleu normal, mais peut avoir le badge urgent
                        statusClass = 'status-assigned'; // Bleu
                        showUrgentBadge = slot.is_urgent_when_free; // Montrer le badge si urgent même quand pris
                    } else {
                        // Créneau libre : vert, avec ou sans badge selon urgence
                        statusClass = 'status-available'; // Toujours vert pour les créneaux libres
                        showUrgentBadge = slot.status === 'urgent' || slot.is_urgent_when_free;
                    }
                } else {
                    statusClass = 'status-' + slot.status;
                    slotDiv.style.backgroundColor = slot.color;
                    slotDiv.style.border = '2px solid ' + slot.color;
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

                let volunteersDisplay = '';
                if (slot.volunteer_name) {
                    // Échapper les caractères spéciaux pour éviter les problèmes JavaScript
                    const escapedName = slot.volunteer_name.replace(/'/g, '\\u0027').replace(/"/g, '\\u0022');
                    volunteersDisplay = '👤 ' + escapedName;
                } else {
                    volunteersDisplay = '⭕ Libre';
                }

                let actionButton = '';
                if (currentUser) {
                    if (isAdminMode) {
                        // Mode admin : boutons pour assigner/désassigner n\'importe qui
                        const urgentButtonText = (slot.status === 'urgent' || slot.is_urgent_when_free) ? 'Normal' : 'Urgent';
                        const urgentButtonClass = (slot.status === 'urgent' || slot.is_urgent_when_free) ? 'bg-gray-500 hover:bg-gray-600' : 'bg-yellow-500 hover:bg-yellow-600';
                        
                        // Boutons pour activités non-nourrissage
                        let modifyButton = '';
                        let deleteButton = '';
                        if (slot.activity_type !== 'Nourrissage') {
                            modifyButton = '<button onclick="modifyActivity(' + slot.id + ')" class="w-full px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">Modifier</button>';
                            // deleteButton = '<button onclick="deleteActivity(' + slot.id + ')" class="w-full px-2 py-1 bg-red-800 text-white text-xs rounded hover:bg-red-900">Supprimer</button>';
                        }
                        
                        if (slot.volunteer_name) {
                            actionButton = '<div class="mt-1 space-y-1">' +
                                '<button onclick="adminUnassignSlot(' + slot.id + ')" class="w-full px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Retirer</button>' +
                                '<button onclick="adminChangeSlot(' + slot.id + ')" class="w-full px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600">Changer</button>' +
                                '<button onclick="toggleUrgentSlot(' + slot.id + ')" class="w-full px-2 py-1 ' + urgentButtonClass + ' text-white text-xs rounded">' + urgentButtonText + '</button>' +
                                (modifyButton ? modifyButton : '') +
                                (deleteButton ? deleteButton : '') +
                                '</div>';
                        } else {
                            actionButton = '<div class="mt-1 space-y-1">' +
                                '<button onclick="adminAssignSlot(' + slot.id + ')" class="w-full px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600">Assigner</button>' +
                                '<button onclick="toggleUrgentSlot(' + slot.id + ')" class="w-full px-2 py-1 ' + urgentButtonClass + ' text-white text-xs rounded">' + urgentButtonText + '</button>' +
                                (modifyButton ? modifyButton : '') +
                                (deleteButton ? deleteButton : '') +
                                '</div>';
                        }
                    } else {
                        // Mode normal : boutons pour l'utilisateur actuel
                        if (slot.status === 'available' || slot.status === 'urgent' || !slot.volunteer_name) {
                            actionButton = '<button onclick="assignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 w-full">Inscription</button>';
                        } else if (slot.volunteer_name === currentUser) {
                            actionButton = '<button onclick="unassignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 w-full">Desinscription</button>';
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
                
                // Délégation d'événements pour éviter l'explosion de listeners
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
                
                // NOUVEAUX: Event listeners délégués pour les drop-zones
                calendar.addEventListener('dragover', function(e) {
                    if (e.target.closest('.drop-zone')) {
                        handleDragOver(e);
                    }
                });
                
                calendar.addEventListener('drop', function(e) {
                    if (e.target.closest('.drop-zone')) {
                        handleDrop(e);
                    }
                });
                
                calendar.addEventListener('dragenter', function(e) {
                    if (e.target.closest('.drop-zone')) {
                        handleDragEnter(e);
                    }
                });
                
                calendar.addEventListener('dragleave', function(e) {
                    if (e.target.closest('.drop-zone')) {
                        handleDragLeave(e);
                    }
                });
                
                calendar.dragListenerAdded = true;
            }

            async function assignSlot(slotId) {
                try {
                    const response = await axios.post('/api/schedule/' + slotId + '/assign', {
                        volunteer_name: currentUser
                    });

                    if (response.data.success) {
                        // Mettre à jour localement pour un feedback immédiat
                        const slot = schedule.find(s => s.id == slotId);
                        if (slot) {
                            slot.volunteer_name = currentUser;
                            slot.status = 'assigned';
                        }
                        renderCalendar();
                    } else {
                        showError('Erreur: ' + response.data.error);
                    }
                } catch (error) {
                    console.error('Erreur:', error);
                    showError(\"Erreur lors de l\\\'inscription\");
                }
            }

            async function unassignSlot(slotId) {
                if (!confirm("Êtes-vous sûr de vouloir vous désinscrire ?")) return;

                try {
                    const response = await axios.post('/api/schedule/' + slotId + '/unassign', {
                        volunteer_name: currentUser
                    });

                    if (response.data.success) {
                        // Sauvegarder l'état avant changement pour l'historique
                        const slot = schedule.find(s => s.id == slotId);
                        const oldState = slot ? { ...slot } : null;
                        
                        // Mettre à jour localement
                        if (slot) {
                            slot.volunteer_name = null;
                            slot.status = 'available';
                        }
                        
                        // Ajouter à l'historique
                        actionHistory.addAction({
                            type: 'unassign_slot',
                            data: { slotId: slotId, user: currentUser },
                            undoData: oldState
                        });
                        
                        updateUndoRedoButtons();
                        renderCalendar();
                    } else {
                        showError('Erreur: ' + response.data.error);
                    }
                } catch (error) {
                    console.error('Erreur:', error);
                    showError("Erreur lors de la désinscription");
                }
            }

            // === FONCTIONS ADMIN POUR GESTION DES CRÉNEAUX ===

            async function adminAssignSlot(slotId) {
                try {
                    const volunteerName = prompt('Assigner ce créneau à qui ?');
                    
                    if (!volunteerName || !volunteerName.trim()) return;
                    
                    const selectedVolunteer = volunteerName.trim();
                    
                    const response = await axios.post('/api/schedule/' + slotId + '/assign', {
                        volunteer_name: selectedVolunteer
                    });

                    if (response.data.success) {
                        // Mettre à jour localement
                        const slot = schedule.find(s => s.id == slotId);
                        if (slot) {
                            slot.volunteer_name = selectedVolunteer;
                            slot.status = 'assigned';
                        }
                        
                        // Ajouter à l'historique
                        actionHistory.addAction({
                            type: 'admin_assign_slot',
                            data: { slotId: slotId, volunteer: selectedVolunteer, admin: currentUser },
                            undoData: { slotId: slotId, previousVolunteer: null }
                        });
                        
                        updateUndoRedoButtons();
                        renderCalendar();
                        showError(selectedVolunteer + ' assigné au créneau', 'text-green-600');
                    } else {
                        showError('Erreur: ' + response.data.error);
                    }
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors de assignation admin');
                }
            }

            async function adminUnassignSlot(slotId) {
                try {
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) return;
                    
                    if (!confirm("Retirer " + slot.volunteer_name + " de ce créneau ?")) return;
                    
                    const oldVolunteer = slot.volunteer_name;
                    
                    const response = await axios.post('/api/schedule/' + slotId + '/unassign', {});

                    if (response.data.success) {
                        // Mettre à jour localement
                        slot.volunteer_name = null;
                        slot.status = 'available';
                        
                        // Ajouter à l'historique
                        actionHistory.addAction({
                            type: 'admin_unassign_slot',
                            data: { slotId: slotId, admin: currentUser },
                            undoData: { slotId: slotId, previousVolunteer: oldVolunteer }
                        });
                        
                        updateUndoRedoButtons();
                        renderCalendar();
                        showError(oldVolunteer + ' retiré du créneau', 'text-orange-600');
                    } else {
                        showError('Erreur: ' + response.data.error);
                    }
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors du retrait admin');
                }
            }

            async function adminChangeSlot(slotId) {
                try {
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) return;
                    
                    const volunteerName = prompt("Changer " + slot.volunteer_name + " pour qui ?");
                    
                    if (!volunteerName || !volunteerName.trim()) return;
                    
                    const selectedVolunteer = volunteerName.trim();
                    
                    if (selectedVolunteer === slot.volunteer_name) {
                        showError('Même bénévole sélectionné');
                        return;
                    }
                    
                    const oldVolunteer = slot.volunteer_name;
                    
                    const response = await axios.post('/api/schedule/' + slotId + '/assign', {
                        volunteer_name: selectedVolunteer
                    });

                    if (response.data.success) {
                        // Mettre à jour localement
                        slot.volunteer_name = selectedVolunteer;
                        slot.status = 'assigned';
                        
                        // Ajouter à l'historique
                        actionHistory.addAction({
                            type: 'admin_change_slot',
                            data: { slotId: slotId, newVolunteer: selectedVolunteer, admin: currentUser },
                            undoData: { slotId: slotId, previousVolunteer: oldVolunteer }
                        });
                        
                        updateUndoRedoButtons();
                        renderCalendar();
                        showError('Créneau changé de ' + oldVolunteer + ' à ' + selectedVolunteer, 'text-blue-600');
                    } else {
                        showError('Erreur: ' + response.data.error);
                    }
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors du changement admin');
                }
            }

            async function toggleUrgentSlot(slotId) {
                try {
                    const slot = schedule.find(s => s.id == slotId);
                    if (!slot) return;
                    
                    const wasUrgent = slot.status === 'urgent' || slot.is_urgent_when_free;
                    const newUrgentState = !wasUrgent;
                    
                    // Mettre à jour le statut
                    if (newUrgentState) {
                        slot.is_urgent_when_free = true;
                        if (!slot.volunteer_name) {
                            slot.status = 'urgent';
                        }
                    } else {
                        slot.is_urgent_when_free = false;
                        if (slot.status === 'urgent' && !slot.volunteer_name) {
                            slot.status = 'available';
                        }
                    }
                    
                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'toggle_urgent',
                        data: { slotId: slotId, newState: newUrgentState, admin: currentUser },
                        undoData: { slotId: slotId, oldState: wasUrgent }
                    });
                    
                    updateUndoRedoButtons();
                    renderCalendar();
                    
                    const statusText = newUrgentState ? 'marqué comme urgent' : 'retiré de urgent';
                    showError('Créneau ' + statusText, 'text-blue-600');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors du changement urgent');
                }
            }

            // === FONCTIONS GESTION SEMAINES ===

            function addNewWeek() {
                if (!isAdminMode) return;
                
                try {
                    // Calculer les semaines existantes et détecter les "trous"
                    const existingWeekIndexes = [...new Set(schedule.map(slot => Math.floor(slot.id / 20)))];
                    const maxWeek = existingWeekIndexes.length > 0 ? Math.max(...existingWeekIndexes) : -1;
                    
                    // Chercher le premier "trou" dans la séquence de semaines
                    let newWeekIndex = null;
                    for (let i = 4; i <= maxWeek; i++) { // Commencer après les 4 semaines protégées
                        if (!existingWeekIndexes.includes(i)) {
                            newWeekIndex = i;
                            break;
                        }
                    }
                    
                    // Si aucun trou trouvé, ajouter à la fin
                    if (newWeekIndex === null) {
                        newWeekIndex = maxWeek + 1;
                    }
                    
                    console.log('Ajout nouvelle semaine, index:', newWeekIndex);
                    
                    // Calculer la date de début de la nouvelle semaine
                    const today = new Date();
                    const currentMonday = new Date(today);
                    currentMonday.setDate(today.getDate() - today.getDay() + 1);
                    
                    // Récupérer les activités légumes de la semaine précédente pour les copier
                    const previousWeekIndex = newWeekIndex - 1;
                    const previousWeekVegetables = schedule.filter(slot => 
                        Math.floor(slot.id / 20) === previousWeekIndex && 
                        slot.activity_type === 'Légumes'
                    );
                    
                    // Générer les activités pour la nouvelle semaine
                    const newActivities = [];
                    
                    for (let day = 0; day < 7; day++) {
                        const date = new Date(currentMonday);
                        date.setDate(currentMonday.getDate() + (newWeekIndex * 7) + day);
                        const dateStr = date.toISOString().split('T')[0];
                        
                        // Nourrissage quotidien - TOUJOURS NON-URGENT pour semaines vierges
                        const nourrissageId = newWeekIndex * 20 + day + 1;
                        
                        const nourrissageActivity = {
                            id: nourrissageId,
                            date: dateStr,
                            day_of_week: day + 1,
                            activity_type: 'Nourrissage',
                            volunteer_name: null,  // Toujours libre pour semaines vierges
                            status: 'available',   // Toujours disponible
                            color: '#dc3545',
                            max_volunteers: 1,
                            notes: '',
                            is_urgent_when_free: false  // JAMAIS urgent pour semaines vierges
                        };
                        
                        newActivities.push(nourrissageActivity);
                        
                        // Copier les légumes de la semaine précédente si ils existent
                        const previousVegetableForDay = previousWeekVegetables.find(veg => 
                            veg.day_of_week === (day + 1)
                        );
                        
                        if (previousVegetableForDay) {
                            const legumesActivity = {
                                id: newWeekIndex * 20 + day + 10,
                                date: dateStr,
                                day_of_week: day + 1,
                                activity_type: 'Légumes',
                                volunteer_name: null,  // Toujours libre pour semaines vierges
                                status: 'available',   // Toujours disponible
                                color: '#ffc107',
                                max_volunteers: previousVegetableForDay.max_volunteers || 2,
                                notes: previousVegetableForDay.notes || '',
                                time: previousVegetableForDay.time || '',
                                is_urgent_when_free: false  // JAMAIS urgent pour semaines vierges
                            };
                            
                            newActivities.push(legumesActivity);
                        }
                    }
                    
                    // Ajouter les nouvelles activités au planning
                    schedule.push(...newActivities);
                    
                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'add_new_week',
                        data: { 
                            weekIndex: newWeekIndex,
                            activities: newActivities,
                            admin: currentUser 
                        },
                        undoData: { activitiesToRemove: newActivities.map(a => a.id) }
                    });
                    
                    // Rafraîchir l'affichage
                    renderCalendar();
                    updateUndoRedoButtons();
                    
                    const vegetablesCopied = newActivities.filter(a => a.activity_type === 'Légumes').length;
                    const isRestoringGap = newWeekIndex <= maxWeek; // Si on ajoute dans un trou
                    
                    let message = isRestoringGap 
                        ? 'Semaine ' + (newWeekIndex + 1) + ' restaurée (vierge) avec ' + newActivities.length + ' activités'
                        : 'Nouvelle semaine ' + (newWeekIndex + 1) + ' ajoutée (vierge) avec ' + newActivities.length + ' activités';
                        
                    if (vegetablesCopied > 0) {
                        message += ' - ' + vegetablesCopied + ' créneaux légumes copiés de la semaine précédente';
                    }
                    showError(message, 'text-green-600');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError(\"Erreur lors de l\\'ajout de nouvelle semaine\");
                }
            }

            function deleteWeekRow(weekIndex) {
                if (!isAdminMode) {
                    showError('Seuls les administrateurs peuvent supprimer des semaines');
                    return;
                }
                
                if (weekIndex < 4) {
                    showError('Impossible de supprimer la semaine courante et les 3 semaines suivantes');
                    return;
                }
                
                try {
                    // Calculer les dates de la semaine à supprimer pour un message informatif
                    const today = new Date();
                    const currentMonday = new Date(today);
                    currentMonday.setDate(today.getDate() - today.getDay() + 1);
                    const weekStartDate = new Date(currentMonday);
                    weekStartDate.setDate(currentMonday.getDate() + (weekIndex * 7));
                    const weekEndDate = new Date(weekStartDate);
                    weekEndDate.setDate(weekStartDate.getDate() + 6);
                    
                    const weekInfo = 'du ' + weekStartDate.getDate() + '/' + (weekStartDate.getMonth() + 1) + 
                                   ' au ' + weekEndDate.getDate() + '/' + (weekEndDate.getMonth() + 1);
                    
                    if (!confirm("Supprimer définitivement la semaine " + (weekIndex + 1) + " (" + weekInfo + ") ?\\n\\nToutes les activités de cette semaine seront supprimées.")) {
                        return;
                    }
                    
                    // Trouver toutes les activités de cette semaine
                    const activitiesToDelete = schedule.filter(slot => Math.floor(slot.id / 20) === weekIndex);
                    
                    if (activitiesToDelete.length === 0) {
                        showError('Aucune activité trouvée pour cette semaine');
                        return;
                    }
                    
                    // Sauvegarder les activités pour l'historique (undo)
                    const deletedActivities = activitiesToDelete.map(activity => ({ ...activity }));
                    
                    // Supprimer toutes les activités de cette semaine du planning
                    schedule = schedule.filter(slot => Math.floor(slot.id / 20) !== weekIndex);
                    
                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'delete_week_row',
                        data: { 
                            weekIndex: weekIndex, 
                            admin: currentUser,
                            deletedCount: deletedActivities.length
                        },
                        undoData: { 
                            deletedActivities: deletedActivities
                        }
                    });
                    
                    // Rafraîchir l'affichage
                    renderCalendar();
                    updateUndoRedoButtons();
                    
                    showError('Semaine ' + (weekIndex + 1) + ' supprimée (' + deletedActivities.length + ' activités)', 'text-red-600');
                    
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
                        renderCalendar();
                        showError('Semaine supprimée (annulation)', 'text-orange-600');
                    } else if (action.type === 'delete_week_row' && action.undoData) {
                        // Restaurer les activités qui avaient été supprimées
                        const activitiesToRestore = action.undoData.deletedActivities;
                        schedule.push(...activitiesToRestore);
                        renderCalendar();
                        showError('Semaine restaurée (annulation suppression)', 'text-orange-600');
                    } else if (action.type === 'add_activity' && action.undoData) {
                        // Supprimer l\'activité qui avait été ajoutée
                        const activityId = action.undoData.activityId;
                        schedule = schedule.filter(activity => activity.id !== activityId);
                        renderCalendar();
                        showError('Activité supprimée (annulation)', 'text-orange-600');
                    } else if (action.type === 'modify_activity' && action.undoData) {
                        // Restaurer l'ancienne version de l\'activité
                        const slotId = action.undoData.slotId;
                        const oldData = action.undoData.oldData;
                        const slotIndex = schedule.findIndex(s => s.id === slotId);
                        if (slotIndex !== -1) {
                            schedule[slotIndex] = oldData;
                            renderCalendar();
                            showError('Modifications annulées', 'text-orange-600');
                        }
                    // delete_activity undo handling removed
                    } else {
                        // Pour les autres types d'actions, juste afficher un message
                        showError('Action annulée: ' + action.type, 'text-orange-600');
                    }
                    
                    updateUndoRedoButtons();
                    
                    // En production, ici on ferait l'appel API pour annuler
                    // await axios.post('/api/undo');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError(\"Erreur lors de l\\'annulation\");
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
                        renderCalendar();
                        showError('Semaine restaurée (refait)', 'text-green-600');
                    } else if (action.type === 'delete_week_row' && action.data) {
                        // Refaire la suppression de semaine
                        const weekIndex = action.data.weekIndex;
                        schedule = schedule.filter(slot => Math.floor(slot.id / 20) !== weekIndex);
                        renderCalendar();
                        showError('Semaine supprimée (refait)', 'text-red-600');
                    } else if (action.type === 'add_activity' && action.data) {
                        // Refaire l'ajout d\'activité
                        const activityToRestore = action.data.activity;
                        schedule.push(activityToRestore);
                        renderCalendar();
                        showError('Activité restaurée (refait)', 'text-green-600');
                    } else if (action.type === 'modify_activity' && action.data) {
                        // Refaire la modification d\'activité
                        const slotId = action.data.slotId;
                        const newData = action.data.newData;
                        const slotIndex = schedule.findIndex(s => s.id === slotId);
                        if (slotIndex !== -1) {
                            schedule[slotIndex] = newData;
                            renderCalendar();
                            showError('Modifications restaurées (refait)', 'text-green-600');
                        }
                    // delete_activity redo handling removed
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

            function openHistoryModal() {
                const history = actionHistory.getHistory();
                const historyList = document.getElementById('historyList');
                
                if (history.length === 0) {
                    historyList.innerHTML = '<p class="text-gray-500 text-center py-4">Aucun historique</p>';
                } else {
                    historyList.innerHTML = history.map(action => {
                        const timeStr = action.timestamp.toLocaleTimeString('fr-FR');
                        return '<div class="p-3 bg-gray-50 rounded border">' +
                            '<div class="font-medium">' + action.type + '</div>' +
                            '<div class="text-sm text-gray-500">' + timeStr + '</div>' +
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
                    console.log('🚀 Début ajout activité');
                    
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
                        maxVolunteers: parseInt(document.getElementById('maxVolunteers').value),
                        notes: document.getElementById('activityNotes').value.trim(),
                        isUrgent: document.getElementById('isUrgent').checked
                    };

                    console.log('📝 Données du formulaire:', formData);

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
                    
                    // Générer un ID unique simple et sûr
                    const baseId = Date.now();
                    const randomSuffix = Math.floor(Math.random() * 1000);
                    const newId = baseId + randomSuffix;
                    
                    // Créer la nouvelle activité
                    const newActivity = {
                        id: newId,
                        date: formData.date,
                        day_of_week: dayOfWeek,
                        activity_type: formData.type,
                        volunteer_name: null,
                        status: formData.isUrgent ? 'urgent' : 'available',
                        max_volunteers: formData.maxVolunteers,
                        notes: formData.notes,
                        time: formData.time,
                        is_urgent_when_free: formData.isUrgent,
                        color: getColorForActivityType(formData.type)
                    };

                    console.log('🎯 Nouvelle activité créée:', newActivity);
                    
                    // Montrer un message de traitement AVANT de fermer le modal
                    showError('Ajout en cours...', 'text-blue-600');
                    
                    // Désactiver le bouton de soumission pour éviter les doubles clics
                    const submitButton = document.querySelector('#addActivityForm button[type="submit"]');
                    if (submitButton) {
                        submitButton.disabled = true;
                        submitButton.textContent = 'Ajout en cours...';
                    }
                    
                    try {
                        // Ajouter l\'activité au planning local AVANT l'envoi au serveur
                        schedule.push(newActivity);
                        console.log('📋 Planning local mis à jour, total:', schedule.length);

                        // Sauvegarder sur le serveur IMMÉDIATEMENT avec optimisation mémoire
                        console.log('💾 Envoi au serveur...');
                        
                        // Créer une copie allégée du planning pour éviter les problèmes de mémoire
                        const lightSchedule = schedule.map(item => ({
                            id: item.id,
                            date: item.date,
                            day_of_week: item.day_of_week,
                            activity_type: item.activity_type,
                            volunteer_name: item.volunteer_name,
                            status: item.status,
                            max_volunteers: item.max_volunteers || 1,
                            notes: item.notes || "",
                            time: item.time || "",
                            is_urgent_when_free: item.is_urgent_when_free || false
                        }));
                        
                        const response = await axios.post('/api/schedule', lightSchedule, {
                            timeout: 10000, // 10 secondes timeout
                            maxContentLength: Infinity,
                            maxBodyLength: Infinity
                        });
                        console.log('✅ Réponse serveur:', response.data);
                        
                        // Succès - Fermer le modal 
                        closeAddActivityModal();
                        
                        // Ajouter à l'historique
                        actionHistory.addAction({
                            type: 'add_activity',
                            data: { activity: newActivity, user: currentUser },
                            undoData: { activityId: newActivity.id }
                        });
                        
                        updateUndoRedoButtons();
                        showError('✅ Activité "' + formData.type + '" ajoutée avec succès pour le ' + formData.date, 'text-green-600');
                        
                    } catch (saveError) {
                        console.error('❌ Erreur de sauvegarde:', saveError);
                        
                        // Échec - Retirer l\'activité du planning local
                        const activityIndex = schedule.findIndex(a => a.id === newActivity.id);
                        if (activityIndex !== -1) {
                            schedule.splice(activityIndex, 1);
                            console.log('🗑️ Activité retirée du planning local');
                        }
                        
                        // Message d\'erreur spécifique selon le type d\'erreur
                        let errorMessage = '❌ Erreur lors de la sauvegarde. Veuillez réessayer.';
                        const errorMsg = saveError?.message || saveError?.toString() || '';
                        
                        if (errorMsg.includes('out of memory')) {
                            errorMessage = '❌ Serveur surchargé. Veuillez attendre quelques secondes et réessayer.';
                        } else if (saveError?.code === 'ECONNABORTED' || errorMsg.includes('timeout')) {
                            errorMessage = '❌ Délai d\\'attente dépassé. Vérifiez votre connexion et réessayez.';
                        }
                        
                        showError(errorMessage, 'text-red-600');
                        
                        // Réactiver le bouton
                        if (submitButton) {
                            submitButton.disabled = false;
                            submitButton.textContent = 'Ajouter';
                        }
                    }
                    
                } catch (error) {
                    console.error('💥 Erreur générale:', error);
                    showError('Erreur ajout: ' + (error?.message || error));
                    
                    // Réactiver le bouton en cas d'erreur générale
                    const submitButton = document.querySelector('#addActivityForm button[type="submit"]');
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = 'Ajouter';
                    }
                }
                
                // Rafraîchir le calendrier après l'ajout (succès ou échec) avec protection mémoire
                try {
                    console.log('🔄 Rafraîchissement du calendrier...');
                    renderCalendar();
                } catch (renderError) {
                    console.error('❌ Erreur de rendu calendrier:', renderError);
                    if (renderError.message && renderError.message.includes('out of memory')) {
                        showError('❌ Trop de données à afficher. Rechargez la page.', 'text-red-600');
                    } else {
                        showError('❌ Erreur d\\'affichage du calendrier', 'text-red-600');
                    }
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
                
                // Gérer le type d\'activité
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
                document.getElementById('modifyMaxVolunteers').value = slot.max_volunteers || 1;
                document.getElementById('modifyActivityNotes').value = slot.notes || '';
                document.getElementById('modifyIsUrgent').checked = slot.is_urgent_when_free || false;

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
                        maxVolunteers: parseInt(document.getElementById('modifyMaxVolunteers').value),
                        notes: document.getElementById('modifyActivityNotes').value.trim(),
                        isUrgent: document.getElementById('modifyIsUrgent').checked
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

                    // Trouver l\'activité à modifier
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
                    
                    // Mettre à jour l\'activité
                    schedule[slotIndex] = {
                        ...schedule[slotIndex],
                        activity_type: formData.type,
                        date: formData.date,
                        day_of_week: dayOfWeek,
                        time: formData.time,
                        max_volunteers: formData.maxVolunteers,
                        notes: formData.notes,
                        is_urgent_when_free: formData.isUrgent,
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
                    showError("Erreur lors de la modification");
                }
            }

            // deleteActivity function removed to fix parsing error

            function getColorForActivityType(type) {
                const colorMap = {
                    'Nourrissage': '#dc3545',
                    'Légumes': '#ffc107', 
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
                
                // Mettre à jour l\'activité
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