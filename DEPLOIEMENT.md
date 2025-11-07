# 🚀 Guide de Déploiement - Cercle Animô

## Étape 1 : Pousser le code sur GitHub

Depuis votre machine locale :

```bash
# Cloner le repository si ce n'est pas déjà fait
git clone https://github.com/louispick/calendrier-cercle-animo.git
cd calendrier-cercle-animo

# Récupérer la dernière version
git fetch origin
git checkout fix/activity-id-range-error
git pull origin fix/activity-id-range-error

# Si vous avez des modifications locales, les pousser
git push origin fix/activity-id-range-error
```

## Étape 2 : Créer un compte Cloudflare (GRATUIT)

1. Allez sur https://dash.cloudflare.com/sign-up
2. Créez un compte gratuit (email + mot de passe)
3. Vérifiez votre email

## Étape 3 : Déployer sur Cloudflare Pages

### 3.1 Connecter GitHub à Cloudflare

1. Connectez-vous à https://dash.cloudflare.com
2. Dans le menu de gauche, cliquez sur **"Workers & Pages"**
3. Cliquez sur **"Create application"**
4. Sélectionnez l'onglet **"Pages"**
5. Cliquez sur **"Connect to Git"**
6. Autorisez Cloudflare à accéder à votre GitHub
7. Sélectionnez le repository : **calendrier-cercle-animo**
8. Sélectionnez la branche : **fix/activity-id-range-error**

### 3.2 Configuration du Build

Dans les paramètres de build, configurez :

**Framework preset:** `Vite`
**Build command:** `npm run build`
**Build output directory:** `dist`

**Variables d'environnement (optionnel pour l'instant):**
- Vous pouvez les laisser vides pour la version beta

### 3.3 Lancer le déploiement

1. Cliquez sur **"Save and Deploy"**
2. Le déploiement prendra environ 1-2 minutes
3. Une fois terminé, vous obtiendrez une URL comme :
   `https://calendrier-cercle-animo.pages.dev`

## Étape 4 : Configurer un nom de domaine personnalisé (OPTIONNEL)

Si vous avez un domaine (ex: `planning.cercle-animo.fr`) :

1. Dans Cloudflare Pages, allez dans l'onglet **"Custom domains"**
2. Cliquez sur **"Set up a custom domain"**
3. Suivez les instructions pour connecter votre domaine

## Étape 5 : Tester la version Beta

Une fois déployé :

1. Visitez l'URL fournie par Cloudflare
2. Testez toutes les fonctionnalités :
   - ✅ Inscription des bénévoles
   - ✅ Ajout/suppression d'activités (mode admin)
   - ✅ Multi-bénévoles
   - ✅ Toggle urgent
   - ✅ Mobile responsive
3. Partagez l'URL avec quelques bénévoles pour tests

## Étape 6 : Mises à jour futures

Pour mettre à jour l'application :

1. Poussez vos modifications sur GitHub :
   ```bash
   git add .
   git commit -m "Description des changements"
   git push origin fix/activity-id-range-error
   ```

2. Cloudflare Pages redéploiera **automatiquement** ! 🎉
   (En quelques secondes après le push)

## 📊 Surveillance

Cloudflare Pages offre :
- **Analytics gratuits** : nombre de visites, pages vues
- **Logs d'erreurs** : si quelque chose ne fonctionne pas
- **Rollback facile** : revenir à une version précédente en un clic

## 🔒 Sécurité et Limitations

### ⚠️ IMPORTANT - Persistance des données

**Actuellement, les données sont stockées EN MÉMOIRE sur le serveur.**

Cela signifie que :
- ✅ Parfait pour une version BETA de test
- ⚠️ Les données sont **perdues lors du redémarrage du serveur**
- ⚠️ Pas adapté pour la production finale

### Pour la production (prochaine étape) :

Vous aurez besoin de **Cloudflare D1** (base de données gratuite) :
1. Dans Cloudflare Dashboard : **Storage & Databases** > **D1**
2. Créer une base de données : `calendrier-animaux-production`
3. Lier la DB au projet Pages
4. Migrer le code pour utiliser D1 au lieu de la mémoire

Je peux vous aider avec cette migration une fois la phase beta validée !

## 🆘 Besoin d'aide ?

Si vous rencontrez des problèmes :
1. Vérifiez les logs dans Cloudflare Pages Dashboard
2. Testez localement avec `npm run dev`
3. Contactez-moi pour assistance

## 🎯 Checklist de déploiement

- [ ] Code poussé sur GitHub
- [ ] Compte Cloudflare créé
- [ ] Repository connecté à Cloudflare Pages
- [ ] Premier déploiement réussi
- [ ] URL partagée avec bénévoles testeurs
- [ ] Retours collectés
- [ ] Migration vers D1 planifiée (si nécessaire)

---

**Version actuelle:** v2.2 Beta
**Dernière mise à jour:** 27 octobre 2025
