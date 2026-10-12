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

## Lecture et sélection temporelle

La barre au-dessus de la timeline propose lecture/pause, arrêt avec retour au départ, début/fin du projet, image précédente/suivante, position de lecture, vitesse et son de l’aperçu.

- Clic droit sur un clip, une zone vide, les en-têtes ou la règle : insérer une piste vidéo ou audio.
- Glisser directement dans la bande **au-dessus des pistes** : la plage se crée et la boucle est activée au relâchement. Glisser les poignées pour régler les bornes ; Alt+glisser déplace la plage. Un nouveau glissement dans la bande remplace la plage précédente. Double-clic dans la bande : lire en boucle le clip situé à ce temps. Le bouton **Sélection** et les bornes **I/O** restent disponibles. **Q** active/désactive la boucle ; la flèche circulaire efface la sélection.
- Glisser le curseur dans la règle, saisir la ligne de lecture dans la timeline, ou glisser la barre de position pour voir les images correspondantes. La lecture reprend après relâchement si elle était en cours.

Vérification fonctionnelle : installer Playwright (`npm install --no-save playwright`, puis `npx playwright install chromium`) et exécuter `node tests/playback.cjs`. Le test utilise un navigateur isolé et une vidéo synthétique pour vérifier les menus, la sélection, la boucle et le décodage après plusieurs recherches rapides. `KANECLIP_TEST_BROWSER` peut désigner un exécutable Chromium existant.

Vérification native : `node tests/native-playback.cjs` avec Playwright et `bin/ffmpeg.exe`. Ce test lance Electron dans un profil isolé, importe des fichiers MP4/H.264, MKV/H.264 et WebM/VP9 par le protocole local, puis vérifie l’image avant relâchement lors du déplacement de la barre, de la règle et de la ligne de lecture. Il couvre aussi la sélection directe, ses poignées, le remplacement de plage, la dernière image et la reprise de lecture. `KANECLIP_TEST_APP` permet de vérifier une application empaquetée.
