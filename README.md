# Planning MMI 2025-2026

Application web de visualisation et gestion du planning annuel du département MMI (Métiers du Multimédia et de l'Internet) — IUT.

## Présentation

Interface de calendrier interactif affichant les événements de l'année universitaire 2025-2026 pour l'ensemble des groupes MMI. Le planning est consultable mois par mois ou en vue annuelle. Les événements sont filtrables par groupe et colorés par catégorie.

## Fichiers du projet

```
planning-web/
├── index.html          # Page principale (structure HTML + données JSON embarquées)
├── script.js           # Logique de rendu, filtres, modales, persistance
├── style.css           # Styles (thème, grille calendrier, pills, modales)
├── calendar_data.json  # Données source des événements (importées dans index.html)
└── Calendrier MMI.xlsx # Fichier source Excel d'origine
```

> Les données de `calendar_data.json` sont embarquées dans `index.html` sous forme de balises `<script type="application/json">` au chargement. Il n'y a pas de serveur backend — tout fonctionne en pur HTML/CSS/JS.

## Groupes

| Groupe | Description |
|--------|-------------|
| MMI1 | Première année |
| MMI2-crea | Deuxième année — parcours Créa |
| MMI2-Dev | Deuxième année — parcours Dev |
| MMI2-App | Deuxième année — parcours App (alternance) |
| MMI3-crea | Troisième année — parcours Créa |
| MMI3-Dev | Troisième année — parcours Dev |
| MMI3-App | Troisième année — parcours App (alternance) |
| Salons | Événements Salons |
| JPO | Journées Portes Ouvertes |
| Réunion | Réunions département |
| Autre | Événements divers |
| Férié | Jours fériés (injectés automatiquement) |

## Catégories d'événements (couleurs des pills)

Les pills dans les cellules sont colorées selon le **groupe** auquel appartient l'événement, avec la même couleur que le badge correspondant dans la barre de filtres.

La catégorie du texte (SAE, stage, examen…) est détectée automatiquement par le mot-clé dans l'intitulé et sert à d'autres logiques (ex. répétition semaine-complète).

| Catégorie détectée | Mots-clés |
|--------------------|-----------|
| SAE | "sae", "saé" |
| Entreprise | "entreprise", "alternance" |
| Stage | "stage" |
| Vacances | "vacances" |
| Examen | "examen", "soutenance", "jury", "portfolio", "rattrapages" |
| Férié | "noël", "toussaint", "armistice", "pâques", "ascension"… |

## Jours fériés grisés automatiquement

Les jours suivants sont automatiquement grisés (comme les vacances) et reçoivent une pill "Férié" :

- 1er novembre 2025 — Toussaint
- 11 novembre 2025 — Armistice
- 1er janvier 2026 — Jour de l'an
- 6 avril 2026 — Lundi de Pâques
- 1er mai 2026 — Fête du Travail
- 8 mai 2026 — Victoire 1945
- 14 mai 2026 — Ascension
- 25 mai 2026 — Lundi de Pentecôte

## Fonctionnalités

### Consultation
- **Vue mensuelle** : grille Lu–Ve, semaine par semaine, avec numéro de semaine
- **Vue annuelle** : mini-calendriers de tous les mois
- **Navigation rapide** : boutons par mois dans l'en-tête, collants au scroll
- **En-tête des jours** (Lundi–Vendredi) fixe au scroll dans chaque section mois
- Jours de vacances et fériés grisés, avec label "VACANCES" affiché

### Filtrage
- Filtres par groupe dans la barre d'outils (persistants visuellement)
- Les pills masquées restent dans le DOM (accessibilité préservée)

### Gestion des événements
- **Ajouter** un événement : clic sur le bouton `+` d'une cellule → modale avec sélection du groupe, plage de dates et intitulé
- **Modifier** un événement : clic sur une pill → modale de détail → bouton Modifier
- **Dupliquer** un événement : clic sur une pill → modale de détail → bouton Dupliquer → nouvelle plage de dates
- **Supprimer** un événement : clic sur une pill → modale de détail → bouton Supprimer → confirmation

### Persistance
Les modifications (ajouts, suppressions, éditions) sont sauvegardées dans le `localStorage` du navigateur. Elles survivent au rechargement de la page. Les données d'origine (embarquées dans le HTML) servent de base ; les modifications les écrasent mois par mois.

> **Attention :** la persistance est locale au navigateur. Vider le cache ou utiliser un autre navigateur/appareil repart des données d'origine.

### Ordre d'affichage dans les cellules

Les événements sont affichés dans cet ordre de priorité :

1. Férié
2. Salons
3. JPO
4. Autre
5. Réunion
6. MMI1
7. MMI2-crea
8. MMI2-Dev
9. MMI2-App
10. MMI3-crea
11. MMI3-Dev
12. MMI3-App

### Répétition semaine-complète

Certains événements sont automatiquement affichés sur tous les jours ouvrés de leur semaine (dans une barre dédiée au-dessus des cellules) :

| Groupe | Catégories concernées |
|--------|-----------------------|
| MMI1 | SAE |
| MMI2-crea, MMI2-Dev | SAE, Stage |
| MMI3-crea, MMI3-Dev | SAE, Stage |
| MMI2-App, MMI3-App | SAE, Entreprise/Alternance |

## Mise à jour des données

Les données source sont dans `calendar_data.json`. Ce fichier est structuré par mois, avec pour chaque jour la liste des événements par groupe :

```json
{
  "Octobre 2025": [
    {
      "day": 6,
      "weekday": "Lu",
      "week": 41,
      "events": {
        "MMI1": "SAE Sprint 1",
        "MMI2-crea": "SAE S3"
      }
    }
  ]
}
```

Après modification du JSON, il faut le réimporter dans `index.html` (balise `<script id="jsCal" type="application/json">`).

## Lancement

Ouvrir `index.html` directement dans un navigateur. Aucun serveur ni dépendance externe n'est nécessaire.
