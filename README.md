# Galleri for to

Et lille 3D-spil i browseren: Man ankommer i limousine til en gallapremiere, går op ad den røde løber og rundt i et fornemt galleri med billeder i forskellige rammer. Der er en salon med pejs og flygel, en spa med pool og sauna, en sushibar, en café og en romersk marmorstatue. Undervejs er der champagne, sushi, kaffe og et besøg i spaen, og til sidst trækker man tæppet af Hovedværket under fyrværkeri.

Galleriet kører direkte i browseren på mobil og computer. Der skal ikke installeres noget. Spillet starter forfra, hver gang koden tastes.

## Privatliv

Billeder, video, tekster og statuens ansigt ligger kun **krypteret** i repoet (AES-256-GCM med en nøgle, der er afledt af koden med PBKDF2). Koden ligger ikke i repoet. Uden koden kan man se selve bygningen, men ingen billeder, tekster eller ansigter. Siden beder også søgemaskiner om ikke at indeksere den.

## Tilføj flere billeder

Kræver Python 3 med `Pillow` og `cryptography` samt `ffmpeg` til video.

```bash
GALLERY_CODE='koden' python3 tools/gallery.py add --src mappe_med_nye_billeder --room hall
```

- Dubletter springes automatisk over, også hvis billedet er skaleret, omkomprimeret eller beskåret en smule.
- `--room` kan være `foyer`, `salon`, `spa`, `hall`, `sushi`, `cafe` eller `auto`.
- Rediger titler og tekster: `export --out tekster.json`, ret filen og kør `import --inp tekster.json`. Slet den ukrypterede fil bagefter, og læg den aldrig i repoet.
- Tjek at alt kan dekrypteres: `GALLERY_CODE='koden' python3 tools/gallery.py verify`.

## Statuen

- `tools/statue_face.py` laver et 3D-ansigt ud fra et foto med MediaPipe Face Landmarker. Resultatet krypteres af `gallery.py` (feltet `statue` i kataloget).
- `tools/statue_body.py` bygger krop og drage som et signed distance field og trækker overfladen ud med marching cubes (`assets/statue/body.bin`, ingen personlige data).

## Teknik

- [three.js](https://threejs.org) r170 (ligger i `vendor/`), skrifttyper fra Fontsource (SIL Open Font License) i `fonts/`.
- Alle teksturer (marmor, parket, sten osv.) og al lyd bliver genereret i browseren.
- `js/world.js`: arkitektur og kollisioner. `js/frames.js`: rammer og placering af billeder. `js/exterior.js`: ankomsten. `js/props.js`: inventar. `js/wings.js`: salon og spa. `js/statue.js`: statuen. `js/unveil.js`: tæppe, fyrværkeri og konfetti. `js/main.js`: spillogik.
