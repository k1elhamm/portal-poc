# PORTAL — POC du catalogue d'API

Prototype d'un portail de catalogue d'API, avec un accueil séparé et deux vues
du même catalogue :

- **Accueil** : présentation du portail, chiffres du catalogue, recherche et
  boutons vers la mosaïque ou la cité.
- **Mosaïque** : chaque entité est une mosaïque, chaque pôle une étagère, chaque API un livre.
  - Mosaïque imbriquée, pas une grille de cartes : colonnes de rectangles de
    tailles bornées, avec un treemap de pôles dans chaque entité.
    Les titres d'entités font 17 px. Les noms longs de pôles sont abrégés
    visuellement dans l'aperçu ; le survol donne leur nom complet et chaque
    pôle reste directement cliquable.
  - Défilement **horizontal uniquement**, sans défilement vers le bas dans la
    mosaïque. La hauteur reste celle de la zone disponible ; le contenu s'étend
    vers la droite. Barre de défilement, boutons gauche/droite, clavier et
    molette permettent de parcourir les entités.
  - Les blocs sont bornés entre **240 × 180 px** et **340 × 280 px** (hauteur
    adaptée si la zone disponible est plus petite). Les premières entités
    ne peuvent donc plus occuper une surface disproportionnée.
  - Une flèche **Suite** sur le bord droit indique le contenu restant à
    découvrir. Une flèche **Retour** apparaît à gauche après défilement ;
    chaque flèche disparaît quand sa limite est atteinte.
  - Une teinte par entité, déclinée pour ses pôles et ses livres. Les couleurs
    de statut et de méthode HTTP gardent leur signification.
  - Pas de mini-livres dans la mosaïque d'ensemble.
  - Dans une entité, les pôles ont des panneaux de dimensions identiques,
    avec nom, domaine, nombre de ressources, endpoints, appels/jour,
    responsable et exemples de ressources. Toute la surface permet d'ouvrir
    les livres. Les panneaux se parcourent horizontalement, sans titre tronqué
    ni répétition du domaine dans un corps vide.
  - Nombre / Usage pondère les dimensions et les surfaces des pôles. Les
    bornes des blocs empêchent une proportionnalité stricte entre entités :
    les chiffres affichés restent la référence pour comparer les volumes.
  - Les livres sont **couchés et empilés verticalement**, par piles de six
    au maximum. Leurs titres horizontaux sont sur les tranches, pas sur de
    grandes couvertures, sans planche d'étagère marron. Tous les livres ont
    la même taille : 300 × 64 px, avec une largeur réduite uniformément si
    l'écran est plus étroit. L'usage et le nombre d'endpoints ne changent plus
    leurs dimensions ; les tris correspondants restent disponibles.
- **Cité** : chaque entité est une ville, chaque pôle un quartier, chaque API un immeuble.
  - Hauteur de l'immeuble = nombre d'endpoints.
  - État de l'immeuble = conformité à la gouvernance (hôtel de luxe à 100 %).
  - Picto au-dessus du toit = statut (production, construction, dépréciée).
  - Mode réseau (eau ou métro) pour voir les relations entre API.
  - Centres des bâtiments espacés de 3,4 unités, pour une empreinte de
    0,66 unité : 2,74 unités libres entre bâtiments, contre 0,44 auparavant.
    Les dimensions des quartiers et des villes s'adaptent à cet espacement.

> ⚠️ Toutes les données sont **fictives** : elles sont générées dans la page, avec une graine fixe, pour 25 entités, 153 pôles et 1 500 API. Elles ne reflètent aucun système réel.

## Lancer le POC

Un seul fichier, sans installation ni serveur : ouvrir [`index.html`](index.html) dans Chrome, Edge ou Firefox.

## POC Three.js

Le monde 3D libre est un POC distinct dans [`three/`](three/README.md).
Il ne remplace pas la mosaïque et la cité isométrique de la page principale.

```bash
cd three
npm ci
npm run dev
```

Ouvrir <http://localhost:4333/>. Pour Docker :

```bash
cd three
docker compose up -d --build
```

Ouvrir <http://localhost:4334/>. Depuis la racine, utiliser
`docker compose --project-directory three up -d --build`.
Les options de proxy, de sous-chemin et de publication de l'image sont
documentées dans le [README Three.js](three/README.md).
Le POC Three.js nécessite une compilation ; son fichier HTML source ne
fonctionne pas directement sur GitHub Pages sans déployer le résultat du build.

## Navigation

L'adresse de la page reflète l'écran affiché, par exemple :

- `#/mosaique`
- `#/accueil` (également l'écran initial sans fragment)
- `#/cite`
- `#/cite/e:bpcesi`, pour la ville BPCE SI en 3D

Le bouton de retour indique explicitement la destination : accueil,
catalogue ou entité. Le fil d'Ariane et l'historique du navigateur restent
disponibles ; le bouton Accueil ramène à la landing page.

## Une API, plusieurs pages

Ouvrir un livre affiche **la même API** sur sept pages :

1. Présentation commerciale.
2. Fonctionnel.
3. Endpoints et essais.
4. Consommateurs.
5. Contact.
6. Gouvernance.
7. Relations.

Les flèches et les boutons précédent/suivant changent de page, jamais d'API.
Les liens explicites vers une autre API restent disponibles dans les relations.
Le sommaire permet de rejoindre directement une section. Les essais d'endpoints
restent des simulations locales, sans appel réseau.

Le bouton **Fiche standard / Vue livre** change la présentation ; **Plein écran**
agrandit la fiche dans la fenêtre du navigateur. Échap ou **Retour à l'étagère**
la ferme. Le focus clavier reste dans la fiche ouverte puis revient au contrôle
d'origine s'il existe encore.

La présentation commerciale utilise uniquement la description et le rattachement
du jeu fictif. Bénéfices métier, cas d'usage validés, conditions d'accès, tarifs
et engagements réels sont explicitement indiqués comme restant à renseigner.

## Vérifications fonctionnelles

Parcours vérifié dans Chrome, en bureau (1440 × 1000) et mobile (390 × 844) :
accueil, 25 entités et 153 pôles, tailles minimales et défilement horizontal,
livres couchés empilés verticalement,
sept pages d'une seule API, simulation d'endpoint, affichage standard et
plein écran, retours au parent, recherche, espacement et sélection dans la cité.
Ces contrôles ne constituent pas une certification d'accessibilité ni un
benchmark de performance.

## Statut

POC de cadrage, qui sert de référence visuelle pour le futur projet Angular. Ce n'est pas du code de production.
