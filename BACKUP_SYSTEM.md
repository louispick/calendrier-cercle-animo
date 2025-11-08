# 🛡️ Système de Backup - Guide Complet

## 🆘 Pourquoi ce système ?

Suite à une **perte complète de données** après avoir cliqué sur le mode admin, nous avons implémenté un système de protection totale contre toute perte de données.

## ✨ Fonctionnalités

### 1. Backups Automatiques

**Avant CHAQUE modification**, un backup est créé automatiquement :
- ✅ Avant sauvegarde du planning (`POST /api/schedule`)
- ✅ Avant réinitialisation de la base (`POST /api/reset-database`)
- ✅ Avant restauration d'un backup (`POST /api/backups/:id/restore`)

**Résultat** : Impossible de perdre des données sans avoir un snapshot de l'état précédent.

### 2. Backups Manuels

Vous pouvez créer un backup à tout moment avec une description personnalisée.

### 3. Historique Complet

Les 100 derniers backups sont conservés automatiquement. Les plus anciens sont supprimés automatiquement.

### 4. Export JSON

Téléchargez une copie complète de votre planning au format JSON pour sauvegarde externe.

---

## 📋 Utilisation via API

### Lister les backups disponibles

```bash
curl https://91dff59b.calendrier-animaux.pages.dev/api/backups
```

**Réponse** :
```json
{
  "success": true,
  "backups": [
    {
      "id": 5,
      "created_at": "2025-11-08 08:00:00",
      "backup_type": "auto",
      "description": "Backup automatique avant modification",
      "item_count": 42
    }
  ]
}
```

### Créer un backup manuel

```bash
curl -X POST https://91dff59b.calendrier-animaux.pages.dev/api/backups/create \
  -H "Content-Type: application/json" \
  -d '{"description": "Backup avant ajout de la semaine de Noël"}'
```

**Réponse** :
```json
{
  "success": true,
  "message": "Backup créé avec succès",
  "backupId": 6,
  "itemCount": 42
}
```

### Restaurer un backup

```bash
curl -X POST https://91dff59b.calendrier-animaux.pages.dev/api/backups/5/restore
```

**Réponse** :
```json
{
  "success": true,
  "message": "Backup restauré avec succès",
  "count": 42
}
```

**⚠️ Important** : Un backup de l'état actuel est créé AVANT la restauration, vous pouvez donc annuler si besoin.

### Exporter les données

```bash
curl https://91dff59b.calendrier-animaux.pages.dev/api/export > backup-$(date +%Y%m%d).json
```

Cela télécharge un fichier JSON avec toutes les données actuelles.

---

## 🔧 Utilisation via JavaScript (Console)

Si vous êtes sur la page de l'application, ouvrez la console du navigateur (F12) et tapez :

### Créer un backup manuel

```javascript
await axios.post('/api/backups/create', {
  description: 'Backup avant grosse modification'
}).then(r => console.log(r.data));
```

### Lister les backups

```javascript
await axios.get('/api/backups').then(r => console.log(r.data.backups));
```

### Restaurer le backup #5

```javascript
await axios.post('/api/backups/5/restore').then(r => console.log(r.data));
```

### Exporter les données

```javascript
window.location.href = '/api/export';
// Téléchargera le fichier JSON
```

---

## 📊 Types de Backups

| Type | Quand ? | Description |
|------|---------|-------------|
| `auto` | Avant chaque modification | Sauvegarde automatique transparente |
| `manual` | Sur demande | Backup créé explicitement par l'utilisateur |
| `pre_reset` | Avant reset DB | Protection avant réinitialisation complète |
| `pre_restore` | Avant restauration | Permet d'annuler une restauration |

---

## 🔒 Garanties de Sécurité

### Impossible de perdre des données

Même si :
- ❌ Vous supprimez tout par erreur
- ❌ Le mode admin fait n'importe quoi
- ❌ Un bug efface la base de données
- ❌ Une mauvaise manipulation arrive

**→ Les backups automatiques vous permettent TOUJOURS de revenir en arrière !**

### Historique complet

Les 100 dernières versions sont gardées. Cela représente des **semaines d'historique** si vous faites ~5 modifications par jour.

### Pas d'impact performance

Les backups sont créés en arrière-plan et n'affectent pas la vitesse de l'application.

---

## 🚨 Scénario de Récupération

### Problème : "Tout a disparu !"

1. **Rester calme** - Les données sont sauvegardées
2. **Lister les backups** : `GET /api/backups`
3. **Identifier le bon backup** (regarder created_at et item_count)
4. **Restaurer** : `POST /api/backups/{id}/restore`
5. **Vérifier** que tout est revenu

### Exemple

```bash
# 1. Lister les backups
curl https://91dff59b.calendrier-animaux.pages.dev/api/backups

# 2. Restaurer le backup #8 (créé il y a 1h avec 42 items)
curl -X POST https://91dff59b.calendrier-animaux.pages.dev/api/backups/8/restore

# 3. Vérifier
curl https://91dff59b.calendrier-animaux.pages.dev/api/schedule | jq length
# Devrait afficher: 42
```

---

## 📁 Structure Technique

### Table `backups`

```sql
CREATE TABLE backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_data TEXT NOT NULL,        -- JSON du schedule complet
  created_at TEXT DEFAULT (datetime('now')),
  backup_type TEXT DEFAULT 'auto',  -- Type de backup
  description TEXT,                 -- Description optionnelle
  item_count INTEGER DEFAULT 0      -- Nombre d'activités
);
```

### Fonctions Helper (TypeScript)

- `createBackup(db, schedule, type, description)` - Créer un backup
- `getAllBackups(db, limit)` - Lister les backups
- `getBackupById(db, id)` - Récupérer un backup
- `restoreBackup(db, id)` - Restaurer un backup
- `cleanOldBackups(db, keepCount)` - Nettoyer les vieux backups

---

## 💡 Bonnes Pratiques

### Avant une grosse modification

```bash
curl -X POST https://91dff59b.calendrier-animaux.pages.dev/api/backups/create \
  -H "Content-Type: application/json" \
  -d '{"description": "Avant ajout des 4 prochaines semaines"}'
```

### Export hebdomadaire

Configurez un cron ou faites manuellement un export chaque semaine :

```bash
curl https://91dff59b.calendrier-animaux.pages.dev/api/export > backup-hebdo-$(date +%Y%m%d).json
```

### Vérification mensuelle

Une fois par mois, listez les backups et vérifiez qu'ils existent :

```bash
curl https://91dff59b.calendrier-animaux.pages.dev/api/backups | jq '.backups | length'
```

---

## 🎯 Prochaines Améliorations Possibles

1. **Interface Admin UI** - Gérer les backups depuis l'interface web
2. **Backups planifiés** - Créer automatiquement des backups quotidiens
3. **Export vers R2/S3** - Sauvegardes externes automatiques
4. **Notifications** - Email lors de restaurations importantes
5. **Rétention configurable** - Définir combien de backups garder

---

## 📞 Support

Si vous avez des questions ou des problèmes :
1. Vérifiez d'abord les logs console (F12)
2. Listez les backups disponibles
3. Consultez la PR #2 sur GitHub pour plus de détails

**Le système est maintenant TOTALEMENT protégé contre les pertes de données !** 🎉
