#!/usr/bin/env python3
"""Byg og vedligehold det krypterede indhold til Galleri for to.

Billeder, video og tekster krypteres med AES-256-GCM. Nøglen udledes af
adgangskoden med PBKDF2-SHA256. Adgangskoden læses fra miljøvariablen
GALLERY_CODE og gemmes aldrig på disk eller i repoet.

Kommandoer:
  build   Byg alt fra et katalog (JSON) og en mappe med originaler.
  add     Tilføj nye billeder til et eksisterende galleri. Dubletter springes over.
  export  Dekryptér manifestet til en JSON-fil, så teksterne kan redigeres.
  import  Kryptér en redigeret JSON-fil tilbage som manifest.
  verify  Tjek at koden virker, og at alle filer kan dekrypteres.

Eksempel:
  GALLERY_CODE='...' python3 tools/gallery.py add --src ~/nye_billeder --room hall
"""
import argparse
import base64
import hashlib
import hmac
import io
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageCms, ImageOps
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parent.parent
ENC = ROOT / "assets" / "enc"
META = ENC / "meta.json"
MANIFEST = ENC / "manifest.bin"

ITERATIONS = 600_000
TEX_SIZE = 1024      # teksturer i 3D-galleriet
FULL_SIZE = 2048     # fuld visning i lightbox
DUP_THRESHOLD = 20   # dHash: max antal forskellige bits (af 256) før to billeder regnes for dubletter
PHASH_THRESHOLD = 10 # pHash: max forskellige bits (af 64). Målt: dubletter <= 4, forskellige billeder >= 20
ROOMS = ("foyer", "hall", "sushi", "cafe", "final")
STYLES = ("gold", "black", "oak", "white", "canvas", "oval", "polaroid", "lightbox", "easel", "masterpiece", "auto")


def normalize(code: str) -> str:
    """Samme normalisering som i browseren: små bogstaver, mellemrum/bindestreg = understreg."""
    return re.sub(r"[\s_\-]+", "_", code.strip().lower())


def get_code() -> str:
    code = os.environ.get("GALLERY_CODE", "")
    if not code:
        sys.exit("Sæt miljøvariablen GALLERY_CODE til galleriets kode.")
    return normalize(code)


def load_meta(create: bool = False) -> dict:
    if META.exists():
        return json.loads(META.read_text())
    if not create:
        sys.exit("assets/enc/meta.json findes ikke. Kør 'build' først.")
    meta = {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITERATIONS,
            "salt": base64.b64encode(os.urandom(16)).decode()}
    ENC.mkdir(parents=True, exist_ok=True)
    META.write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def derive_key(code: str, meta: dict) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                     salt=base64.b64decode(meta["salt"]), iterations=meta["iter"])
    return kdf.derive(code.encode("utf-8"))


def encrypt(key: bytes, data: bytes) -> bytes:
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, data, None)


def decrypt(key: bytes, blob: bytes) -> bytes:
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)


def file_id(key: bytes, digest: str, kind: str) -> str:
    """Filnavn der ikke afslører indholdet (HMAC med nøglen)."""
    return hmac.new(key, f"{digest}:{kind}".encode(), hashlib.sha256).hexdigest()[:24] + ".bin"


def dhash(img: Image.Image, size: int = 16) -> str:
    g = img.convert("L").resize((size + 1, size), Image.LANCZOS)
    px = g.load()
    bits = 0
    for y in range(size):
        for x in range(size):
            bits = (bits << 1) | (1 if px[x, y] > px[x + 1, y] else 0)
    return f"{bits:0{size * size // 4}x}"


def phash(img: Image.Image) -> str:
    """DCT-baseret perceptuel hash (64 bit). Tåler omkomprimering, skalering og små beskæringer."""
    n = 32
    g = img.convert("L").resize((n, n), Image.LANCZOS)
    px = [[g.getpixel((x, y)) for x in range(n)] for y in range(n)]
    cos = [[math.cos((2 * x + 1) * u * math.pi / (2 * n)) for x in range(n)] for u in range(8)]
    coeffs = []
    for u in range(8):
        for v in range(8):
            coeffs.append(sum(cos[u][y] * sum(px[y][x] * cos[v][x] for x in range(n)) for y in range(n)))
    med = sorted(coeffs[1:])[len(coeffs[1:]) // 2]
    bits = 0
    for c in coeffs:
        bits = (bits << 1) | (1 if c > med else 0)
    return f"{bits:016x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


SRGB = ImageCms.createProfile("sRGB")


def open_srgb(path: Path) -> Image.Image:
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    icc = img.info.get("icc_profile")
    if icc:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            img = ImageCms.profileToProfile(img.convert("RGB"), src, SRGB, outputMode="RGB")
        except Exception:
            img = img.convert("RGB")
    return img.convert("RGB")


def jpeg_bytes(img: Image.Image, long_side: int, quality: int) -> tuple[bytes, int, int]:
    im = img.copy()
    im.thumbnail((long_side, long_side), Image.LANCZOS)
    buf = io.BytesIO()
    # Ingen exif/icc gemmes: metadata (fx GPS) fjernes.
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue(), im.width, im.height


def avg_color(img: Image.Image) -> str:
    r, g, b = img.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def write_enc(key: bytes, name: str, data: bytes) -> None:
    path = ENC / name
    if not path.exists():  # samme indhold giver samme navn, så uændrede filer røres ikke
        path.write_bytes(encrypt(key, data))


def process_photo(key: bytes, path: Path, entry: dict) -> dict:
    raw = path.read_bytes()
    md5 = hashlib.md5(raw).hexdigest()
    img = open_srgb(path)
    tex, tw, th = jpeg_bytes(img, TEX_SIZE, 82)
    full, fw, fh = jpeg_bytes(img, FULL_SIZE, 86)
    t_name, f_name = file_id(key, md5, "t"), file_id(key, md5, "f")
    write_enc(key, t_name, tex)
    write_enc(key, f_name, full)
    out = {k: v for k, v in entry.items() if k != "src"}
    out.update({"id": file_id(key, md5, "id")[:12], "t": t_name, "f": f_name,
                "w": fw, "h": fh, "color": avg_color(img), "dhash": dhash(img), "phash": phash(img), "md5": md5})
    out.setdefault("room", "auto")
    out.setdefault("style", "auto")
    out.setdefault("title", "Uden titel")
    out.setdefault("sub", "")
    out.setdefault("desc", "")
    return out


def process_video(key: bytes, path: Path, entry: dict) -> dict:
    raw = path.read_bytes()
    md5 = hashlib.md5(raw).hexdigest()
    with tempfile.TemporaryDirectory() as tmp:
        mp4 = Path(tmp) / "v.mp4"
        poster = Path(tmp) / "p.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-map_metadata", "-1",
                        "-vf", "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)',format=yuv420p",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-profile:v", "main",
                        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(mp4)], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.3", "-i", str(mp4), "-frames:v", "1",
                        "-q:v", "3", str(poster)], check=True)
        probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                "stream=width,height", "-of", "csv=p=0", str(mp4)],
                               check=True, capture_output=True, text=True).stdout.strip().split(",")
        v_name, p_name = file_id(key, md5, "v"), file_id(key, md5, "p")
        write_enc(key, v_name, mp4.read_bytes())
        write_enc(key, p_name, poster.read_bytes())
    out = {k: v for k, v in entry.items() if k != "src"}
    out.update({"file": v_name, "poster": p_name, "w": int(probe[0]), "h": int(probe[1]), "md5": md5})
    return out


def is_duplicate(photo: dict, existing: list[dict]) -> dict | None:
    for e in existing:
        if e["md5"] == photo["md5"] or hamming(e["dhash"], photo["dhash"]) <= DUP_THRESHOLD:
            return e
        if e.get("phash") and photo.get("phash") and hamming(e["phash"], photo["phash"]) <= PHASH_THRESHOLD:
            return e
    return None


def backfill_hashes(key: bytes, manifest: dict) -> None:
    """Ældre manifester mangler pHash: beregn den ud fra det krypterede billede."""
    for p in manifest["photos"]:
        if not p.get("phash"):
            img = Image.open(io.BytesIO(decrypt(key, (ENC / p["f"]).read_bytes())))
            p["phash"] = phash(img)


def save_manifest(key: bytes, manifest: dict) -> None:
    for p in manifest["photos"]:
        if p["room"] not in ROOMS + ("auto",):
            sys.exit(f"Ukendt sal '{p['room']}' for {p.get('title')}")
        if p["style"] not in STYLES:
            sys.exit(f"Ukendt rammestil '{p['style']}' for {p.get('title')}")
    data = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    MANIFEST.write_bytes(encrypt(key, data))


def load_manifest(key: bytes) -> dict:
    try:
        return json.loads(decrypt(key, MANIFEST.read_bytes()))
    except Exception:
        sys.exit("Kunne ikke dekryptere manifestet. Er koden rigtig?")


def prune_unused(manifest: dict) -> int:
    used = {"manifest.bin", "meta.json"}
    for p in manifest["photos"]:
        used |= {p["t"], p["f"]}
    if manifest.get("video"):
        used |= {manifest["video"]["file"], manifest["video"]["poster"]}
    removed = 0
    for f in ENC.iterdir():
        if f.name not in used:
            f.unlink()
            removed += 1
    return removed


def cmd_build(args) -> None:
    code = get_code()
    meta = load_meta(create=True)
    key = derive_key(code, meta)
    catalog = json.loads(Path(args.catalog).read_text())
    src = Path(args.src)
    photos: list[dict] = []
    for entry in catalog["photos"]:
        p = process_photo(key, src / entry["src"], entry)
        dup = is_duplicate(p, photos)
        if dup:
            print(f"  Dublet sprunget over: {entry['src']} (ligner '{dup['title']}')")
            continue
        photos.append(p)
        print(f"  {len(photos):2d}. {p['title']}")
    manifest = {k: v for k, v in catalog.items() if k not in ("photos", "video")}
    manifest["photos"] = photos
    if catalog.get("video"):
        manifest["video"] = process_video(key, Path(args.video_dir) / catalog["video"]["src"], catalog["video"])
    save_manifest(key, manifest)
    removed = prune_unused(manifest)
    print(f"Færdig: {len(photos)} billeder, video: {'ja' if manifest.get('video') else 'nej'}, "
          f"fjernede {removed} ubrugte filer.")


def cmd_add(args) -> None:
    code = get_code()
    key = derive_key(code, load_meta())
    manifest = load_manifest(key)
    backfill_hashes(key, manifest)
    files = sorted(f for f in Path(args.src).iterdir()
                   if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".heic"))
    added = skipped = 0
    for f in files:
        p = process_photo(key, f, {"src": f.name, "room": args.room, "style": "auto"})
        dup = is_duplicate(p, manifest["photos"])
        if dup:
            print(f"  Dublet sprunget over: {f.name} (ligner '{dup['title']}')")
            skipped += 1
            continue
        manifest["photos"].append(p)
        added += 1
        print(f"  Tilføjet: {f.name} -> sal '{args.room}'")
    save_manifest(key, manifest)
    prune_unused(manifest)
    print(f"Færdig: {added} tilføjet, {skipped} dubletter. I alt {len(manifest['photos'])} billeder.")


def cmd_export(args) -> None:
    key = derive_key(get_code(), load_meta())
    Path(args.out).write_text(json.dumps(load_manifest(key), ensure_ascii=False, indent=2) + "\n")
    print(f"Manifest skrevet til {args.out}. Husk: filen er ukrypteret, så læg den ikke i repoet.")


def cmd_import(args) -> None:
    key = derive_key(get_code(), load_meta())
    manifest = json.loads(Path(args.inp).read_text())
    save_manifest(key, manifest)
    print(f"Manifest krypteret ({len(manifest['photos'])} billeder).")


def cmd_verify(args) -> None:
    key = derive_key(get_code(), load_meta())
    manifest = load_manifest(key)
    names = [n for p in manifest["photos"] for n in (p["t"], p["f"])]
    if manifest.get("video"):
        names += [manifest["video"]["file"], manifest["video"]["poster"]]
    for n in names:
        data = decrypt(key, (ENC / n).read_bytes())
        assert len(data) > 1000, n
    ph = manifest["photos"]
    dups = [(i, j) for i in range(len(ph)) for j in range(i + 1, len(ph))
            if is_duplicate(ph[j], [ph[i]])]
    print(f"OK: {len(manifest['photos'])} billeder, {len(names)} filer dekrypteret, dubletter: {len(dups)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--catalog", required=True)
    b.add_argument("--src", required=True)
    b.add_argument("--video-dir", default=".")
    a = sub.add_parser("add")
    a.add_argument("--src", required=True)
    a.add_argument("--room", default="auto", choices=ROOMS + ("auto",))
    e = sub.add_parser("export")
    e.add_argument("--out", required=True)
    i = sub.add_parser("import")
    i.add_argument("--inp", required=True)
    sub.add_parser("verify")
    args = ap.parse_args()
    {"build": cmd_build, "add": cmd_add, "export": cmd_export,
     "import": cmd_import, "verify": cmd_verify}[args.cmd](args)


if __name__ == "__main__":
    main()
