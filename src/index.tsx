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
    // Générer un planning d'exemple pour les prochaines 4 semaines (commence lundi)
    const today = new Date();
    const schedule = [];
    
    // Trouver le prochain lundi
    const nextMonday = new Date(today);
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek; // Si dimanche (0), alors 1 jour, sinon 8-dayOfWeek
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    
    for (let week = 0; week < 4; week++) {
      for (let day = 0; day < 7; day++) { // 0=Lundi, 1=Mardi, ..., 6=Dimanche
        const date = new Date(nextMonday);
        date.setDate(nextMonday.getDate() + (week * 7) + day);
        const dateStr = date.toISOString().split('T')[0];
        
        // Nourrissage quotidien
        schedule.push({
          id: week * 14 + day + 1,
          date: dateStr,
          day_of_week: day + 1, // 1=Lundi, 2=Mardi, ..., 7=Dimanche
          activity_type: 'Nourrissage',
          volunteer_name: day === 1 ? 'Alice' : (day === 5 ? 'Les Furgettes' : null), // Mardi et Samedi assignés
          status: day === 0 ? 'searching' : (day === 1 || day === 5 ? 'assigned' : 'available'),
          color: '#e3f2fd'
        });
        
        // Légumes le mardi (day === 1)
        if (day === 1) {
          schedule.push({
            id: week * 14 + day + 8,
            date: dateStr,
            day_of_week: day + 1,
            activity_type: 'Légumes',
            volunteer_name: 'Alice',
            status: 'assigned',
            color: '#f3e5f5'
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
          .status-available { background-color: #f8f9fa; border: 2px solid #28a745; }
          .status-assigned { background-color: #e7f3ff; border: 2px solid #007bff; }
          .status-searching { background-color: #fff3cd; border: 2px solid #ffc107; }
          .status-cancelled { background-color: #f8d7da; border: 2px solid #dc3545; }
          
          .day-header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          
          .activity-nourrissage { background-color: #e3f2fd; }
          .activity-legumes { background-color: #f3e5f5; }
          .activity-reunion { background-color: #fff3e0; }
          
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
                
                <!-- Légende des statuts -->
                <div class="flex flex-wrap justify-center gap-2 lg:gap-4 text-sm">
                    <div class="flex items-center gap-2">
                        <div class="w-4 h-4 bg-yellow-200 border-2 border-yellow-500"></div>
                        <span>🟡 On cherche quelqu'un !</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-4 h-4 bg-gray-100 border-2 border-green-500"></div>
                        <span>⚪ Disponible</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-4 h-4 bg-blue-100 border-2 border-blue-500"></div>
                        <span>🔵 Créneau pris</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-4 h-4 bg-purple-100 border-2 border-purple-500"></div>
                        <span>🟣 Légumes</span>
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

            <!-- Calendrier -->
            <div id="calendar" class="space-y-6">
                <!-- Le calendrier sera généré ici par JavaScript -->
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
            let schedule = [];

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
                updateNameStatus(message, 'text-red-600');
                setTimeout(() => {
                    if (currentUser) {
                        updateNameStatus('Connecte en tant que: ' + currentUser, 'text-green-600');
                    }
                }, 3000);
            }



            function renderCalendar() {
                if (!currentUser) {
                    document.getElementById('calendar').innerHTML = 
                        '<p class="text-center text-gray-500 py-8">Veuillez saisir votre nom pour voir le planning</p>';
                    return;
                }

                const calendar = document.getElementById('calendar');
                calendar.innerHTML = '';

                // Grouper par semaines (commençant le lundi)
                const weekGroups = groupByWeeks(schedule);

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
                        
                        th.innerHTML = \`
                            <div class="text-sm font-medium">\${dayName}</div>
                            <div class="text-lg lg:text-xl font-bold">\${dayDate.getDate()}</div>
                            <div class="text-xs opacity-75">\${dayDate.toLocaleDateString('fr-FR', { month: 'short' })}</div>
                        \`;
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
                            
                            // Trouver les activités pour ce jour et ce type
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

            // Générer un créneau
            function renderSlot(slot) {
                const slotDiv = document.createElement('div');
                slotDiv.className = \`status-\${slot.status} rounded p-2 mb-2 cursor-pointer transition-all hover:shadow-md text-xs lg:text-sm\`;
                
                let actionButton = '';
                if (currentUser) {
                    if (slot.status === 'available' || slot.status === 'searching') {
                        actionButton = '<button onclick="assignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 w-full">Inscription</button>';
                    } else if (slot.volunteer_name === currentUser) {
                        actionButton = '<button onclick="unassignSlot(' + slot.id + ')" class="mt-1 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 w-full">Desinscription</button>';
                    }
                }

                slotDiv.innerHTML = \`
                    <div class="font-medium text-xs lg:text-sm mb-1">\${slot.activity_type}</div>
                    <div class="text-xs text-gray-600 mb-1">
                        \${slot.volunteer_name ? '👤 ' + slot.volunteer_name : '⭕ Libre'}
                    </div>
                    \${slot.notes ? \`<div class="text-xs text-gray-500 italic mb-1">\${slot.notes}</div>\` : ''}
                    \${actionButton}
                \`;

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
                        // Mettre à jour localement pour un feedback immédiat
                        const slot = schedule.find(s => s.id == slotId);
                        if (slot) {
                            slot.volunteer_name = null;
                            slot.status = 'available';
                        }
                        renderCalendar();
                    } else {
                        showError('Erreur: ' + response.data.error);
                    }
                } catch (error) {
                    console.error('Erreur:', error);
                    showError('Erreur lors de la desinscription');
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