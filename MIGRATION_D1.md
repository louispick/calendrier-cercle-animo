# 🚀 Migration vers Cloudflare D1 - Guide Complet

## ✅ Ce qui a été fait

1. ✅ Configuration D1 dans `wrangler.jsonc`
2. ✅ Création du schéma SQL (`schema.sql`)
3. ✅ Création des fonctions helpers D1 (`src/db-helpers.ts`)
4. ✅ Migration du code pour utiliser D1 au lieu de la mémoire
5. ✅ Test de compilation réussi

---

## 📋 ÉTAPES À SUIVRE (Dans l'ordre)

### ÉTAPE 1 : Initialiser le schéma de la base de données ⚠️ IMPORTANT

Sur votre ordinateur, dans le dossier du projet :

```bash
# 1. Récupérer les derniers changements
git pull origin fix/activity-id-range-error

# 2. Initialiser le schéma dans D1 (REMOTE - production)
npx wrangler d1 execute calendrier-animaux-production --remote --file=./schema.sql
```

**Vous devriez voir :**
```
🌀 Executing on remote database calendrier-animaux-production (0df65a54-6d17-4ec8-8a75-8848a6fe1c75):
🚣 Executed 4 commands in 0.123s
```

✅ **Important** : Cela crée la table `schedule` dans votre base de données D1.

---

### ÉTAPE 2 : Lier D1 à Cloudflare Pages

1. Allez sur votre dashboard Cloudflare : https://dash.cloudflare.com
2. **Workers & Pages** → **calendrier-cercle-animo**
3. Cliquez sur **"Settings"** (en haut)
4. Descendez jusqu'à **"Bindings"** (ou "Functions")
5. Cliquez sur **"Add"** sous **"D1 database bindings"**

**Configuration à remplir :**
```
Variable name: DB
D1 database: calendrier-animaux-production
```

6. Cliquez sur **"Save"**

---

### ÉTAPE 3 : Pousser le code et redéployer

Sur votre machine :

```bash
# Pousser les changements sur GitHub
git push origin fix/activity-id-range-error
```

Cloudflare Pages va automatiquement :
- ✅ Détecter les changements
- ✅ Redéployer l'application
- ✅ Utiliser D1 pour la persistance

**Temps de déploiement** : ~2-3 minutes

---

### ÉTAPE 4 : Tester la persistance

1. Allez sur : https://calendrier-cercle-animo.pages.dev/
2. Inscrivez-vous à une activité
3. **Actualisez la page** (F5)
4. ✅ Vos données devraient **persister** ! 🎉

---

## 🔍 Vérification de la base de données

Pour voir les données dans D1 :

```bash
# Lister les tables
npx wrangler d1 execute calendrier-animaux-production --remote --command="SELECT name FROM sqlite_master WHERE type='table';"

# Voir le contenu de la table schedule
npx wrangler d1 execute calendrier-animaux-production --remote --command="SELECT * FROM schedule LIMIT 5;"

# Compter le nombre d'activités
npx wrangler d1 execute calendrier-animaux-production --remote --command="SELECT COUNT(*) as total FROM schedule;"
```

---

## 📊 Différences avec la version en mémoire

| Aspect | Version Mémoire | Version D1 |
|--------|----------------|-----------|
| **Persistance** | ❌ Perdue au redémarrage | ✅ Permanente |
| **Actualisation page** | ❌ Données perdues | ✅ Données conservées |
| **Production ready** | ❌ Non | ✅ Oui |
| **Coût** | Gratuit | Gratuit (jusqu'à 5M requêtes/mois) |
| **Performance** | Très rapide | Rapide |

---

## 🗄️ Structure de la base de données

### Table `schedule`

```sql
CREATE TABLE schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                    -- Format: 'YYYY-MM-DD'
  time TEXT,                             -- Format: 'HH:MM'
  activity_type TEXT NOT NULL,           -- 'Nourrissage', 'Légumes', etc.
  description TEXT,
  notes TEXT,
  status TEXT DEFAULT 'free',            -- 'free', 'assigned', 'urgent'
  volunteer_name TEXT,                   -- Pour compatibilité (nourrissages)
  volunteers TEXT DEFAULT '[]',          -- JSON array des bénévoles
  is_urgent_when_free INTEGER DEFAULT 0, -- 0 = false, 1 = true
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## 🆘 Dépannage

### Problème : "Table already exists"

Si vous avez déjà exécuté le schema.sql :
```bash
# Supprimer la table et recréer
npx wrangler d1 execute calendrier-animaux-production --remote --command="DROP TABLE IF EXISTS schedule;"
npx wrangler d1 execute calendrier-animaux-production --remote --file=./schema.sql
```

### Problème : "DB is not defined" dans l'application

Solution :
1. Vérifiez que le binding D1 est bien configuré dans Cloudflare Pages Settings
2. Variable name doit être exactement : **DB**
3. Redéployez l'application après avoir ajouté le binding

### Problème : Les données ne persistent pas

Vérifiez :
```bash
# Voir si des données sont en DB
npx wrangler d1 execute calendrier-animaux-production --remote --command="SELECT COUNT(*) FROM schedule;"
```

Si le count est 0 :
- L'initialisation automatique se fera au premier chargement de la page
- Ou initialisez manuellement (voir section suivante)

---

## 🎯 Initialisation manuelle des données (optionnel)

Si vous voulez pré-remplir la base avec des données de test :

```bash
# Depuis votre machine
node scripts/seed-database.js
```

(Note: Ce script n'existe pas encore, on peut le créer si besoin)

---

## 📞 Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs dans Cloudflare Pages Dashboard
2. Testez les commandes D1 ci-dessus
3. Contactez-moi avec le message d'erreur exact

---

## ✅ Checklist de migration

- [ ] Schéma SQL appliqué à D1 (`npx wrangler d1 execute...`)
- [ ] Binding D1 configuré dans Cloudflare Pages Settings
- [ ] Code poussé sur GitHub
- [ ] Déploiement automatique terminé
- [ ] Test de persistance réussi (actualisation de page)
- [ ] Bénévoles informés que les données sont maintenant sauvegardées

---

**Version actuelle :** v3.0 (Migration D1)  
**Date :** 28 octobre 2025
