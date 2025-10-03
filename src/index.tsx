import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

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
    return c.json({ error: 'Erreur lors de l\'ajout du bénévole' }, 500);
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
    const today = new Date();
    const schedule = [];
    
    // Trouver le prochain lundi
    const nextMonday = new Date(today);
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    
    // Générateur de données de test amélioré
    for (let week = 0; week < 4; week++) {
      for (let day = 0; day < 7; day++) {
        const date = new Date(nextMonday);
        date.setDate(nextMonday.getDate() + (week * 7) + day);
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
        
        // Légumes le mardi avec Clément par défaut
        if (day === 1) {
          schedule.push({
            id: week * 20 + day + 10,
            date: dateStr,
            day_of_week: day + 1,
            activity_type: 'Légumes',
            volunteer_name: 'Clément',
            status: 'assigned',
            color: '#ffc107', // Jaune pour légumes
            max_volunteers: 2,
            notes: 'Récupération des légumes au marché',
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
            notes: 'Réunion mensuelle du Cercle Animô',
            is_urgent_when_free: false
          });
        }
      }
    }
    
    return c.json(schedule);
  } catch (error) {
    return c.json({ error: 'Erreur lors de la récupération du planning' }, 500);
  }
});

// API - S'inscrire sur un créneau
app.post('/api/schedule/:id/assign', async (c) => {
  try {
    const { env } = c;
    const slotId = c.req.param('id');
    const { volunteer_id } = await c.req.json();

    if (!env || !env.DB) {
      return c.json({ success: true, message: 'Inscription simulée (mode développement)' });
    }
    
    const result = await env.DB.prepare(`
      UPDATE time_slots 
      SET volunteer_id = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(volunteer_id, slotId).run();
    
    if (result.changes > 0) {
      return c.json({ success: true, message: 'Inscription réussie' });
    } else {
      return c.json({ error: 'Créneau non trouvé' }, 404);
    }
  } catch (error) {
    return c.json({ error: 'Erreur lors de l\'inscription' }, 500);
  }
});

// API - Se désinscrire d'un créneau
app.post('/api/schedule/:id/unassign', async (c) => {
  try {
    const { env } = c;
    const slotId = c.req.param('id');

    if (!env || !env.DB) {
      return c.json({ success: true, message: 'Désinscription simulée (mode développement)' });
    }
    
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
    return c.json({ error: 'Erreur lors de la désinscription' }, 500);
  }
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
            background-color: #fef3c7 !important;
            border: 2px solid #f59e0b !important;
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
                        Votre nom
                    </h2>
                    <div class="flex gap-3">
                        <input 
                            type="text" 
                            id="userName" 
                            placeholder="Saisir votre nom..." 
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
                    <button id="addWeekBtn" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                        <i class="fas fa-plus mr-2"></i>
                        Ajouter une semaine
                    </button>
                </div>
            </div>
            
            <!-- Bouton Mode Admin -->
            <div class="text-center mb-6">
                <button id="toggleAdminBtn" class="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                    <i class="fas fa-cog mr-2"></i>
                    Mode Admin
                </button>
            </div>

            <!-- Panneau d'administration (masqué par défaut) -->
            <div id="adminPanel" class="hidden admin-mode rounded-lg shadow-md p-4 lg:p-6 mb-6">
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-tools mr-2"></i>
                    Administration
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <button id="addActivityBtn" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                        <i class="fas fa-plus-circle mr-2"></i>
                        Ajouter Activité
                    </button>
                    <button id="addPersonBtn" class="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 transition-colors">
                        <i class="fas fa-user-plus mr-2"></i>
                        Ajouter Personne
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
                
                <div class="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded text-sm">
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
                                <option value="Nourrissage">Nourrissage</option>
                                <option value="Légumes">Légumes</option>
                                <option value="Réunion">Réunion</option>
                                <option value="Autre">Autre</option>
                            </select>
                        </div>
                        <div class="mb-4">
                            <label for="activityDate" class="block text-sm font-medium text-gray-700 mb-2">
                                Date
                            </label>
                            <input type="date" id="activityDate" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
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
                loadUserFromStorage();
                setupEventListeners();
                await loadSchedule();
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
                renderCalendar();
            }

            function updateNameStatus(message, className = '') {
                const statusDiv = document.getElementById('nameStatus');
                statusDiv.textContent = message;
                statusDiv.className = 'mt-2 text-sm text-center ' + className;
            }

            async function loadSchedule() {
                try {
                    const response = await axios.get('/api/schedule');
                    schedule = response.data;
                    renderCalendar();
                } catch (error) {
                    console.error('Erreur:', error);
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
                document.getElementById('addPersonBtn').addEventListener('click', openAddPersonModal);
                document.getElementById('undoBtn').addEventListener('click', undoAction);
                document.getElementById('redoBtn').addEventListener('click', redoAction);
                document.getElementById('historyBtn').addEventListener('click', openHistoryModal);
                
                // Modal event listeners - Add Activity
                document.getElementById('closeAddActivityModal').addEventListener('click', closeAddActivityModal);
                document.getElementById('cancelAddActivity').addEventListener('click', closeAddActivityModal);
                document.getElementById('addActivityForm').addEventListener('submit', submitAddActivity);
                
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

            function showError(message) {
                const errorDiv = document.getElementById('errorMessage');
                document.getElementById('errorText').textContent = message;
                errorDiv.classList.remove('hidden');
                setTimeout(() => errorDiv.classList.add('hidden'), 5000);
            }

            function toggleAdminMode() {
                if (!currentUser) {
                    showError('Veuillez dabord saisir votre nom');
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
                if (!currentUser) {
                    document.getElementById('calendar').innerHTML = 
                        '<p class="text-center text-gray-500 py-8">Veuillez saisir votre nom pour voir le planning</p>';
                    return;
                }

                const calendar = document.getElementById('calendar');
                calendar.innerHTML = '';

                const weekGroups = groupByWeeks(schedule);
                const today = new Date().toISOString().split('T')[0];

                weekGroups.forEach((week, weekIndex) => {
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
                        th.className = 'p-3 lg:p-4 text-center font-semibold text-white border-r border-white/20 last:border-r-0';
                        
                        const dayDate = new Date(currentWeekStart);
                        dayDate.setDate(currentWeekStart.getDate() + dayIndex);
                        const isToday = dayDate.toISOString().split('T')[0] === today;
                        
                        th.innerHTML = 
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
                                
                                // Event listeners pour le drop
                                cell.addEventListener('dragover', handleDragOver);
                                cell.addEventListener('drop', handleDrop);
                                cell.addEventListener('dragenter', handleDragEnter);
                                cell.addEventListener('dragleave', handleDragLeave);
                            }
                            
                            const dayActivities = week.filter(slot => 
                                slot.day_of_week === (dayIndex + 1) && 
                                slot.activity_type === activityType
                            );
                            
                            dayActivities.forEach(slot => {
                                const slotDiv = renderSlot(slot);
                                cell.appendChild(slotDiv);
                            });

                            row.appendChild(cell);
                        }
                        
                        tbody.appendChild(row);
                    });

                    table.appendChild(tbody);
                    tableContainer.appendChild(table);
                    weekDiv.appendChild(tableContainer);
                    calendar.appendChild(weekDiv);
                });
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
                
                // Rendre l'élément déplaçable si en mode admin
                if (isAdminMode) {
                    slotDiv.draggable = true;
                    slotDiv.setAttribute('data-slot-id', slot.id);
                    slotDiv.style.cursor = 'grab';
                    
                    // Ajouter les event listeners pour le drag
                    slotDiv.addEventListener('dragstart', handleDragStart);
                    slotDiv.addEventListener('dragend', handleDragEnd);
                }

                let volunteersDisplay = '';
                if (slot.volunteer_name) {
                    volunteersDisplay = '👤 ' + slot.volunteer_name;
                } else {
                    volunteersDisplay = '⭕ Libre';
                }

                let actionButton = '';
                if (currentUser) {
                    if (slot.status === 'available' || slot.status === 'urgent' || !slot.volunteer_name) {
                        actionButton = '<button onclick="assignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 w-full">Inscription</button>';
                    } else if (slot.volunteer_name === currentUser) {
                        actionButton = '<button onclick="unassignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 w-full">Desinscription</button>';
                    }
                }

                // Pictogramme urgent
                let urgentBadge = '';
                if (showUrgentBadge) {
                    urgentBadge = '<div class="urgent-badge"><i class="fas fa-exclamation"></i></div>';
                }

                slotDiv.innerHTML = urgentBadge +
                                   '<div class="font-medium text-xs lg:text-sm mb-1">' + slot.activity_type + '</div>' +
                                   '<div class="text-xs mb-1">' + volunteersDisplay + '</div>' +
                                   (slot.notes ? '<div class="text-xs italic mb-1 opacity-90">' + slot.notes + '</div>' : '') +
                                   actionButton;

                return slotDiv;
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
                    showError('Erreur lors de inscription');
                }
            }

            async function unassignSlot(slotId) {
                if (!confirm('Êtes-vous sûr de vouloir vous désinscrire ?')) return;

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
                    showError('Erreur lors de la desinscription');
                }
            }

            // === FONCTIONS UNDO/REDO ===

            async function undoAction() {
                try {
                    const action = actionHistory.undo();
                    if (!action) return;

                    // Simuler l'annulation (en mode développement)
                    showError('Action annulee: ' + action.type);
                    updateUndoRedoButtons();
                    
                    // En production, ici on ferait l'appel API pour annuler
                    // await axios.post('/api/undo');
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors de annulation');
                }
            }

            async function redoAction() {
                try {
                    const action = actionHistory.redo();
                    if (!action) return;

                    // Simuler la restauration (en mode développement)
                    showError('Action restauree: ' + action.type);
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

            async function submitAddActivity(e) {
                e.preventDefault();
                
                try {
                    const formData = {
                        type: document.getElementById('activityType').value,
                        date: document.getElementById('activityDate').value,
                        maxVolunteers: parseInt(document.getElementById('maxVolunteers').value),
                        notes: document.getElementById('activityNotes').value.trim(),
                        isUrgent: document.getElementById('isUrgent').checked
                    };

                    // Validation
                    if (!formData.type || !formData.date) {
                        showError('Veuillez remplir tous les champs obligatoires');
                        return;
                    }

                    // En mode développement, simuler l'ajout
                    const newActivity = {
                        id: Date.now(),
                        date: formData.date,
                        activity_type: formData.type,
                        volunteer_name: null,
                        status: formData.isUrgent ? 'urgent' : 'available',
                        max_volunteers: formData.maxVolunteers,
                        notes: formData.notes,
                        is_urgent_when_free: formData.isUrgent,
                        color: getColorForActivityType(formData.type)
                    };

                    // Ajouter à l'historique
                    actionHistory.addAction({
                        type: 'add_activity',
                        data: { activity: newActivity, user: currentUser },
                        undoData: null
                    });

                    updateUndoRedoButtons();
                    closeAddActivityModal();
                    showError('Activité "' + formData.type + '" ajoutée pour le ' + formData.date, 'text-green-600');
                    
                    // Recharger le planning (en production)
                    // await loadSchedule();
                    
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors de l\'ajout de l\'activité');
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
                    showError('Erreur lors de l\'ajout du bénévole');
                }
            }

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
                
                // Sauvegarder l'état actuel pour undo
                const oldState = {
                    id: draggedSlot.id,
                    date: draggedSlot.date,
                    day_of_week: draggedSlot.day_of_week,
                    activity_type: draggedSlot.activity_type
                };
                
                // Calculer le nouveau day_of_week basé sur la date cible
                const targetDateObj = new Date(targetDate);
                const newDayOfWeek = (targetDateObj.getDay() + 6) % 7 + 1; // Conversion dimanche=0 vers lundi=1
                
                // Mettre à jour l'activité
                draggedSlot.date = targetDate;
                draggedSlot.day_of_week = newDayOfWeek;
                draggedSlot.activity_type = targetActivityType;
                
                // Ajouter à l'historique
                actionHistory.addAction({
                    type: 'move_activity',
                    data: {
                        slotId: draggedSlot.id,
                        newDate: targetDate,
                        newActivityType: targetActivityType,
                        user: currentUser
                    },
                    undoData: oldState
                });
                
                updateUndoRedoButtons();
                renderCalendar();
                
                showError('Activité déplacée avec succès vers le ' + targetDate, 'text-green-600');
                console.log('Activity moved successfully');
                
                // En production, on ferait ici un appel API
                // await axios.put('/api/schedule/' + draggedSlot.id + '/move', {...});
            }

            function canDropActivity(slot, targetDate, targetActivityType) {
                // Règle : on ne peut déplacer une activité que vers une cellule du même type
                return slot.activity_type === targetActivityType;
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