# KaneClip

Éditeur vidéo multipiste pour Windows, largement inspiré de Vegas Pro : timeline à événements, fondus enchaînés automatiques, panoramique/recadrage avec images-clés, effets, titres, et rendu via ffmpeg (avec encodage GPU NVIDIA, Intel ou AMD).

## Fonctions

- **Timeline à la Vegas** : pistes vidéo et audio, événements avec fondus tirés aux coins, ligne de niveau (opacité / gain), découpe des bords, vitesse (Ctrl + glisser un bord), glissement du contenu (Alt), groupes vidéo + son, magnétisme, ondulation automatique, marqueurs, sélection temporelle et lecture en boucle.
- **Transitions** : fondu enchaîné, fondu au noir ou au blanc, glissements, poussées, zoom. Poser une transition entre deux clips bout à bout crée le chevauchement ; la durée est affichée et modifiable (double-clic).
- **Panoramique/Recadrage** : cadre « F » façon Vegas, rotation, zoom, images-clés avec interpolations, effet Ken Burns, déplacement direct dans l'aperçu.
- **Effets vidéo** : amélioration automatique des couleurs (niveaux, balance des blancs, vibrance), luminosité/contraste, niveaux, correcteur et balance des couleurs, noir et blanc, sépia, flou, netteté, lueur, vignette, pixelisation, grain, miroir, rognage, incrustation chromatique.
- **Effets audio de piste** : égaliseur 3 bandes, compresseur, écho, passe-haut, passe-bas ; normalisation des événements.
- **Titres et générateurs** : textes animés, bandeaux, couleurs unies, dégradés, damiers.
- **Rendu** : MP4 H.264 / HEVC / AV1, ProRes, WebM, GIF, MP3, AAC, WAV, FLAC ; modèles de 480p à 4K, vertical et carré ; agrandissement GPU (libplacebo + CAS) avec débruitage optionnel.
- **Agrandissement par IA** : Real-ESRGAN (téléchargé à la demande), traitement par blocs sur la carte graphique, remplacement automatique du média dans le projet.
- **Proxys intelligents** : copies d'édition 720p créées automatiquement pour les vidéos lourdes ou lentes à parcourir ; le rendu utilise toujours l'original.
- Mises à jour automatiques depuis les releases GitHub.

## Installation

Téléchargez `KaneClip-Setup-x.y.z.exe` dans la dernière [release](https://github.com/Kaynegiordano/KaneClip/releases/latest). ffmpeg est inclus.

## Développement

```bat
npm install
node node_modules/electron/install.js
npm start
```

Sans build : `app/` contient des scripts classiques partageant l'espace de noms `KC`. ffmpeg est cherché dans `bin\ffmpeg.exe`, puis dans winget et le PATH.

Publier une version : augmenter `version` dans `package.json`, mettre à jour `RELEASE_NOTES.md`, puis lancer `Publier une version.cmd` (le fichier `latest.yml` est requis pour les mises à jour).

## Licences

ffmpeg est distribué sous licence GPL (voir `LICENSE-ffmpeg.txt` dans le dossier d'installation). Real-ESRGAN (BSD-3) est téléchargé séparément à la demande. Police Outfit sous licence OFL.
