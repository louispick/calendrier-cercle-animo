# ❤️ Calendrier du Cercle Animô ❤️

## 📋 Aperçu du Projet
- **Nom** : Calendrier du Cercle Animô
- **Objectif** : Application web pour la gestion du calendrier de nourrissage des animaux et des activités de la ferme
- **Fonctionnalités principales** : 
  - Planning hebdomadaire interactif
  - Inscription/désinscription des bénévoles
  - Gestion des codes couleurs par statut
  - Interface d'administration
  - Nettoyage automatique des dates passées

## 🌐 URLs
- **Développement** : https://3000-i9yp455t6qb6nf3qu0ehc-6532622b.e2b.dev
- **API Endpoints** :
  - `/api/volunteers` - Liste des bénévoles
  - `/api/schedule` - Planning des créneaux
  - `/api/activity-types` - Types d'activités
  - `/api/schedule/:id/assign` - S'inscrire sur un créneau
  - `/api/schedule/:id/unassign` - Se désinscrire d'un créneau

## 🗄️ Architecture des Données
- **Modèles principaux** :
  - `volunteers` : Bénévoles avec rôles admin
  - `activity_types` : Types d'activités (Nourrissage, Légumes, Réunion)
  - `time_slots` : Créneaux de planning avec assignations
  - `special_events` : Événements ponctuels
- **Services de stockage** : Cloudflare D1 Database (SQLite) 
- **Mode développement** : Données mockées intégrées pour tests
- **Flux de données** : Frontend JavaScript ↔ API Hono ↔ D1 Database

## 👥 Guide d'Utilisation

### Pour les Bénévoles :
1. **Sélectionner votre nom** dans la liste déroulante en haut de page
2. **Parcourir le calendrier** organisé par semaines
3. **S'inscrire** en cliquant sur "S'inscrire" sur les créneaux libres
4. **Se désinscrire** en cliquant sur "Se désinscrire" sur vos créneaux

### Codes Couleurs :
- 🟡 **Jaune** : On cherche activement quelqu'un !
- ⚪ **Blanc/Gris** : Disponible (renfort ou seul)
- 🔵 **Bleu** : Créneau déjà pris
- 🟣 **Violet** : Jour des légumes

### Pour les Administrateurs :
- **Interface d'administration** apparaît automatiquement pour les comptes admin
- **Nettoyage des dates passées** via bouton dédié
- **Ajout de nouvelles semaines** au planning

## 🚀 Déploiement
- **Plateforme** : Cloudflare Pages
- **Status** : ✅ En développement (fonctionnel)
- **Stack technique** : Hono + TypeScript + TailwindCSS + D1 Database
- **Dernière mise à jour** : 7 septembre 2025

## 🔧 Fonctionnalités Actuellement Implémentées
- ✅ Interface utilisateur responsive et intuitive
- ✅ Système d'inscription/désinscription en temps réel
- ✅ Gestion des rôles (bénévoles/admin)
- ✅ Codes couleurs automatiques selon le statut
- ✅ Planning sur 2 semaines avec rotation automatique
- ✅ API RESTful complète
- ✅ Design fidèle au planning original Framacalc
- ✅ Données de test intégrées

## 🛠️ Fonctionnalités à Développer
- 🔄 Configuration de la base de données D1 en production
- 🔄 Ajout/suppression de créneaux par les admins
- 🔄 Notifications par email pour les rappels
- 🔄 Historique des assignations passées
- 🔄 Import/export du planning existant
- 🔄 Gestion des événements spéciaux (réunions)

## 📈 Étapes Suivantes Recommandées
1. **Déployer en production** sur Cloudflare Pages
2. **Configurer la base de données D1** avec les vraies données
3. **Importer le planning existant** depuis Framacalc
4. **Tester avec les vrais bénévoles** du Cercle Animô
5. **Ajouter les fonctionnalités d'administration avancées**
6. **Configurer le domaine** lattrapereves07.fr/calendrier_animaux

## 🎯 Correspondance avec le Planning Original
L'application reproduit fidèlement la structure du planning Framacalc :
- **Semaines** organisées en blocs
- **Activités** : Nourrissage quotidien, Légumes (mardi), événements spéciaux
- **Bénévoles** : Alice, Manu, Guillaume, Eliza, Sandrine, Laet, Les Furgettes
- **Codes couleurs** identiques au système original