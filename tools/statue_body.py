#!/usr/bin/env python3
"""Byg statuens krop og dragen som glatte, sammenhængende marmorskulpturer.

Kroppen beskrives som et signed distance field (SDF): kapsler og ellipsoider for
knogler og muskler, smeltet sammen med "smooth union". Overfladen trækkes ud med
marching cubes og forenkles, så filen er lille. Hovedets placering skrives med i
filen, så ansigtet fra tools/statue_face.py sidder præcis rigtigt i browseren.

Output: assets/statue/body.bin (ikke personlige data, kun en generisk krop og en drage).

Kør: python3 tools/statue_body.py [--res 0.01]
"""
import argparse
import json
import math
import struct
from pathlib import Path

import numpy as np
from skimage.measure import marching_cubes
import fast_simplification

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "statue" / "body.bin"
f32 = np.float32

# ---------------------------------------------------------------- Pose (meter, fødder i y=0, front mod +z, figurens højre = -x)
J = {
    "hipR": (-0.105, 1.07, 0.0), "hipL": (0.105, 1.085, 0.02),
    "kneeR": (-0.125, 0.6, 0.035), "ankleR": (-0.14, 0.1, -0.01),
    "kneeL": (0.2, 0.9, 0.31), "ankleL": (0.225, 0.47, 0.4),
    "shR": (-0.25, 1.735, -0.01), "shL": (0.25, 1.725, 0.0),
    "elbowR": (-0.4, 1.99, 0.03), "wristR": (-0.43, 2.25, 0.065),
    "elbowL": (0.43, 1.45, -0.07), "wristL": (0.235, 1.22, 0.07),
}
J = {k: np.array(v, dtype=f32) for k, v in J.items()}
HEAD_POS = np.array([0.0, 2.04, 0.025], dtype=f32)
HEAD_ROT = (-0.12, -0.2, 0.03)  # Euler YXZ (x, y, z), samme som i three.js


def euler_yxz(x, y, z):
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return (Ry @ Rx @ Rz).astype(f32)


def rot_to(v):
    """Rotationsmatrix der fører +y over i retningen v."""
    v = np.asarray(v, dtype=np.float64)
    v = v / np.linalg.norm(v)
    a = np.array([0.0, 1.0, 0.0])
    c = float(a @ v)
    if c > 0.9999:
        return np.eye(3, dtype=f32)
    if c < -0.9999:
        return np.diag([1, -1, -1]).astype(f32)
    ax = np.cross(a, v)
    s = np.linalg.norm(ax)
    ax /= s
    K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return (np.eye(3) + K * s + K @ K * (1 - c)).astype(f32)


# ---------------------------------------------------------------- SDF-primitiver (P er en (N,3)-matrix)
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def capsule(P, a, b, ra, rb):
    a = np.asarray(a, f32)
    b = np.asarray(b, f32)
    ba = b - a
    pa = P - a
    h = np.clip(pa @ ba / float(ba @ ba), 0, 1)
    r = ra + (rb - ra) * h
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - r


def ellipsoid(P, c, r, R=None):
    q = P - np.asarray(c, f32)
    if R is not None:
        q = q @ R  # verdens- til lokale koordinater (R er ortonormal)
    r = np.asarray(r, f32)
    k0 = np.linalg.norm(q / r, axis=1)
    k1 = np.linalg.norm(q / (r * r), axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-6)


def rbox(P, c, half, rad, R=None):
    """Afrundet kasse (flade, skulpturelle muskelplader)."""
    q = P - np.asarray(c, f32)
    if R is not None:
        q = q @ R
    q = np.abs(q) - (np.asarray(half, f32) - rad)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0) - rad


def sphere(P, c, r):
    return np.linalg.norm(P - np.asarray(c, f32), axis=1) - r


def seg_ellipsoid(P, a, b, t, r, off=(0, 0, 0)):
    """Muskel langs et lem: ellipsoide med y-akse langs a->b."""
    a = np.asarray(a, f32)
    b = np.asarray(b, f32)
    c = a + (b - a) * t + np.asarray(off, f32)
    return ellipsoid(P, c, r, rot_to(b - a))


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], f32)


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], f32)


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], f32)


def tri_dist(P, a, b, c):
    """Afstand fra punkter til en trekant (iq udTriangle)."""
    a, b, c = (np.asarray(v, f32) for v in (a, b, c))
    ba, pa = b - a, P - a
    cb, pb = c - b, P - b
    ac, pc = a - c, P - c
    nor = np.cross(ba, ac)
    s = (np.sign(np.cross(ba, nor) @ pa.T) + np.sign(np.cross(cb, nor) @ pb.T) + np.sign(np.cross(ac, nor) @ pc.T))

    def d2(e, p):
        h = np.clip(p @ e / float(e @ e), 0, 1)
        q = e[None, :] * h[:, None] - p
        return (q * q).sum(1)

    edge = np.minimum(np.minimum(d2(ba, pa), d2(cb, pb)), d2(ac, pc))
    plane = (pa @ nor) ** 2 / float(nor @ nor)
    return np.sqrt(np.where(s < 2, edge, plane))


# ---------------------------------------------------------------- Kroppen
def body_sdf(P):
    d = ellipsoid(P, (0, 1.57, -0.005), (0.19, 0.205, 0.138))  # brystkasse
    d = smin(d, ellipsoid(P, (0, 1.32, 0.008), (0.145, 0.16, 0.112)), 0.06)  # mave
    d = smin(d, ellipsoid(P, (0, 1.11, 0.0), (0.168, 0.12, 0.122)), 0.05)  # bækken
    for sx in (-1, 1):
        d = smin(d, ellipsoid(P, (sx * 0.088, 1.06, -0.072), (0.105, 0.115, 0.09)), 0.03)  # balder
        d = smin(d, ellipsoid(P, (sx * 0.17, 1.6, -0.035), (0.085, 0.125, 0.088), rot_z(sx * 0.4)), 0.04)  # latissimus (V-form)
        d = smin(d, ellipsoid(P, (sx * 0.12, 1.43, -0.05), (0.06, 0.13, 0.07), rot_z(sx * 0.3)), 0.04)
        Rp = rot_z(sx * 0.1) @ rot_y(sx * 0.3) @ rot_x(-0.12)
        d = smin(d, rbox(P, (sx * 0.1, 1.645, 0.1), (0.112, 0.066, 0.032), 0.03, Rp), 0.018)  # brystmuskel
        d = smin(d, ellipsoid(P, (sx * 0.128, 1.245, 0.032), (0.052, 0.1, 0.075), rot_z(sx * 0.15)), 0.035)  # skrå mavemuskler
        for i, y in enumerate((1.49, 1.535, 1.58)):
            d = smin(d, ellipsoid(P, (sx * (0.168 - i * 0.004), y, 0.064), (0.032, 0.017, 0.026), rot_z(sx * 0.5)), 0.012)  # serratus
        for y, k in ((1.245, 1.0), (1.322, 1.04), (1.4, 1.08)):
            d = smin(d, rbox(P, (sx * 0.047, y, 0.1), (0.04 * k, 0.032, 0.022), 0.016), 0.01)  # mavens "six-pack"
        d = smin(d, capsule(P, (sx * 0.02, 1.775, 0.06), (sx * 0.21, 1.77, 0.0), 0.017, 0.017), 0.03)  # kraveben
        d = smin(d, capsule(P, (sx * 0.058, 1.965, -0.015), (sx * 0.016, 1.78, 0.06), 0.022, 0.019), 0.02)  # halsmuskler
    d = smin(d, ellipsoid(P, (0, 1.785, -0.03), (0.22, 0.075, 0.095)), 0.05)  # trapezius
    d = smax(d, -capsule(P, (0, 1.2, 0.124), (0, 1.46, 0.118), 0.006, 0.006), 0.012)  # linea alba
    d = smax(d, -capsule(P, (0, 1.53, 0.142), (0, 1.67, 0.136), 0.007, 0.007), 0.014)  # mellem brystmusklerne
    d = smin(d, capsule(P, (0, 1.72, -0.01), (0, 1.96, 0.02), 0.076, 0.064), 0.04)  # hals

    for s, sx in (("R", -1), ("L", 1)):
        sh, el, wr = J["sh" + s], J["elbow" + s], J["wrist" + s]
        d = smin(d, ellipsoid(P, sh + np.array([sx * 0.028, 0.0, 0], f32), (0.106, 0.118, 0.106)), 0.045)  # deltoid
        d = smin(d, capsule(P, sh, el, 0.066, 0.05), 0.03)
        u = (el - sh) / np.linalg.norm(el - sh)
        front = np.array([0, 0, 1], f32) - u * u[2]
        front /= np.linalg.norm(front)
        d = smin(d, seg_ellipsoid(P, sh, el, 0.55, (0.066, 0.125, 0.064), front * 0.024), 0.025)  # biceps
        d = smin(d, seg_ellipsoid(P, sh, el, 0.42, (0.062, 0.135, 0.062), -front * 0.024), 0.025)  # triceps
        d = smin(d, capsule(P, el, wr, 0.054, 0.035), 0.025)
        d = smin(d, seg_ellipsoid(P, el, wr, 0.3, (0.059, 0.105, 0.052)), 0.025)  # underarm
        v = (wr - el) / np.linalg.norm(wr - el)
        d = smin(d, ellipsoid(P, wr + v * 0.06, (0.048, 0.064, 0.042), rot_to(v)), 0.02)  # knyttet hånd
        d = smin(d, ellipsoid(P, wr + v * 0.072 + front * 0.03, (0.042, 0.026, 0.03), rot_to(v)), 0.012)  # knoer

    for s in ("R", "L"):
        hp, kn, an = J["hip" + s], J["knee" + s], J["ankle" + s]
        u = (kn - hp) / np.linalg.norm(kn - hp)
        front = np.array([0, 0, 1], f32) - u * u[2]
        front /= np.linalg.norm(front)
        side = np.cross(u, front)
        inner = side if (s == "R") else -side
        d = smin(d, capsule(P, hp, kn, 0.11, 0.064), 0.05)
        d = smin(d, seg_ellipsoid(P, hp, kn, 0.45, (0.096, 0.23, 0.083), front * 0.038), 0.03)  # quadriceps
        d = smin(d, seg_ellipsoid(P, hp, kn, 0.8, (0.05, 0.075, 0.048), front * 0.02 + inner * 0.045), 0.02)  # vastus medialis
        d = smin(d, seg_ellipsoid(P, hp, kn, 0.45, (0.078, 0.21, 0.072), -front * 0.03), 0.03)  # baglår
        d = smin(d, sphere(P, kn + front * 0.012, 0.062), 0.025)  # knæ
        d = smin(d, capsule(P, kn, an, 0.06, 0.036), 0.03)
        d = smin(d, seg_ellipsoid(P, kn, an, 0.28, (0.068, 0.138, 0.062), -front * 0.037), 0.03)  # læg
        foot_dir = front + np.array([0, -0.05 if s == "R" else -0.28, 0], f32)
        foot_dir /= np.linalg.norm(foot_dir)
        fc = an + np.array([0, -0.055, 0], f32) + foot_dir * 0.07
        d = smin(d, ellipsoid(P, fc, (0.05, 0.125, 0.035), rot_to(foot_dir)), 0.03)  # fod
        d = smin(d, sphere(P, an + np.array([0, -0.05, -0.035], f32), 0.042), 0.02)  # hæl

    # Kort, plisseret skørt (som på romerske heltestatuer)
    yy = P[:, 1]
    q = P - np.array([0, 1.05, 0.005], f32)
    ang = np.arctan2(q[:, 2], q[:, 0])
    flare = 1 + 0.9 * np.clip(1.08 - yy, 0, 0.3)
    qq = q / np.stack([flare, np.ones_like(flare), flare], axis=1)
    e = ellipsoid(qq, (0, 0, 0), (0.198, 0.3, 0.158)) * flare
    fold = 0.008 * np.sin(ang * 14) + 0.004 * np.sin(ang * 5 + 1)
    top = 1.17 + 0.04 * (q[:, 0] / 0.2)
    bottom = 0.86 + 0.035 * np.sin(ang + 0.6) + 0.01 * np.sin(ang * 14)
    drape = np.maximum(e + fold, np.maximum(yy - top, bottom - yy))
    d = smin(d, drape, 0.012)
    d = smin(d, capsule(P, (-0.2, 1.155, 0.04), (0.2, 1.19, 0.04), 0.022, 0.022), 0.02)  # bælte
    d = smin(d, ellipsoid(P, (0.165, 1.17, 0.075), (0.045, 0.035, 0.03), rot_z(0.6)), 0.01)  # knude

    # Kappe ned ad ryggen (skal) med folder
    yy = P[:, 1]
    v = np.clip((1.78 - yy) / 1.0, 0, 1)
    halfw = 0.17 + 0.17 * v
    xn = np.clip(P[:, 0] / np.maximum(halfw, 1e-3), -1, 1)
    zc = -0.135 - 0.11 * v - 0.035 * np.cos(xn * math.pi / 2) + 0.024 * np.sin(P[:, 0] * 24 + v * 3) * (0.3 + v)
    cape = np.abs(P[:, 2] - zc) * 0.85 - 0.013
    cape = np.maximum(cape, np.abs(P[:, 0] - 0.04 * v) - halfw)
    cape = np.maximum(cape, np.maximum(yy - 1.79, 0.78 - yy + 0.04 * np.sin(P[:, 0] * 20)))
    d = smin(d, cape, 0.02)
    d = smin(d, ellipsoid(P, (0.225, 1.775, -0.03), (0.105, 0.065, 0.13), rot_z(-0.3)), 0.03)  # draperi over venstre skulder

    # Hoved: kranie, ører og hår (hovedets egne koordinater)
    R = euler_yxz(*HEAD_ROT)
    hl = (P - HEAD_POS) @ R
    rx, ry, rz = HEAD_RADII
    skull = ellipsoid(hl, (0, 0, 0), (rx, ry, rz))
    for sx in (-1, 1):
        skull = smin(skull, ellipsoid(hl, (sx * (rx - 0.004), -0.02, -0.012), (0.016, 0.034, 0.024), rot_y(sx * 0.4)), 0.006)
    axis = np.array([0, math.cos(0.55), -math.sin(0.55)], f32)
    curls = 0.0035 * np.sin(hl[:, 0] * 90) * np.sin(hl[:, 1] * 80 + hl[:, 2] * 40) * np.sin(hl[:, 2] * 85)
    hair = ellipsoid(hl, (0, 0.007, -0.006), (rx * 1.06, ry * 1.045, rz * 1.06)) + curls
    hair = smax(hair, -(hl @ axis + 0.004), 0.008)
    skull = smin(skull, hair, 0.004)
    d = smin(d, skull, 0.035)
    return d


# ---------------------------------------------------------------- Dragen
DRAGON_CURVE = np.array([
    (0.2, 0.19, 0.3), (0.42, 0.15, 0.08), (0.48, 0.14, -0.3), (0.15, 0.13, -0.52),
    (-0.25, 0.12, -0.5), (-0.5, 0.1, -0.2), (-0.52, 0.08, 0.2), (-0.47, 0.06, 0.56),
    (-0.58, 0.04, 0.78), (-0.63, -0.15, 0.8), (-0.64, -0.42, 0.7),
], dtype=f32)


def catmull(pts, n):
    out = []
    P = np.vstack([pts[0] * 2 - pts[1], pts, pts[-1] * 2 - pts[-2]])
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return np.array(out, f32)


def dragon_sdf(P):
    C = catmull(DRAGON_CURVE, 6)
    n = len(C)
    d = np.full(len(P), 1e3, f32)
    for i in range(n - 1):
        t = i / (n - 1)
        r0 = 0.11 * (1 - t) ** 0.8 + 0.01
        r1 = 0.11 * (1 - (i + 1) / (n - 1)) ** 0.8 + 0.01
        d = smin(d, capsule(P, C[i], C[i + 1], r0, r1), 0.02)
    # skæl langs kroppen
    d += 0.0025 * np.sin(P[:, 0] * 120) * np.sin(P[:, 2] * 120)
    # rygpigge
    for i in range(3, int(n * 0.8), 3):
        t = i / (n - 1)
        r = 0.11 * (1 - t) ** 0.8 + 0.01
        base = C[i] + np.array([0, r * 0.8, 0], f32)
        h = 0.08 * (1 - t) + 0.025
        d = smin(d, capsule(P, base, base + np.array([0, h, -0.01], f32), 0.022 * (1 - t) + 0.008, 0.002), 0.012)
    # hoved (under heltens venstre fod)
    H = np.array([0.215, 0.255, 0.46], f32)
    Rh = rot_y(0.4) @ rot_x(-0.12)
    head = ellipsoid(P, H, (0.105, 0.09, 0.13), Rh)
    head = smin(head, ellipsoid(P, H + Rh @ np.array([0, -0.01, 0.13], f32), (0.07, 0.055, 0.12), Rh), 0.04)  # snude
    jaw_c = H + Rh @ np.array([0, -0.085, 0.1], f32)
    head = smin(head, ellipsoid(P, jaw_c, (0.065, 0.025, 0.13), Rh @ rot_x(0.35)), 0.02)  # underkæbe (åben)
    head = smax(head, -ellipsoid(P, H + Rh @ np.array([0, -0.055, 0.14], f32), (0.055, 0.02, 0.1), Rh @ rot_x(0.2)), 0.01)  # gab
    for sx in (-1, 1):
        head = smax(head, -sphere(P, H + Rh @ np.array([sx * 0.025, 0.035, 0.245], f32), 0.012), 0.006)  # næsebor
        head = smin(head, ellipsoid(P, H + Rh @ np.array([sx * 0.055, 0.055, 0.03], f32), (0.03, 0.016, 0.04), Rh), 0.01)  # øjenbue
        head = smax(head, -sphere(P, H + Rh @ np.array([sx * 0.066, 0.035, 0.05], f32), 0.016), 0.006)  # øjenhule
        horn_a = H + Rh @ np.array([sx * 0.06, 0.06, -0.06], f32)
        horn_b = H + Rh @ np.array([sx * 0.12, 0.13, -0.24], f32)
        head = smin(head, capsule(P, horn_a, horn_b, 0.024, 0.004), 0.015)  # horn
        for k in range(4):
            tb = H + Rh @ np.array([sx * (0.04 - k * 0.005), -0.045, 0.12 + k * 0.035], f32)
            head = smin(head, capsule(P, tb, tb + np.array([0, -0.03, 0], f32), 0.007, 0.001), 0.003)  # tænder
    d = smin(d, head, 0.04)
    # vinge (halvt rejst bag heltens ben)
    wb = np.array([0.42, 0.2, -0.25], f32)
    tips = [np.array(t, f32) for t in ((0.6, 0.78, -0.48), (0.76, 0.62, -0.2), (0.8, 0.4, 0.02), (0.7, 0.22, 0.14))]
    wing = np.full(len(P), 1e3, f32)
    for i in range(len(tips) - 1):
        a, b = tips[i], tips[i + 1]
        mid = (a + b) / 2 + (wb - (a + b) / 2) * 0.2
        wing = np.minimum(wing, tri_dist(P, wb, a, mid) - 0.008)
        wing = np.minimum(wing, tri_dist(P, wb, mid, b) - 0.008)
    for tp in tips:
        wing = smin(wing, capsule(P, wb, tp, 0.02, 0.006), 0.01)
    d = smin(d, wing, 0.02)
    # forpote med kløer over soklens kant
    paw = np.array([0.46, 0.06, 0.24], f32)
    d = smin(d, capsule(P, C[2], paw, 0.04, 0.035), 0.03)
    for k in range(3):
        c0 = paw + np.array([(k - 1) * 0.03, -0.01, 0.04], f32)
        d = smin(d, capsule(P, c0, c0 + np.array([0, -0.05, 0.03], f32), 0.012, 0.002), 0.008)
    return d


# ---------------------------------------------------------------- Mesh
def extract(sdf, lo, hi, res, target_tris, name):
    lo = np.array(lo, f32)
    hi = np.array(hi, f32)
    shape = np.ceil((hi - lo) / res).astype(int) + 1
    xs = lo[0] + np.arange(shape[0], dtype=f32) * res
    ys = lo[1] + np.arange(shape[1], dtype=f32) * res
    zs = lo[2] + np.arange(shape[2], dtype=f32) * res
    vol = np.empty(shape, f32)
    X, Z = np.meshgrid(xs, zs, indexing="ij")
    for j, y in enumerate(ys):
        P = np.stack([X.ravel(), np.full(X.size, y, f32), Z.ravel()], axis=1)
        vol[:, j, :] = sdf(P).reshape(X.shape)
    verts, faces, _, _ = marching_cubes(vol, level=0.0, spacing=(res, res, res))
    verts = verts.astype(f32) + lo
    print(f"{name}: {len(verts)} punkter, {len(faces)} trekanter fra marching cubes (gitter {tuple(shape)})")
    if len(faces) > target_tris:
        v2, f2 = fast_simplification.simplify(verts, faces.astype(np.int32), target_reduction=1 - target_tris / len(faces), agg=6)
        verts, faces = v2.astype(f32), f2
        print(f"{name}: forenklet til {len(verts)} punkter, {len(faces)} trekanter")
    # marching cubes giver trekanter med normal indad for SDF (negativ indeni) -> vend
    faces = faces[:, [0, 2, 1]]
    return verts, faces


def pack(meshes, meta):
    blob = bytearray()
    header = {"meta": meta, "meshes": []}
    for name, (v, f) in meshes.items():
        lo = v.min(0)
        hi = v.max(0)
        q = np.round((v - lo) / np.maximum(hi - lo, 1e-6) * 65535).astype("<u2")
        idx_type = "u2" if len(v) < 65536 else "u4"
        idx = f.astype("<" + idx_type).ravel()
        pos_off = len(blob)
        blob += q.tobytes()
        while len(blob) % 4:
            blob += b"\0"
        idx_off = len(blob)
        blob += idx.tobytes()
        while len(blob) % 4:
            blob += b"\0"
        header["meshes"].append({"name": name, "lo": lo.tolist(), "hi": hi.tolist(), "vertices": int(len(v)), "posOffset": pos_off,
                                 "indexType": idx_type, "indexCount": int(idx.size), "indexOffset": idx_off})
    hj = json.dumps(header).encode()
    pad = (4 - (8 + len(hj)) % 4) % 4
    hj += b" " * pad
    return b"GFTS" + struct.pack("<I", len(hj)) + hj + bytes(blob)


HEAD_RADII = (0.1145, 0.1551, 0.1457)


def main():
    global HEAD_RADII
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", type=float, default=0.01)
    ap.add_argument("--face", default=None, help="face.json fra statue_face.py (bruges kun til hovedets mål)")
    ap.add_argument("--body-tris", type=int, default=36000)
    ap.add_argument("--dragon-tris", type=int, default=16000)
    a = ap.parse_args()
    if a.face:
        HEAD_RADII = tuple(json.loads(Path(a.face).read_text())["head"]["radii"])
    body = extract(body_sdf, (-0.62, -0.03, -0.42), (0.62, 2.42, 0.68), a.res, a.body_tris, "Krop")
    dragon = extract(dragon_sdf, (-0.8, -0.5, -0.7), (0.92, 0.95, 0.95), a.res, a.dragon_tris, "Drage")
    meta = {"headPos": HEAD_POS.tolist(), "headRot": list(HEAD_ROT), "headRadii": list(HEAD_RADII),
            "wristR": J["wristR"].tolist(), "elbowR": J["elbowR"].tolist(), "shL": J["shL"].tolist(), "shR": J["shR"].tolist()}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(pack({"body": body, "dragon": dragon}, meta))
    print(f"Skrev {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
