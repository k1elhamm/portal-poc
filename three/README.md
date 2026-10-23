# PORTAL - Monde 3D Three.js

POC autonome, distinct du POC HTML historique et de la version Angular/PixiJS.
Pas de migration ni de remplacement des projets existants.

## Demarrer

Node.js 22 est utilise pour le developpement.

```bash
npm ci
npm run dev
```

Ouvrir <http://localhost:4333>. Les modules Three.js sont servis localement :
aucun CDN, compte ou service tiers requis a l'execution.

```bash
npm test
npm run build
```

Tests navigateur (serveur demarre) :

```bash
npx playwright install chromium
npm run test:browser
```

`PW_CHROMIUM_PATH` permet de choisir un executable Chrome existant. Sur macOS 12,
la validation utilise Chrome for Testing 150.0.7871.124 en rendu logiciel
SwiftShader. Les captures de verification sont ecrites dans `test-results/` ;
ce ne sont pas des baselines de comparaison automatique.

## Docker : build de production

Prerequis : Docker Engine et le plugin Docker Compose.

```bash
docker compose up -d --build
docker compose ps
curl --fail http://localhost:4334/healthz
```

Ouvrir <http://localhost:4334/>. Le port 4334 evite le serveur de
developpement local (4333). Pour changer le port :

```bash
PORTAL_HTTP_PORT=8088 docker compose up -d --build
```

L'image utilise un build multi-etapes : Node.js 22 compile avec `npm ci`,
puis Nginx sert uniquement `dist/` sur le port interne 8080, sans utilisateur
root. Node.js et les sources ne sont pas dans l'image finale. Compose ajoute
un systeme de fichiers en lecture seule, un repertoire temporaire en memoire
et supprime les capabilities Linux. Les images de base sont des tags mobiles :
pour une livraison reproductible, les figer par digest dans votre processus
de publication et prevoir leur mise a jour.

```bash
docker compose logs --tail=100 portal-three
docker compose down
```

La verification `/healthz` controle le serveur HTTP, pas le fonctionnement
WebGL du navigateur. Aucun GPU n'est necessaire sur le serveur Docker :
le rendu 3D reste execute sur le poste du visiteur.

### Integration au portail existant

Le service peut etre joint par le proxy via `portal-three:8080` lorsqu'ils
partagent un reseau Docker. Le fichier Compose fourni reste autonome :
le nom du reseau, le domaine, les labels de proxy et le SSO du portail ne
sont pas connus et ne sont donc pas imposes ici. Dans une stack partagee,
adapter le reseau et retirer `ports` si aucun acces direct n'est necessaire.
Depuis un conteneur proxy, `localhost` ne designe pas ce service.

Par defaut le service est publie uniquement sur la boucle locale de l'hote.
`PORTAL_BIND_ADDRESS=0.0.0.0` permet une exposition externe si elle est
explicitement souhaitee ; prevoir alors les regles reseau appropriees.
Le HTTPS est a terminer au niveau du proxy du portail.

Pour un domaine dedie, conserver `VITE_BASE_PATH=/`. Pour un sous-chemin
tel que `https://portail.example/three/`, construire ainsi :

```bash
VITE_BASE_PATH=/three/ docker compose up -d --build
```

Cette valeur est injectee **au build**, avec un slash initial et final.
Elle configure les ressources Vite et le chargement du catalogue JSON.
Le proxy doit retirer le prefixe `/three/` avant de transmettre la requete
au conteneur. Exemple Nginx, a integrer au serveur HTTPS existant :

```nginx
location = /three {
    return 301 /three/;
}

location /three/ {
    proxy_pass http://portal-three:8080/;
}
```

Avec ce build, utiliser l'URL publique prefixee pour consulter l'application.
L'acces direct au conteneur sert toujours sa racine HTTP et `/healthz`,
mais ne fournit pas lui-meme le prefixe public.

Le catalogue fictif est embarque dans l'image. Aucun backend ni mecanisme
d'authentification n'est ajoute : la protection de cette route et du JSON
doit etre assuree par le portail avant d'y mettre des donnees internes.
Ne pas transmettre de secrets dans les arguments de build.

### Publier l'image dans votre registre

```bash
docker tag portal-three-poc:0.1.0 REGISTRE/PROJET/portal-three-poc:0.1.0
docker push REGISTRE/PROJET/portal-three-poc:0.1.0
```

Remplacer `REGISTRE/PROJET` par votre destination et s'authentifier aupres du
registre au prealable. Construire pour l'architecture du serveur cible
(par exemple `linux/amd64` ou `linux/arm64` avec Docker Buildx si necessaire).
Le tag ne change pas le chemin public : choisir celui-ci avant la construction.

## Explorer

- Souris gauche : orbite a 360 degres ; droite : deplacement ; molette : zoom.
- Selecteur et etiquettes de villes : rejoindre une ville.
- Recherche : nom/identifiant d'API, ville ou pole ; clic sur un resultat pour
  rejoindre le batiment et ouvrir sa fiche. Accessible au clavier par Tab/Entree.
- Double-clic : rejoindre un batiment ou un point du sol.
- Vol libre : autoriser la capture de souris par le navigateur ; WASD / ZQSD
  (positions physiques des touches), ou fleches ; E/Espace monter, C descendre,
  Maj accelerer, Echap liberer la souris et revenir en orbite.
- Retour : restaurer le cadrage precedent. Vue du monde : retrouver le catalogue.
- Clic batiment : fiche d'une seule API, sections presentation, fonctionnel,
  endpoints, consommateurs, contact, gouvernance. Relations : arcs bleus vers
  les dependances et oranges depuis les consommateurs de l'API selectionnee.
- Jour/nuit : modifier le ciel, l'eclairage et l'emission des facades.

## Donnees et rendu

Le jeu getAPIs fictif est repris du POC Angular : 25 entites, 153 poles,
1 500 API. Le JSON fournit uniquement des donnees metier ; les positions sont
calculees dans `layout.js`. Une ville par entite, un quartier par pole,
un batiment par API, un etage par endpoint (plus un socle).
Batiments de 5,2 unites de large, centres espaces de 20 unites lateralement
et de 24 unites entre rangees : 14,8 et 18,8 unites libres entre les facades.
Une couleur par entite, nuances par quartier.

### Cite habitee et panneaux

- Facades claires, vitrages, portes, auvents, socles et equipements de toiture.
- Rues marquees, trottoirs, plantations, arbres low-poly, bancs et lampadaires.
- Un panneau physique par API, sur deux pieds fixes au sol juste devant
  l'entree, decale sur le cote pour laisser la porte libre. Cadre, pieds et
  texte partagent la meme position 3D : aucune carte HTML flottante, aucun
  trait de liaison ni panneau qui pivote pour suivre la camera.
- Jusqu'a 48 faces nominatives proches sont texturees : nom complet de l'API,
  statut, nombre d'endpoints et conformite. Texte sur les deux faces, cliquable
  par raycasting comme le batiment. Le pool evite de creer 1 500 textures.
- Les panneaux ont une taille physique constante : la lecture demande de
  s'approcher, pas de grossissement artificiel qui recouvre les immeubles.
  La recherche et le bouton d'approche cadrent l'entree et son panneau de face.
- Les faces de panneaux respectent la profondeur 3D : un batiment peut masquer
  un panneau situe derriere lui. La recherche et les fiches restent disponibles.
- 459 petits developpeurs stylises (trois par quartier), avec sacs a dos et
  mouvements de bras/jambes. Ils parcourent les trottoirs proches de la camera.
  Les personnages lointains sont masques, les matrices animees a environ 20 Hz.
  Ils sont decoratifs : aucun lien avec des utilisateurs reels.
- Un bouton met les promenades en pause ; la preference reduced-motion est
  respectee (personnages immobiles).
- Mode jour par defaut. Choisir une ville cadre son premier quartier pour une
  arrivee exploitable ; le selecteur de quartier permet ensuite de se deplacer.
  Vue du monde conserve le panorama global.
- Les informations HTML detaillees apparaissent au survol ou dans la fiche,
  sans doubler les panneaux par des noms flottants sur les toits.

Three.js gere les vrais volumes, la perspective, la camera et le raycasting.
Les etages, toits, statuts et arbres utilisent InstancedMesh.
Les fenetres et panneaux sont des textures canvas locales, sans shaders maison.
Les labels HTML proches sont limites et espaces selon leur taille reelle.
Le toit dore signifie une conformite de 100 %, les grues une construction,
les fissures une conformite faible ; les pastilles indiquent les statuts.

## Limites explicites

- POC de cite uniquement : pas de nouvelle landing page ni de refonte de la
  mosaique/etagere/livre dans ce dossier.
- Le vol est libre, sans collisions avec les batiments ni simulation physique.
  Le sol impose une altitude minimale ; on peut monter, descendre et observer
  sous tous les angles en vol. En orbite la camera reste au-dessus du sol.
- WebGL2 est requis. Le navigateur integre VS Code a perdu son contexte WebGL
  pendant les essais ; ouvrir le lien dans Chrome si cela arrive. Une erreur
  explicite est affichee en cas de perte de contexte ou d'initialisation impossible.
- En cas de perte de contexte, la boucle de rendu est suspendue puis reprise si
  le navigateur restaure le contexte (parcours teste avec WEBGL_lose_context).
  Le rendu est aussi suspendu lorsque la page est masquee. Le DPR est plafonne
  a 1,5 et la preference GPU laissee au navigateur pour limiter la charge.
  Ces protections ne peuvent pas lever un blocage WebGL impose par le navigateur
  et ne prouvent pas que la cause initiale des pertes soit resolue.
- Eclairage reel et ombres de contact decoratives, mais pas d'ombres dynamiques,
  pour limiter le cout graphique. Les panneaux portent des couleurs constantes
  pour conserver leur lisibilite le jour comme la nuit.
- Pas de garantie de 60 images/s : mesurer sur les postes cibles. Le HUD affiche
  les appels GPU et l'altitude, pas un engagement de performance.
- Le contenu commercial detaille n'est pas invente : la fiche utilise les
  descriptions presentes dans le catalogue et indique ce qui reste a enrichir.
- La recherche constitue une alternative textuelle aux batiments, pas une
  certification d'accessibilite ou une liste exhaustive adaptee aux lecteurs d'ecran.
- Pas de backend, d'authentification ni de test d'API reel.
- Three.js est sous licence MIT ; la licence de publication du POC reste a choisir.
- Le build signale un chunk JavaScript > 500 ko ; ne pas masquer cet avertissement.
