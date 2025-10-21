# 📋 CAHIER DES CHARGES COMPLET - Calendrier Cercle Animô

## 🎯 CONTEXTE ET OBJECTIF PRINCIPAL

### Vision du Projet
Application web de gestion du calendrier de nourrissage des animaux et d'organisation des activités pour le **Cercle Animô** - une association de protection animale. L'objectif est de faciliter la coordination entre bénévoles tout en maintenant une interface simple et intuitive.

### Problème Principal à Résoudre
**❌ CRITIQUE : Erreur "out of memory" persistante en mode admin avec 34+ activités**
- ✅ 33 activités ou moins → Fonctionne parfaitement
- ❌ 34 activités ou plus → Crash systématique avec erreur mémoire
- 🔍 Racine du problème : Génération exponentielle d'éléments DOM en mode admin

## 🏗️ ARCHITECTURE TECHNIQUE

### Stack Technologique
- **Backend** : Hono (TypeScript framework) avec Workers/Pages de Cloudflare
- **Frontend** : HTML5 + JavaScript vanilla + TailwindCSS
- **Données** : Stockage en mémoire (développement) / Cloudflare D1 (production)
- **Build** : Vite pour le développement, Wrangler pour le déploiement
- **Icons** : FontAwesome
- **HTTP Client** : Axios

### Structure du Projet
```
webapp/
├── src/
│   └── index.tsx              # Application principale Hono (Backend + Frontend)
├── public/                    # Assets statiques
├── CORRECTIONS_CALENDRIER.md  # Historique des corrections
├── test_final.md             # Guide de tests
├── package.json              # Dépendances et scripts
└── README.md                 # Documentation utilisateur
```

## 🎨 FONCTIONNALITÉS UTILISATEUR

### 👥 Mode Utilisateur Standard
1. **Authentification Simple**
   - Saisie du prénom uniquement
   - Pas de système de mots de passe
   - Mémorisation automatique de l'utilisateur

2. **Consultation du Calendrier**
   - Vue hebdomadaire sur 4 semaines
   - Codes couleurs par type d'activité
   - Statuts visuels (urgent, assigné, disponible)
   - Interface responsive mobile/desktop

3. **Inscription aux Activités**
   - Inscription en un clic sur créneaux libres
   - Désinscription possible
   - Feedback visuel immédiat
   - Validation côté client et serveur

### ⚙️ Mode Administration
1. **Gestion des Activités**
   - Ajout d'activités via modal avec formulaire complet
   - Modification/suppression d'activités existantes
   - Assignation/désassignation de bénévoles
   - Support de tous les types d'activités

2. **Gestion du Planning**
   - Ajout/suppression de semaines entières
   - Restauration de semaines supprimées
   - Nettoyage automatique des dates passées
   - Drag & drop pour réorganiser

3. **Système d'Historique**
   - Undo/Redo pour toutes les actions
   - Historique persistant par session
   - Rollback de modifications

## 📊 TYPES D'ACTIVITÉS

### Activités Prédéfinies
- **Nourrissage** (rouge #dc3545) - Activité principale quotidienne
- **Légumes** (jaune #ffc107) - Distribution de légumes
- **Nettoyage** (bleu) - Entretien des espaces
- **Réunion** (violet) - Réunions et événements
- **Autre** - Activités personnalisées

### Statuts d'Activités
- **Available** : Créneau libre (vert)
- **Assigned** : Bénévole assigné (bleu)
- **Urgent** : Créneau prioritaire (rouge)
- **is_urgent_when_free** : Devient urgent si personne assigné

## 🔧 SPÉCIFICATIONS TECHNIQUES DÉTAILLÉES

### API Endpoints
```javascript
// Planning
GET  /api/schedule           - Récupérer le planning complet
POST /api/schedule           - Sauvegarder le planning complet
POST /api/schedule/:id/assign   - Assigner un bénévole
POST /api/schedule/:id/unassign - Désassigner un bénévole

// Bénévoles
GET  /api/volunteers         - Liste des bénévoles
POST /api/volunteers         - Ajouter un nouveau bénévole

// Types d'activités
GET  /api/activity-types     - Types d'activités disponibles
```

### Structure des Données
```javascript
// Activité/Slot
{
  id: number,                  // ID unique
  date: string,               // Format ISO (YYYY-MM-DD)
  day_of_week: number,        // 1-7 (Lundi=1, Dimanche=7)
  activity_type: string,      // Type d'activité
  volunteer_name: string|null, // Nom du bénévole assigné
  status: string,             // available|assigned|urgent
  color: string,              // Code couleur hex
  max_volunteers: number,     // Nombre max de bénévoles
  notes: string,              // Notes optionnelles
  is_urgent_when_free: boolean // Devient urgent si libre
}

// Bénévole
{
  id: number,
  name: string,
  is_admin: boolean
}
```

### Algorithme de Génération du Planning
```javascript
// Génération automatique sur 4 semaines
for (week = 0; week < 4; week++) {
  for (day = 0; day < 7; day++) {
    // Nourrissage quotidien obligatoire
    // Légumes le mardi
    // Logique de statuts par défaut
  }
}
```

## 🚨 PROBLÈME CRITIQUE ACTUEL

### Symptômes Observés
```
Console logs typiques lors du crash :
🚨 TROP D'ÉLÉMENTS dans schedule: 34 Mode admin: true - Troncature appliquée
🔄 Début groupByWeeks...
✅ groupByWeeks terminé - Semaines: 4
🗓️ Rendu semaine 1 / 4
🗓️ Rendu semaine 2 / 4  
🗓️ Rendu semaine 3 / 4
🗓️ Rendu semaine 4 / 4
❌ Erreur dans renderCalendar: out of memory
```

### Analyse Technique du Problème
1. **Complexité Algorithmique** : O(weeks × types × days × activities × listeners)
2. **Explosion DOM en Mode Admin** :
   - Chaque activité génère : 1 div + 3-5 boutons + event listeners
   - Mode admin ajoute : drag zones + drop handlers + admin buttons
   - 34 activités × multiplicateur admin = explosion mémoire

3. **Optimisations Déjà Tentées** :
   - ✅ Troncature à 33 éléments en mode admin
   - ✅ Délégation d'événements au lieu de listeners directs
   - ✅ Protection contre appels concurrents
   - ✅ Timeout de sécurité
   - ❌ Problème persiste malgré tout

### Hypothèses sur la Cause Profonde
- **Accumulation mémoire** : Les éléments DOM ne sont pas correctement nettoyés
- **Event listeners fantômes** : Listeners non supprimés lors du re-render
- **Récursion cachée** : Possible boucle infinie dans le rendering
- **Manipulation DOM excessive** : Trop d'opérations DOM simultanées

## 🎯 SOLUTIONS À EXPLORER

### Approches Architecture
1. **Virtualisation du DOM**
   - Implémenter un système de rendu virtuel
   - Afficher seulement les éléments visibles
   - Pagination/lazy loading

2. **Refactoring du Rendu**
   - Séparer complètement mode admin/utilisateur
   - Utiliser des Web Components
   - Template HTML réutilisable

3. **Optimisations Mémoire**
   - Pool d'objets pour recycler les éléments DOM
   - Cleanup explicite avant chaque render
   - Monitoring mémoire en temps réel

### Solutions Immédiates
1. **Mode Admin Simplifié**
   - Interface admin séparée avec pagination
   - Édition d'une semaine à la fois
   - Vue liste au lieu de grille

2. **Rendu Différé**
   - RequestAnimationFrame pour le rendu
   - Batch les opérations DOM
   - Progress indicator pendant le rendu

## 🔍 CONTRAINTES ET SPÉCIFICATIONS

### Contraintes Techniques
- **Performance** : Maximum 33 activités en mode admin (limite actuelle)
- **Compatibilité** : Chrome, Firefox, Safari, Edge
- **Responsive** : Mobile-first, tablette, desktop
- **Localisation** : Interface en français uniquement
- **Déploiement** : Cloudflare Pages/Workers

### Contraintes Métier
- **Simplicité d'usage** : Interface intuitive pour bénévoles non-techniques
- **Fiabilité** : Pas de perte de données lors des inscriptions
- **Réactivité** : Feedback immédiat sur les actions utilisateur
- **Accessibilité** : Codes couleurs + textes descriptifs

### Spécifications de Performance
- **Temps de chargement** : < 3 secondes
- **Temps de réponse API** : < 500ms
- **Compatibilité mobile** : Touches tactiles > 44px
- **Limite mémoire** : Ne pas dépasser 100MB heap

## 📋 FONCTIONNALITÉS DÉTAILLÉES

### Gestion des Bénévoles
```javascript
// Bénévoles prédéfinis
const volunteers = [
  { id: 1, name: 'Alice', is_admin: true },
  { id: 2, name: 'Manu', is_admin: false },
  { id: 3, name: 'Guillaume', is_admin: false },
  { id: 4, name: 'Eliza', is_admin: false },
  { id: 5, name: 'Sandrine', is_admin: false },
  { id: 6, name: 'Laet', is_admin: false },
  { id: 7, name: 'Les Furgettes', is_admin: false }
];
```

### Modal d'Ajout d'Activité
**Champs du formulaire** :
- Type d'activité (dropdown)
- Date (date picker)
- Heure (time picker, optionnel)
- Nombre max de bénévoles (number, défaut: 1)
- Notes (textarea, optionnel)
- Urgence (checkbox)

**Validation** :
- Date obligatoire et future
- Type d'activité obligatoire
- Max bénévoles > 0
- Échappement des caractères spéciaux français

### Système d'Urgence
- **Activités urgentes** : Badge rouge "URGENT"
- **Logique auto** : Lundi et Jeudi deviennent urgents si libres
- **Priorité visuelle** : Rouge > Orange > Jaune > Vert
- **Notifications** : Messages d'alerte pour créneaux critiques

## 🧪 PROTOCOLE DE TESTS

### Tests de Régression Obligatoires
1. **Test de Base** : Chargement avec 33 activités ✅
2. **Test Limite** : Chargement avec 34 activités ❌ 
3. **Test Mode Admin** : Activation/désactivation
4. **Test Ajout** : Ajout d'activité avec persistance
5. **Test Mémoire** : Monitoring heap pendant utilisation

### Scénarios de Test Critique
```javascript
// Scénario problématique actuel
1. Charger application avec 33 activités → OK
2. Ajouter 1 activité → Total 34 → CRASH
3. Activer mode admin avec 34 activités → CRASH immédiat
4. Console montre "out of memory"
```

### Métriques de Validation
- **Mémoire utilisée** : < 100MB heap
- **Temps de rendu** : < 2 secondes pour 50 activités
- **FPS interface** : > 30 FPS pendant interactions
- **Crash rate** : 0% avec données normales

## 🔒 SÉCURITÉ ET ROBUSTESSE

### Validation des Données
- **Côté client** : Validation immédiate avec feedback
- **Côté serveur** : Validation complète avant sauvegarde
- **Échappement** : Caractères spéciaux français (apostrophes)
- **XSS Protection** : HTML sanitization

### Gestion d'Erreurs
```javascript
// Pattern de gestion d'erreur
try {
  // Opération à risque
} catch (error) {
  console.error('❌ Erreur:', error);
  showError('Message utilisateur friendly');
  // Fallback gracieux
} finally {
  // Cleanup obligatoire
}
```

### Historique des Erreurs Résolues
- ✅ `missing ) after argument list` - Apostrophes mal échappées
- ✅ Interface bloquante - Fermeture modal immédiate
- ✅ Perte de données - Vraie persistance API
- ❌ Out of memory - **EN COURS DE RÉSOLUTION**

## 📈 ÉVOLUTIVITÉ

### Améliorations Future Prévues
1. **Base de données D1** : Persistance réelle en production
2. **Système de notifications** : Email/SMS pour rappels
3. **Export/Import** : Sauvegarde planning en CSV/iCal
4. **Multi-associations** : Support plusieurs cercles animaux
5. **Interface mobile native** : App mobile dédiée

### Extensibilité Technique
- **Plugins** : Système de plugins pour nouvelles fonctionnalités
- **Thèmes** : Customisation interface par association
- **API publique** : Intégration avec autres systèmes
- **Webhooks** : Notifications temps réel

## 🎲 DONNÉES DE TEST

### Planning de Base (33 activités)
```javascript
// Génération automatique sur 4 semaines
// Nourrissage quotidien (28 activités)
// Légumes le mardi (4 activités)  
// Réunion vendredi semaine 2 (1 activité)
// Total : 33 activités → Fonctionne ✅
```

### Données Problématiques (34+ activités)
- **Trigger** : Ajout d'une 34ème activité via interface
- **Résultat** : Crash immédiat "out of memory"
- **Reproductibilité** : 100% sur différents navigateurs

## 🚀 DÉPLOIEMENT ET INFRASTRUCTURE

### Environnements
- **Développement** : `npm run dev` sur port 5173
- **Test** : Sandbox URLs temporaires
- **Production** : Cloudflare Pages avec domaine custom

### Configuration Cloudflare
```json
{
  "name": "calendrier-cercle-animo",
  "compatibility_date": "2023-10-20",
  "pages_build_output_dir": "dist",
  "build": {
    "command": "npm run build",
    "cwd": "/"
  }
}
```

### Scripts de Build
```bash
npm install          # Installation dépendances
npm run build       # Build production
npm run dev         # Développement local
npm run deploy      # Déploiement Cloudflare
```

## 💡 RECOMMANDATIONS PRIORITAIRES

### Actions Immédiates (Critique)
1. **🔴 URGENT** : Résoudre "out of memory" avec 34+ activités
2. **🟠 IMPORTANT** : Implémenter monitoring mémoire temps réel
3. **🟡 SOUHAITABLE** : Refactoring architecture pour scalabilité

### Approche Recommandée
1. **Phase 1** : Diagnostic approfondi du memory leak
2. **Phase 2** : Solution temporaire (pagination mode admin)
3. **Phase 3** : Refactoring architecture complète
4. **Phase 4** : Tests de charge et optimisation

### Outils de Diagnostic Suggérés
- Chrome DevTools Memory tab
- Heap snapshots avant/après crash
- Performance profiling avec 33 vs 34 activités
- Memory leak detection automatisée

---

## 📞 CONTACTS ET RESSOURCES

### URLs Importantes
- **App de test** : URLs sandbox temporaires générées à chaque session
- **Repository** : Intégration Git avec branche `genspark_ai_developer`
- **Documentation** : `CORRECTIONS_CALENDRIER.md`, `test_final.md`

### Fichiers Clés à Analyser
- **`/home/user/webapp/src/index.tsx`** - Code principal (lignes 1132-1400 critiques)
- **Fonction `renderCalendar()`** - Point de défaillance mémoire
- **Event delegation système** - Optimisations appliquées
- **Troncature logic** - Protection actuelle limite 33

---

**Document créé le 21 octobre 2025**  
**Statut** : 🔴 **PROBLÈME CRITIQUE ACTIF - Out of Memory**  
**Priorité** : **MAXIMALE** - Bloque utilisation normale en mode admin

---

*Ce document consolide l'intégralité des spécifications, corrections et problèmes en cours pour permettre un travail parallèle efficace sur la résolution du problème critique de mémoire.*