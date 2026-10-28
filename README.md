# Galleri for to

Et lille 3D-spil i browseren: Man ankommer i limousine til en gallapremiere, går op ad den røde løber og rundt i et fornemt galleri med billeder i forskellige rammer. Undervejs er der champagne, sushi og kaffe, og til sidst åbner Hovedværket.

Galleriet kører direkte i browseren på mobil og computer. Der skal ikke installeres noget.

## Privatliv

Billeder, video og tekster ligger kun **krypteret** i repoet (AES-256-GCM med en nøgle, der er afledt af koden med PBKDF2). Koden ligger ikke i repoet. Uden koden kan man se selve bygningen, men ingen billeder eller tekster. Siden beder også søgemaskiner om ikke at indeksere den.

## Tilføj flere billeder

Kræver Python 3 med `Pillow` og `cryptography` samt `ffmpeg` til video.

```bash
GALLERY_CODE='koden' python3 tools/gallery.py add --src mappe_med_nye_billeder --room hall
```

- Dubletter springes automatisk over, også hvis billedet er skaleret, omkomprimeret eller beskåret en smule.
- `--room` kan være `foyer`, `hall`, `sushi`, `cafe` eller `auto` (salen med mest plads).
- Rediger titler og tekster: `export --out tekster.json`, ret filen og kør `import --inp tekster.json`. Slet den ukrypterede fil bagefter, og læg den aldrig i repoet.
- Tjek at alt kan dekrypteres: `GALLERY_CODE='koden' python3 tools/gallery.py verify`.

## Teknik

- [three.js](https://threejs.org) r170 (ligger i `vendor/`), skrifttyper fra Fontsource (SIL Open Font License) i `fonts/`.
- Alle teksturer (marmor, parket, sten osv.) og al lyd bliver genereret i browseren, så der er ingen eksterne filer.
- `js/world.js`: arkitektur og kollisioner. `js/frames.js`: rammer og placering af billeder. `js/exterior.js`: ankomsten. `js/props.js`: inventar. `js/main.js`: spillogik.
