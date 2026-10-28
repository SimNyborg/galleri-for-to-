#!/usr/bin/env python3
"""Lav et 3D-ansigt til marmorstatuen ud fra et foto.

Bruger MediaPipe Face Landmarker (478 punkter i 3D) til ansigtets form, retter
ansigtet op, så det ser lige frem, og laver en marmorfarvet tekstur af fotoet.
Resultatet (face.json og face.jpg) krypteres derefter af gallery.py, så ansigtet
kun kan ses med koden. Ingen ukrypterede filer må lægges i repoet.

Eksempel:
  python3 tools/statue_face.py --photo foto.jpg --pick-x 0.39 \
      --model face_landmarker.task --out privat_mappe/
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageDraw
from scipy.ndimage import distance_transform_edt
from scipy.spatial import Delaunay

FOREHEAD, CHIN, NOSE_TIP = 10, 152, 1
R_EYE_OUT, L_EYE_OUT = 33, 263
R_IRIS, L_IRIS = 468, 473
R_CHEEK, L_CHEEK = 234, 454
FACE_HEIGHT_M = 0.235   # afstand pande-hage på statuen (heroisk skala)
TEX = 768


def detect(photo: Path, model: Path, pick_x: float):
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    img = ImageOps.exif_transpose(Image.open(photo)).convert("RGB")
    opts = vision.FaceLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=str(model)), num_faces=6)
    det = vision.FaceLandmarker.create_from_options(opts)
    res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(img)))
    if not res.face_landmarks:
        raise SystemExit("Fandt intet ansigt i fotoet.")
    faces = [np.array([[p.x, p.y, p.z] for p in lm]) for lm in res.face_landmarks]
    face = min(faces, key=lambda f: abs(f[:, 0].mean() - pick_x))
    return img, face


def build(img: Image.Image, lm: np.ndarray):
    W, H = img.size
    # Pixelkoordinater (isotrope) med y op og z mod kameraet.
    P = np.stack([lm[:, 0] * W, -lm[:, 1] * H, -lm[:, 2] * W], axis=1)
    # Ret ansigtet op: x fra højre til venstre øje, y fra hage til pande.
    x = P[L_EYE_OUT] - P[R_EYE_OUT]
    x /= np.linalg.norm(x)
    up = P[FOREHEAD] - P[CHIN]
    up -= up.dot(x) * x
    up /= np.linalg.norm(up)
    z = np.cross(x, up)
    R = np.stack([x, up, z])
    center = P[:468].mean(axis=0)
    Q = (P - center) @ R.T
    s = FACE_HEIGHT_M / np.linalg.norm(Q[FOREHEAD] - Q[CHIN])
    Q *= s

    # Triangulering af de 468 overfladepunkter (øjne og mund lukkes, som på en statue).
    pts = Q[:468]
    tri = Delaunay(pts[:, :2])
    tris = tri.simplices.copy()
    # Fjern lange, tynde trekanter langs kanten.
    edge = lambda a, b: np.linalg.norm(pts[a, :2] - pts[b, :2], axis=1)
    longest = np.maximum.reduce([edge(tris[:, 0], tris[:, 1]), edge(tris[:, 1], tris[:, 2]), edge(tris[:, 2], tris[:, 0])])
    tris = tris[longest < np.median(longest) * 3.2]
    # Ensret omløbsretning (normal mod +z).
    a, b, c = pts[tris[:, 0], :2], pts[tris[:, 1], :2], pts[tris[:, 2], :2]
    cross = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    tris[cross < 0] = tris[cross < 0][:, [0, 2, 1]]

    # Kantløkke (kanter der kun bruges af én trekant).
    from collections import Counter, defaultdict
    cnt = Counter()
    for t in tris:
        for i in range(3):
            e = tuple(sorted((t[i], t[(i + 1) % 3])))
            cnt[e] += 1
    bedges = [e for e, n in cnt.items() if n == 1]
    nbr = defaultdict(list)
    for a_, b_ in bedges:
        nbr[a_].append(b_)
        nbr[b_].append(a_)
    start = bedges[0][0]
    loop = [start]
    prev = None
    while True:
        nxt = [n for n in nbr[loop[-1]] if n != prev]
        if not nxt or nxt[0] == start:
            break
        prev = loop[-1]
        loop.append(nxt[0])

    # Hovedets ellipsoide, så alle ansigtspunkter ligger foran den.
    face_w = np.linalg.norm(pts[L_CHEEK, :2] - pts[R_CHEEK, :2])
    d = np.linalg.norm(pts[FOREHEAD] - pts[CHIN])
    rx = 0.56 * face_w * 1.06
    ry = 0.66 * d
    rz = 0.62 * d
    cy = pts[CHIN, 1] + ry * 0.97
    cz = pts[FOREHEAD, 2] - rz

    def surf_z(xx, yy, cz_):
        k = 1 - (xx / rx) ** 2 - ((yy - cy) / ry) ** 2
        return np.where(k > 0, cz_ + rz * np.sqrt(np.clip(k, 0, 1)), -1e9)

    inner = np.setdiff1d(np.arange(468), loop)
    gap = surf_z(pts[inner, 0], pts[inner, 1], cz) - pts[inner, 2]
    cz -= max(0.0, gap.max()) + 0.004

    # Skørt: kantpunkter føres skråt bagud og ind i ellipsoiden, så der ikke er sprækker.
    skirt = []
    for i in loop:
        p = pts[i].copy()
        for _ in range(60):
            inside = (p[0] / rx) ** 2 + ((p[1] - cy) / ry) ** 2 + ((p[2] - cz) / rz) ** 2 < 0.97
            if inside:
                break
            p[2] -= 0.004
            p[0] *= 0.985
            p[1] = cy + (p[1] - cy) * 0.985
        skirt.append(p)
    skirt = np.array(skirt)
    n0 = len(pts)
    allpts = np.vstack([pts, skirt])
    extra = []
    L = len(loop)
    for k in range(L):
        a_, b_ = loop[k], loop[(k + 1) % L]
        sa, sb = n0 + k, n0 + (k + 1) % L
        extra.append([a_, sb, b_])
        extra.append([a_, sa, sb])
    extra = np.array(extra)
    # Skørtet skal vende udad (væk fra ansigtets midte).
    for t in extra:
        A, Bp, C = allpts[t]
        nrm = np.cross(Bp - A, C - A)
        out = (A + Bp + C) / 3 - np.array([0, cy, cz])
        if nrm.dot(out) < 0:
            t[[1, 2]] = t[[2, 1]]
    faces = np.vstack([tris, extra])

    # Teksturudsnit omkring ansigtet.
    px = lm[:, 0] * W
    py = lm[:, 1] * H
    x0, x1, y0, y1 = px[:468].min(), px[:468].max(), py[:468].min(), py[:468].max()
    m = 0.12 * max(x1 - x0, y1 - y0)
    x0, x1, y0, y1 = x0 - m, x1 + m, y0 - m, y1 + m
    crop = img.crop((int(x0), int(y0), int(x1), int(y1)))
    cw, ch = crop.size
    scale = TEX / max(cw, ch)
    crop = crop.resize((max(1, int(cw * scale)), max(1, int(ch * scale))), Image.LANCZOS)
    uv = np.stack([(px - x0) / (x1 - x0), 1 - (py - y0) / (y1 - y0)], axis=1)
    uvs = np.vstack([uv[:468], uv[loop]])

    # Marmortekstur: gråtoner, normaliseret omkring marmorets grundfarve, blødt udtonet mod kanten.
    g = np.asarray(crop.convert("L"), dtype=np.float32) / 255
    mask_img = Image.new("L", crop.size, 0)
    poly = [((uv[i, 0]) * crop.size[0], (1 - uv[i, 1]) * crop.size[1]) for i in loop]
    ImageDraw.Draw(mask_img).polygon(poly, fill=255)
    mask = np.asarray(mask_img) > 0
    from scipy.ndimage import gaussian_filter
    mean = g[mask].mean()
    low = gaussian_filter(g, sigma=0.05 * TEX)
    detail = g - low                      # træk (øjne, bryn, mund) uden fotoets lyssætning
    shade = low - mean                    # lidt af den store skygge for dybdens skyld
    base = 0.8
    marble = np.clip(base + detail * 1.6 + shade * 0.3, 0.28, 0.97)
    feather = np.clip(distance_transform_edt(mask) / (0.035 * TEX), 0, 1)
    out = base + (marble - base) * feather
    rgb = np.stack([out * 1.0, out * 0.985, out * 0.958], axis=2)
    tex = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=2, percent=60))

    key = {
        "forehead": pts[FOREHEAD].tolist(),
        "chin": pts[CHIN].tolist(),
        "nose": pts[NOSE_TIP].tolist(),
        "rEye": Q[R_IRIS].tolist(),
        "lEye": Q[L_IRIS].tolist(),
        "rCheek": pts[R_CHEEK].tolist(),
        "lCheek": pts[L_CHEEK].tolist(),
    }
    data = {
        "positions": np.round(allpts, 5).flatten().tolist(),
        "uvs": np.round(uvs, 5).flatten().tolist(),
        "indices": faces.astype(int).flatten().tolist(),
        "head": {"center": [0.0, float(cy), float(cz)], "radii": [float(rx), float(ry), float(rz)]},
        "key": key,
        "base": base,
    }
    return data, tex, crop


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--photo", required=True)
    ap.add_argument("--pick-x", type=float, default=0.5, help="Vandret position (0-1) af det ansigt, der skal bruges")
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    img, lm = detect(Path(a.photo), Path(a.model), a.pick_x)
    data, tex, crop = build(img, lm)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "face.json").write_text(json.dumps(data, separators=(",", ":")))
    tex.save(out / "face.jpg", quality=90)
    crop.save(out / "face_crop_preview.jpg", quality=85)
    print(f"Ansigt: {len(data['positions']) // 3} punkter, {len(data['indices']) // 3} trekanter")


if __name__ == "__main__":
    main()
