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
npm run test:journey
```

`PW_CHROMIUM_PATH` permet de choisir un executable Chrome existant. Sur macOS 12,
la validation utilise Chrome for Testing 150.0.7871.124 en rendu logiciel
SwiftShader. Les captures de verification sont ecrites dans `test-results/` ;
ce ne sont pas des baselines de comparaison automatique.
`POC_URL=http://localhost:4335 npm run test:browser` permet de tester un serveur
demarre sur un autre port.
`test:journey` cible le parcours guide, les endpoints 3D, la copie, le simulateur
local, les liens directs et les retours de navigation en desktop et mobile.

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
- Recherche : capacite, description, endpoint, nom/identifiant d'API, ville ou pole ;
  filtres combines par domaine, statut et entite. Clic sur un resultat pour
  rejoindre le batiment et ouvrir sa fiche. Accessible au clavier par Tab/Entree.
  Chaque resultat propose aussi **Me guider vers...** : cadrage de la facade
  sans ouvrir la fiche. **Revoir les resultats** retrouve la recherche conservee.
- Double-clic : rejoindre un batiment ou un point du sol.
- Vol libre : autoriser la capture de souris par le navigateur ; WASD / ZQSD
  (positions physiques des touches), ou fleches ; E/Espace monter, C descendre,
  Maj accelerer, Echap liberer la souris et revenir en orbite.
- Retour : restaurer le cadrage precedent. Vue du monde : retrouver le catalogue.
- Clic batiment : cadrer sa facade technique sans ouvrir de fiche.
  Le cartouche **Vous explorez** propose l'interphone et la fiche
  standard. La recherche garde son acces direct a la fiche ; le bouton
  **Rejoindre ce batiment** revient a la lecture spatiale.
- La fiche conserve les six onglets d'origine : Presentation, Fonctionnel,
  Endpoints, Consommateurs, Contact et Gouvernance. Les onglets Premier appel,
  Acces, Fiabilite et Relations et le bloc de raccourcis ont ete retires.
  La presentation reste courte ; le simulateur local demeure dans Endpoints.
  **Qui appelle qui ?** est disponible dans Consommateurs et sur la facade.
- La barre **Observer** et ses cinq modes ont ete supprimes, ainsi que son
  panneau explicatif. L'espace libere est rendu a la cite et aux fiches.
  Les anciens liens contenant `mode` restent compatibles.
- Survol d'un bandeau d'endpoint : mise en evidence de son etage. Clic, ou
  selecteur **Explorer un endpoint** : cadrage de l'etage et actions compactes
  pour copier le chemin ou simuler localement. Les parametres de chemin sont
  extraits du catalogue ; leurs types, contraintes et schemas ne sont pas inventes.
  Le changement d'endpoint dans le simulateur suit aussi l'etage et le lien.
  Echap ou **Revoir tout le batiment** retrouve la facade complete.
- Fil d'Ariane **Cite / ville / quartier**, retour au quartier et API precedente /
  suivante : navigation sans fiche. Les voisines sont limitees au meme quartier
  et aux filtres actifs ; une annonce signale l'absence d'autre resultat.
  Sur mobile, les actions d'endpoint remplacent les controles du batiment dans
  un panneau inferieur pour laisser une partie de la facade visible.
- Clic sur l'interphone physique ou **Interphone - Equipe & contact** : cadrer
  le rez-de-chaussee sans quitter la cite et afficher des coordonnees
  selectionnables. Fermer ou Echap retrouve le cadrage de facade precedent.
  Les coordonnees peuvent etre copiees, jamais appelees automatiquement
  dans ce catalogue fictif. Aucun accueil interieur ni scene supplementaire.
- **Qui appelle qui ?**, depuis la facade ou l'onglet Consommateurs :
  vue dediee des relations directes. Consommateurs
  a gauche, API centrale au milieu, fournisseurs a droite. Survol, focus clavier
  ou clic sur un nom isole une seule liaison dirigee et affiche la phrase
  « A appelle B », la provenance et le volume fictif si renseigne.
  Six voisins par page et par cote, sans tronquer la liste ; identifiants et
  quartiers distinguent les noms identiques. Les filtres ne masquent pas les
  voisins. Une destination absente est signalee, sans lien d'exploration.
  On peut prendre un voisin comme nouveau centre ou le retrouver dans la cite.
  Si ce voisin est exclu par les filtres, le retour a son batiment reinitialise
  les filtres incompatibles avec une annonce, pour ne pas cadrer une facade vide.
  Echap ou **Revenir a la cite** ferme la vue sans deplacer la camera.
  Sur mobile, les groupes sont empiles et le sens de l'appel reste textuel.
  Les conduites aeriennes et impulsions ont ete supprimees.
- Jour/nuit : modifier le ciel, l'eclairage et l'emission des facades.
- Le lien partage conserve API, onglet, mode et ville, ainsi que la lecture
  de facade (`view=facade`) et l'index d'endpoint (`endpoint`, a partir de zero).
  Un endpoint absent est signale et revient a la facade. Il ne conserve pas les filtres,
  le cadrage libre ni le choix d'impact indirect.

### Lire les donnees dans l'architecture 3D

La cite s'ouvre en decouverte, sans selecteur de mode. La couleur de conformite
reste stable. Les lectures Usage, Gouvernance et Cycle de vie ci-dessous restent
compatibles avec les anciens liens `mode`, sans barre de commandes :

| Mode | Objet 3D | Information representee |
| --- | --- | --- |
| Decouverte | Prises colorees sur le cote des facades | Un port par endpoint ; GET bleu, POST vert, PUT ambre, PATCH violet, DELETE rose |
| Proximite, tous modes | Bandeaux integres a la facade | Methode, resume et chemin de chaque endpoint, au niveau de son etage ; aucune fiche requise |
| Proximite, tous modes | Portique et bandeau de services au rez-de-chaussee | Capacites decrites par les endpoints, sans liste supplementaire a ouvrir |
| Proximite, tous modes | Interphone et plaque de contact a gauche de l'entree | Equipe, telephone et canal du catalogue fictif ; clic pour noms, emails et copie |
| Usage | Colonnes lumineuses au pied des batiments | Appels/jour : hauteur de 0 a 12 unites, echelle logarithmique commune au catalogue |
| Tous modes / Gouvernance | Couleur de tout le batiment, toit compris | Vert : 100 % ; orange : 60-99 % ; rouge : moins de 60 % ; gris : score inconnu ou invalide |
| Cycle de vie | Totems empiles a l'entree des quartiers | Nombre d'API par statut : 0,65 unite par API ; production verte, construction ambre, depreciation grise |
| Dependances | Vue dediee nommee, sans tuyaux dans la cite | Consommateurs et fournisseurs directs ; une seule liaison mise en evidence |

Les totems sont visibles a moins de 650 unites ; les informations detaillees
sont limitees a un seul batiment a moins de 65 unites, dans la direction du
regard. La selection est prioritaire ; sinon le batiment deja actif reste
prioritaire tant qu'il est eligible, pour eviter les changements intempestifs
entre voisins. Le survol n'est pas necessaire. Les ports et colonnes utilisent
des geometries instancees. Les textures techniques ne sont creees que pour
le batiment actif et sont liberees a son changement. Les panneaux nominatifs
sur deux pieds devant les entrees restent fixes et inchanges dans leur principe.
Une API explicitement selectionnee garde sa facade, ses endpoints et son
interphone meme si elle ne correspond pas aux filtres de recherche restants.
Les filtres limitent les resultats et la proximite non selectionnee, pas les
informations du batiment ouvert. Les limites de distance et de direction du
regard continuent de s'appliquer pour ne pas afficher des facades lointaines.
Les lampadaires sont places derriere le plan des endpoints ; les bandeaux
techniques commencent au-dessus du rez-de-chaussee pour laisser libre l'entree.
Le contact est integre au rez-de-chaussee, a gauche de la porte, hors de
l'emprise du panneau nominatif. L'accueil interieur a ete ecarte : la
consultation reste dans la cite. La fiche HTML reste une alternative aux
informations 3D, pas un passage obligatoire.
L'interphone est un boitier metallique en relief : grille de haut-parleur,
vis, etiquette claire et bouton circulaire avec anneau lumineux. Son etiquette
1024 x 512 conserve son rapport 2:1 dans la scene, sans compression horizontale
du texte. Le cadrage de contact se place presque de face, a courte distance ;
les noms longs passent a la ligne. Les coordonnees completes restent
selectionnables et copiables dans le volet HTML.

Toutes les valeurs proviennent du catalogue fictif. Un score de conformite
n'est pas un indicateur de disponibilite. Les informations absentes (scopes,
regles d'acces, OpenAPI, sandbox reelle, incidents, periode de mesure) sont
signalees comme absentes. L'atelier d'endpoints est une simulation locale :
il n'envoie aucune requete API et ses exemples utilisent un domaine `.invalid`.

## Donnees et rendu

Le jeu getAPIs fictif est repris du POC Angular : 25 entites, 153 poles,
1 500 API. Le JSON fournit uniquement des donnees metier ; les positions sont
calculees dans `layout.js`. Une ville par entite, un quartier par pole,
un batiment par API, un etage par endpoint et un rez-de-chaussee agrandi.
Batiments de 5,2 unites de large, centres espaces de 28 unites lateralement
et de 34 unites entre rangees : 22,8 et 28,8 unites libres entre les facades.
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
- Un bouton met les animations en pause ; la preference reduced-motion est
  respectee (personnages et impulsions immobiles).
- Mode nuit par defaut. Choisir une ville cadre son premier quartier pour une
  arrivee exploitable ; le selecteur de quartier permet ensuite de se deplacer.
  Vue du monde conserve le panorama global.
- Les informations HTML detaillees apparaissent au survol ou dans la fiche,
  sans doubler les panneaux par des noms flottants sur les toits.

Three.js gere les vrais volumes, la perspective, la camera et le raycasting.
Les etages, toits et arbres utilisent InstancedMesh.
Les fenetres et panneaux sont des textures canvas locales, sans shaders maison.
Les labels HTML proches sont limites et espaces selon leur taille reelle.
En lecture rapprochee d'un batiment (facade, endpoint ou interphone), les
etiquettes flottantes de villes et de quartiers sont masquees, meme celles
situees derriere lui : elles ne decrivent pas l'API en cours. Le panneau
physique et le fil d'Ariane conservent son contexte exact. Les etiquettes de
navigation reapparaissent en reprenant du recul ou en revenant a la vue du monde.
Tous les batiments ont la meme forme reguliere, sans couronne, fleche,
pastille, grue, fissure ni equipement decoratif de toiture. La hauteur
continue de representer le nombre d'endpoints ; seule la couleur indique
la conformite. Vert : exactement 100 %, orange : 60 a moins de 100 %,
rouge : de 0 a moins de 60 %, gris : score absent ou hors de [0, 100].
La legende reste visible. La selection utilise un contour et un anneau au sol,
sans recolorer le batiment. Les autres modes ne remplacent pas cette couleur ;
les filtres peuvent assombrir les API exclues. Le statut reste disponible dans
la fiche et le mode Cycle de vie. Cette convention ne represente ni la sante
operationnelle, ni la securite d'une API.

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
