# 🐾 Calendrier du Cercle Animô

## 📋 Description

Application web de gestion du calendrier de nourrissage des animaux et d'organisation des activités pour le Cercle Animô. Interface responsive avec système de bénévolat et gestion administrative complète.

## ✨ Fonctionnalités

### 🗓️ **Calendrier Interactif**
- Affichage hebdomadaire du planning de nourrissage
- Codes couleurs pour les différents types d'activités
- Système d'urgence avec badges visuels
- Vue responsive pour mobile et desktop

### 👥 **Gestion des Bénévoles**
- Inscription/désinscription en un clic
- Système d'authentification par prénom
- Gestion des droits d'administration
- Historique des actions avec undo/redo

### ⚙️ **Mode Administration**
- Ajout/modification d'activités
- Gestion des semaines et planning
- Assignation/changement de bénévoles
- Nettoyage automatique des dates passées

### 🔧 **Types d'Activités Supportés**
- **Nourrissage** (rouge) - Activité principale quotidienne
- **Légumes** (jaune) - Distribution de légumes
- **Nettoyage** (bleu) - Entretien des espaces
- **Réunion** (violet) - Réunions et événements
- **Autre** - Activités personnalisées

## 🛠️ Technologies

- **Backend** : [Hono](https://hono.dev/) (TypeScript framework)
- **Frontend** : HTML5 + JavaScript vanilla + TailwindCSS
- **Déploiement** : Cloudflare Pages/Workers
- **Icons** : FontAwesome
- **HTTP Client** : Axios

## 🚀 Déploiement

### **URL de Production**
🌐 **Application en ligne** : [https://3000-i9yp455t6qb6nf3qu0ehc-6532622b.e2b.dev](https://3000-i9yp455t6qb6nf3qu0ehc-6532622b.e2b.dev)

### **Déploiement Local**
```bash
# Installation des dépendances
npm install

# Construction
npm run build

# Développement local
npm run dev

# Déploiement Cloudflare Pages
npm run deploy
```

## 📁 Structure du Projet

```
webapp/
├── src/
│   └── index.tsx              # Application principale Hono
├── public/                    # Assets statiques
├── dist/                      # Build de production
├── ecosystem.config.cjs       # Configuration PM2
├── wrangler.jsonc            # Configuration Cloudflare
├── package.json              # Dépendances et scripts
└── README.md                 # Documentation
```

## 🎯 Utilisation

### **Pour les Bénévoles**
1. **Saisir votre prénom** dans le champ d'entrée
2. **Parcourir le calendrier** pour voir les créneaux disponibles
3. **Cliquer "Inscription"** sur un créneau libre
4. **Se désinscrire** si nécessaire via "Désinscription"

### **Pour les Administrateurs**
1. **Saisir votre prénom** puis cliquer **"Admin"**
2. **Ajouter des activités** via "Ajouter Activité"
3. **Gérer les assignations** avec les boutons admin
4. **Modifier/supprimer** des activités existantes
5. **Gérer l'historique** avec undo/redo

## 🔑 Fonctionnalités Techniques

### **API Endpoints**
- `GET /api/schedule` - Récupérer le planning
- `POST /api/schedule` - Sauvegarder le planning complet
- `POST /api/schedule/:id/assign` - Assigner un bénévole
- `POST /api/schedule/:id/unassign` - Désassigner un bénévole

### **Persistance des Données**
- **Mode actuel** : Persistance en mémoire côté serveur ✅
  - Les inscriptions/désinscriptions persistent lors du rafraîchissement de la page
  - Les nouvelles activités ajoutées sont conservées
  - Les données sont stockées en mémoire sur le serveur
  - ⚠️ Les données sont réinitialisées au redémarrage du serveur
- **Future migration** : Cloudflare D1 (base de données SQL)
  - Persistance permanente même après redémarrage
  - Historique complet des modifications
  - Support multi-utilisateurs avancé

### **Sécurité**
- Validation côté client et serveur
- Échappement des caractères spéciaux
- Gestion d'erreurs robuste

## 🐛 Corrections Récentes

### **Version Actuelle (v2.0 - Octobre 2025)**
- ✅ Calendrier s'affiche correctement
- ✅ Ajout d'activités fonctionnel avec ID séquentiel
- ✅ **Persistance en mémoire côté serveur** 🆕
- ✅ **Inscriptions/désinscriptions persistantes** 🆕
- ✅ Interface utilisateur réactive et stable
- ✅ Correction des erreurs JavaScript de syntaxe

### **Problèmes Résolus (Dernières mises à jour)**
- 🔧 **RangeError lors de l'ajout d'activité** - Corrigé par système d'ID séquentiel
- 🔧 **Perte des données au refresh** - Corrigé par persistance côté serveur
- 🔧 Apostrophes françaises échappées correctement
- 🔧 Route POST /api/schedule ajoutée
- 🔧 Intégration API complète dans toutes les actions

## 👨‍💻 Développement

### **Historique Git**
Le projet contient un historique complet des améliorations et corrections :
- Système de suppression d'événements
- Optimisations de performance
- Corrections critiques du calendrier
- Refonte du système de données

### **Prochaines Améliorations**
- Intégration base de données D1 en production
- Système de notifications
- Export/import de planning
- Interface mobile optimisée

## 📞 Support

Pour toute question ou problème :
- 📧 Créer une issue sur GitHub
- 🐛 Reporter les bugs avec détails
- 💡 Proposer des améliorations

---

**Développé avec ❤️ pour le Cercle Animô**