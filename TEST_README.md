# 🧪 Branche de Test - Nouvelles Fonctionnalités

## 📍 URLs

### Production (NE PAS MODIFIER)
- **URL** : https://calendrier-cercle-animo.pages.dev
- **Branche** : `main`
- **Usage** : URL partagée avec les bénévoles

### Test/Développement (SAFE TO BREAK)
- **URL** : https://test-nouvelles-fonctionnalites.calendrier-cercle-animo.pages.dev
- **Branche** : `test/nouvelles-fonctionnalites`
- **Usage** : Expérimentations et nouveaux développements

---

## 🔧 Workflow de développement

### 1️⃣ Pour commencer à tester
```bash
# Vérifier que vous êtes sur la bonne branche
git branch

# Vous devriez voir : * test/nouvelles-fonctionnalites
```

### 2️⃣ Faire des modifications
- Modifiez les fichiers `src/index.tsx` ou `src/db-helpers.ts`
- Testez localement si nécessaire

### 3️⃣ Déployer vos tests
```bash
# Build
npm run build

# Commit
git add .
git commit -m "test: description de vos modifications"

# Push et déploiement automatique
git push origin test/nouvelles-fonctionnalites
```

### 4️⃣ Tester en ligne
Attendez 1-2 minutes puis visitez :
https://test-nouvelles-fonctionnalites.calendrier-cercle-animo.pages.dev

### 5️⃣ Quand c'est stable, merger vers production
```bash
git checkout main
git pull origin main
git merge test/nouvelles-fonctionnalites
git push origin main
```

---

## ⚠️ Important

- ✅ Cette branche utilise la **même base de données** que la production
- ⚠️ Les modifications de données seront **visibles partout**
- 💡 Si vous voulez une base de données séparée, il faut créer une nouvelle DB D1 dans Cloudflare

---

## 🗂️ Base de données

**Base actuelle** : `calendrier-animaux-production`
- Partagée entre production et test
- ID : `0df65a54-6d17-4ec8-8a75-8848a6fe1c75`

Pour créer une base de test séparée :
1. Aller dans Cloudflare Dashboard > Workers & Pages > D1
2. Créer une nouvelle base : `calendrier-animaux-test`
3. Modifier `wrangler.toml` pour pointer vers cette base en dev

---

## 📝 Notes

Cette branche est safe pour :
- ✅ Tester de nouvelles couleurs
- ✅ Modifier l'interface
- ✅ Ajouter de nouveaux boutons
- ✅ Changer la mise en page

**Attention avec** :
- ⚠️ Modifications de la structure de la base de données
- ⚠️ Suppression de données
- ⚠️ Changements qui impactent les inscriptions en cours
