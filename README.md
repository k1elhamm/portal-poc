# PORTAL — POC du catalogue d'API

Prototype d'un portail de catalogue d'API, avec deux vues qu'on peut basculer à tout moment :

- **Mosaïque** : chaque entité est une mosaïque, chaque pôle une étagère, chaque API un livre.
- **Cité** : chaque entité est une ville, chaque pôle un quartier, chaque API un immeuble.
  - Hauteur de l'immeuble = nombre d'endpoints.
  - État de l'immeuble = conformité à la gouvernance (hôtel de luxe à 100 %).
  - Picto au-dessus du toit = statut (production, construction, dépréciée).
  - Mode réseau (eau ou métro) pour voir les relations entre API.

> ⚠️ Toutes les données sont **fictives** : elles sont générées dans la page, avec une graine fixe, pour 25 entités, 153 pôles et 1 500 API. Elles ne reflètent aucun système réel.

## Lancer le POC

Un seul fichier, sans installation ni serveur : ouvrir [`index.html`](index.html) dans Chrome, Edge ou Firefox.

## Navigation

L'adresse de la page reflète l'écran affiché, par exemple :

- `#/mosaique`
- `#/cite`
- `#/cite/e:bpcesi`, pour la ville BPCE SI en 3D

## Statut

POC de cadrage, qui sert de référence visuelle pour le futur projet Angular. Ce n'est pas du code de production.
