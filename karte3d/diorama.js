// 3D-Karte im Stil «Diorama» mit three.js r187 (Entscheid E-81). Eigenes Modul, wird erst beim Öffnen einer Karte
// geladen (FELD3D in src/grafik/feldkarte-3d.js). Bekommt die Szene als reine Daten (Flächen der Gebäude aus dem
// Kartenbau, Gebäudeliste, Hügel, Bäume, Wasser, Wege, Bodenbild) und zeichnet ein Standbild je Ansicht.
// Alle Oberflächen (Backstein, Beton, Putz, Metall, Dach, Gras, Erde, Fels, Wasser) werden hier selbst erzeugt;
// keine fremden Bilder. Zwei Stufen: 2 = volle Pracht (weiche Schatten 2048, Umgebungsverdunkelung GTAO, Wasser
// mit Spiegelung, Kantenglättung), 1/0 = einfacher (Schatten 1024, glänzendes Wasser ohne Spiegelung, ohne GTAO).
import * as T from '../three-r187/build/three.module.js';
import { EffectComposer } from '../three-r187/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../three-r187/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from '../three-r187/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from '../three-r187/examples/jsm/postprocessing/OutputPass.js';
import { Water } from '../three-r187/examples/jsm/objects/Water.js';

export const VERSION = T.REVISION;

// ---------- Hilfen ----------
const rng = seed => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const hs = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
const hoeheF = H => (x, z) => { if (!H) return 0; let h = 0; for (const q of H){ const dx = x - q[0], dz = z - q[1], d2 = (dx * dx + dz * dz) / (q[3] * q[3]); if (d2 < 9) h += q[2] * Math.exp(-d2); } return h; };
const imPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++){ const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const leinwand = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rauschen(g, w, h, n, a, r, farben){ for (let i = 0; i < n; i++){ g.globalAlpha = a * (.4 + r() * .6); g.fillStyle = farben[Math.floor(r() * farben.length)]; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } g.globalAlpha = 1; }
function textur(c, wdh, farbe){ const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = wdh ? T.RepeatWrapping : T.ClampToEdgeWrapping; t.anisotropy = 4; if (farbe) t.colorSpace = T.SRGBColorSpace; return t; }

// ---------- Oberflächen (selbst erzeugt) ----------
// Fassade: eine Kachel ist 4,4 × 3,2 Einheiten (ein Stockwerk, zwei Fenster). Ergebnis: Farbe, Relief, Leuchten (Abendlicht).
function fassade(art, fenster){
  const W = 176, H = 128, c = leinwand(W, H), g = c.getContext('2d'), b = leinwand(W, H), bg = b.getContext('2d'), e = leinwand(W, H), eg = e.getContext('2d'), r = rng(art * 31 + (fenster ? 7 : 0));
  eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H); bg.fillStyle = '#808080'; bg.fillRect(0, 0, W, H);
  if (art === 4){   // Backstein: Läufer mit Fugen
    g.fillStyle = '#b8b2a8'; g.fillRect(0, 0, W, H); bg.fillStyle = '#5a5a5a'; bg.fillRect(0, 0, W, H);
    for (let y = 0, z = 0; y < H; y += 8, z++) for (let x = (z % 2) * -9; x < W; x += 18){ const t = .82 + r() * .3; g.fillStyle = `rgb(${Math.round(176 * t)},${Math.round(92 * t)},${Math.round(70 * t)})`; g.fillRect(x + 1, y + 1, 16, 6); bg.fillStyle = '#9a9a9a'; bg.fillRect(x + 1, y + 1, 16, 6); }
  } else if (art === 3){   // Metall: Wellblech
    for (let x = 0; x < W; x++){ const v = 150 + 60 * Math.sin(x / 2.2); g.fillStyle = `rgb(${v * .86 | 0},${v * .9 | 0},${v * .94 | 0})`; g.fillRect(x, 0, 1, H); bg.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; bg.fillRect(x, 0, 1, H); }
    rauschen(g, W, H, 400, .25, r, ['#6b5a48', '#8a7a68']);
  } else if (art === 1){   // Beton: Platten mit Fugen und Schalungslöchern
    g.fillStyle = '#c9c7c0'; g.fillRect(0, 0, W, H); rauschen(g, W, H, 2500, .25, r, ['#9d9b95', '#e2e0da']);
    g.fillStyle = '#8d8b85'; g.fillRect(0, 0, W, 2); g.fillRect(0, 0, 2, H); g.fillRect(W / 2, 0, 1, H); bg.fillStyle = '#505050'; bg.fillRect(0, 0, W, 2); bg.fillRect(0, 0, 2, H);
    for (let i = 0; i < 12; i++){ g.fillStyle = '#9b9993'; g.fillRect(8 + (i % 6) * 28, 10 + Math.floor(i / 6) * 100, 2, 2); }
  } else {   // Putz: feine Körnung, Sockel
    g.fillStyle = '#ece6da'; g.fillRect(0, 0, W, H); rauschen(g, W, H, 4000, .2, r, ['#d6cfc2', '#fffaf0', '#c9c1b2']);
    bg.fillStyle = '#808080'; rauschen(bg, W, H, 3000, .5, r, ['#707070', '#909090']);
  }
  if (fenster){   // zwei Fenster je Kachel: Rahmen, Glas, Sims; einzelne leuchten abends
    for (const fx of [26, 114]){ const x = fx, y = 34, w = 36, h = 56, an = r() < .35;
      g.fillStyle = art === 4 ? '#e6e0d4' : '#5e646a'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
      const gl = g.createLinearGradient(0, y, 0, y + h); gl.addColorStop(0, '#9fb6c8'); gl.addColorStop(.45, '#3f5566'); gl.addColorStop(1, '#22313c'); g.fillStyle = gl; g.fillRect(x, y, w, h);
      g.fillStyle = '#d9dde0'; g.fillRect(x + w / 2 - 1, y, 2, h); g.fillRect(x, y + h * .42, w, 2); g.fillStyle = '#d8d3c8'; g.fillRect(x - 5, y + h + 3, w + 10, 4);
      bg.fillStyle = '#3c3c3c'; bg.fillRect(x, y, w, h); bg.fillStyle = '#c8c8c8'; bg.fillRect(x - 5, y + h + 3, w + 10, 4);
      if (an){ eg.fillStyle = '#ffb35c'; eg.fillRect(x, y, w, h); } }
  }
  return { map:textur(c, true, true), bumpMap:textur(b, true), emissiveMap:textur(e, true, true) };
}
function flaeche(art){   // Dach (Kies), Fels, Erde-Schnitt, Detail-Relief
  const S = art === 'kante' ? [64, 512] : [256, 256], c = leinwand(S[0], S[1]), g = c.getContext('2d'), r = rng(art.length * 97);
  if (art === 'dach'){ g.fillStyle = '#9a9792'; g.fillRect(0, 0, 256, 256); rauschen(g, 256, 256, 9000, .35, r, ['#6e6b66', '#bdb9b2', '#85827c']); }
  else if (art === 'fels'){ g.fillStyle = '#7c776f'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 6 + r() * 10){ g.fillStyle = r() < .5 ? 'rgba(40,36,32,.35)' : 'rgba(220,214,204,.25)'; g.fillRect(0, y, 256, 1 + r() * 2); } rauschen(g, 256, 256, 5000, .4, r, ['#5f5a53', '#a39d94']); }
  else if (art === 'relief'){ g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256); rauschen(g, 256, 256, 12000, .5, r, ['#5a5a5a', '#a8a8a8', '#707070', '#909090']); }
  else {   // Schnittkante: Grasnarbe, Humus, Erde, Fels mit Schichten (v = Tiefe 0 … 9 Einheiten)
    const st = [[0, '#56703a'], [.03, '#3e2c1c'], [.12, '#5a4128'], [.36, '#6e5a44'], [.42, '#77736b'], [1, '#55524d']];
    const gl = g.createLinearGradient(0, 0, 0, 512); for (const [p, f] of st) gl.addColorStop(p, f); g.fillStyle = gl; g.fillRect(0, 0, 64, 512);
    for (let y = 220; y < 512; y += 10 + r() * 22){ g.fillStyle = 'rgba(30,28,26,.4)'; g.fillRect(0, y, 64, 2); g.fillStyle = 'rgba(200,195,185,.15)'; g.fillRect(0, y + 2, 64, 3); }
    rauschen(g, 64, 512, 3000, .35, r, ['#2a2018', '#8a7a64', '#3a3632']);
    for (let i = 0; i < 40; i++){ g.fillStyle = '#8f8a82'; g.beginPath(); g.ellipse(r() * 64, 70 + r() * 120, 2 + r() * 3, 1.5 + r() * 2, 0, 0, 7); g.fill(); }   // Steine in der Erde
  }
  return textur(c, true, art !== 'relief');
}
function wasserNormalen(){   // Normalen für das Wasser aus Rauschen (keine fremde Textur)
  const N = 128, d = new Uint8Array(N * N * 4), r = rng(5), H = new Float32Array(N * N);
  const k = []; for (let i = 0; i < 24; i++) k.push([r() * 6.28, 2 + Math.floor(r() * 6), 2 + Math.floor(r() * 6), r()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){ let h = 0; for (const [p, a, b, s] of k) h += Math.sin((x * a + y * b) / N * 6.2832 + p) * (s + .2) / (a + b); H[y * N + x] = h; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){ const hx = H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N], hy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x];
    const nx = -hx * 3, ny = -hy * 3, l = Math.hypot(nx, ny, 1), o = (y * N + x) * 4; d[o] = (nx / l * .5 + .5) * 255; d[o + 1] = (ny / l * .5 + .5) * 255; d[o + 2] = (1 / l * .5 + .5) * 255; d[o + 3] = 255; }
  const t = new T.DataTexture(d, N, N); t.wrapS = t.wrapT = T.RepeatWrapping; t.needsUpdate = true; return t;
}

// ---------- Licht ----------
const LICHT = {
  tag:{ sonne:[-.55, 1, .42], farbe:0xfff1dc, staerke:3.1, himmel:0xbfd8f0, boden:0x5a4a38, hemi:1.15, dunst:0xb9cadb, hg:['#1a222b', '#3d5163'], bel:1.08, fenster:0, wasser:0x2c7296 },
  gold:{ sonne:[-.9, .3, .22], farbe:0xffa860, staerke:3.4, himmel:0x7f8fc0, boden:0x3a2618, hemi:.65, dunst:0xe0a070, hg:['#1d1214', '#6a3a2a'], bel:1.05, fenster:1.4, wasser:0x2f4a66 } };

/**
 * Grafik auf der Leinwand canvas, Stufe 0–2. Ergebnis: { szene(id, D), bild(o), ok, frei() } oder Fehler (dann flache Karte).
 */
export function erstellen(canvas, stufe){
  const voll = stufe >= 2;
  // Ohne WebGL 2: kein Fehler, die flache Karte bleibt (der Aufrufer prüft null)
  const gl = canvas.getContext('webgl2', { alpha:false, antialias:false, depth:true, stencil:false, premultipliedAlpha:true, preserveDrawingBuffer:false, powerPreference:voll ? 'high-performance' : 'low-power' });
  if (!gl) return null;
  const R = new T.WebGLRenderer({ canvas, context:gl, antialias:false, alpha:false, powerPreference:voll ? 'high-performance' : 'low-power', preserveDrawingBuffer:false });
  R.toneMapping = T.ACESFilmicToneMapping; R.outputColorSpace = T.SRGBColorSpace; R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
  const api = { ok:true };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); api.ok = false; }, { once:true });

  // Gemeinsame Materialien (einmal je Grafik)
  const F = {}; for (const a of [1, 2, 3, 4]) for (const f of [0, 1]){ const t = fassade(a, f);
    F[a + '' + f] = new T.MeshStandardMaterial({ map:t.map, bumpMap:t.bumpMap, bumpScale:a === 4 ? 1.6 : 1, emissiveMap:f ? t.emissiveMap : null, emissive:f ? 0xffffff : 0x000000, emissiveIntensity:0,
      vertexColors:true, roughness:a === 3 ? .5 : .88, metalness:a === 3 ? .45 : 0 }); }
  const M = { dach:new T.MeshStandardMaterial({ map:flaeche('dach'), vertexColors:true, roughness:.95 }), fels:new T.MeshStandardMaterial({ map:flaeche('fels'), vertexColors:true, roughness:.95 }),
    metall:new T.MeshStandardMaterial({ color:0xb7bcc2, roughness:.38, metalness:.75 }), kante:new T.MeshStandardMaterial({ map:flaeche('kante'), roughness:1 }),
    stamm:new T.MeshStandardMaterial({ color:0x5a4330, roughness:.95, flatShading:true }), laub:new T.MeshStandardMaterial({ roughness:.85, flatShading:true }), relief:flaeche('relief') };
  M.kante.map.wrapT = T.ClampToEdgeWrapping;   // unter dem Fels keine zweite Grasnarbe
  const NORM = wasserNormalen();
  // Umgebung für Spiegelungen (Himmelsverlauf, selbst gezeichnet)
  const pm = new T.PMREMGenerator(R), umg = {};
  function umgebung(L){ if (umg[L.name]) return umg[L.name]; const c = leinwand(256, 128), g = c.getContext('2d'), gl = g.createLinearGradient(0, 0, 0, 128);
    gl.addColorStop(0, L === LICHT.gold ? '#5a6fa8' : '#6f9fd0'); gl.addColorStop(.48, L === LICHT.gold ? '#ffb070' : '#e6f0f8'); gl.addColorStop(.52, '#6b5d4c'); gl.addColorStop(1, '#2c261f'); g.fillStyle = gl; g.fillRect(0, 0, 256, 128);
    const t = textur(c, false, true); t.mapping = T.EquirectangularReflectionMapping; return umg[L.name] = pm.fromEquirectangular(t).texture; }
  LICHT.tag.name = 'tag'; LICHT.gold.name = 'gold';
  const hintergrund = {}; const hg = L => { if (hintergrund[L.name]) return hintergrund[L.name]; const c = leinwand(4, 256), g = c.getContext('2d'), gl = g.createLinearGradient(0, 0, 0, 256); gl.addColorStop(0, L.hg[1]); gl.addColorStop(1, L.hg[0]); g.fillStyle = gl; g.fillRect(0, 0, 4, 256); return hintergrund[L.name] = textur(c, false, true); };

  const kamera = new T.PerspectiveCamera(40, 1, 1, 2000);
  const szenen = new Map();
  let komp = null, ao = null, kompGr = '';

  /** Baut die Szene für Map id aus den Daten D (einmal; höchstens zwei Szenen bleiben im Grafikspeicher). */
  function szene(id, D){
    if (szenen.has(id)) return szenen.get(id);
    const S = new T.Scene(), h = hoeheF(D.hills), G = D.ground, r = rng(4242 + Math.floor(hs(id) * 1e5)), weg = [];
    const frei = o => { o.traverse(x => { if (x.geometry) x.geometry.dispose(); }); };
    // Licht
    const sonne = new T.DirectionalLight(0xffffff, 3); sonne.castShadow = true; const sm = voll ? 2048 : 1024; sonne.shadow.mapSize.set(sm, sm);
    Object.assign(sonne.shadow.camera, { left:-82, right:82, top:82, bottom:-82, near:1, far:420 }); sonne.shadow.bias = -.0004; sonne.shadow.normalBias = .04; sonne.shadow.radius = 3; S.add(sonne, sonne.target);
    const hemi = new T.HemisphereLight(0xffffff, 0x444444, 1); S.add(hemi);
    S.fog = new T.Fog(0xffffff, 100, 400);

    // Gelände: Block mit Bodenbild, Relief, Fels an steilen Hängen; Schnittkanten mit Erdschichten
    const st = voll ? 1 : 1.4, nx = Math.ceil((G.x1 - G.x0) / st), nz = Math.ceil((G.z1 - G.z0) / st), P = [], UV = [], UV1 = [], C = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++){ const x = G.x0 + (G.x1 - G.x0) * i / nx, z = G.z0 + (G.z1 - G.z0) * j / nz, y = h(x, z);
      const sl = Math.hypot(h(x + .7, z) - h(x - .7, z), h(x, z + .7) - h(x, z - .7)) / 1.4, fe = Math.min(1, Math.max(0, (sl - .35) / .5));
      P.push(x, y + .03, z); UV.push(i / nx, 1 - j / nz); UV1.push(x / 6, z / 6); const k = 1 - fe * .35; C.push(k, k * .98, k * .95); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++){ const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1; I.push(a, d, b, b, d, c); }
    const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(P, 3)); gg.setAttribute('uv', new T.Float32BufferAttribute(UV, 2)); gg.setAttribute('uv1', new T.Float32BufferAttribute(UV1, 2));
    gg.setAttribute('color', new T.Float32BufferAttribute(C, 3)); gg.setIndex(I); gg.computeVertexNormals();
    const bodenT = textur(D.bild, false, true), rel = M.relief.clone(); rel.channel = 1; rel.needsUpdate = true;
    const boden = new T.Mesh(gg, new T.MeshStandardMaterial({ map:bodenT, bumpMap:rel, bumpScale:1.2, vertexColors:true, roughness:.96 })); boden.receiveShadow = true; S.add(boden); weg.push(bodenT, boden.material);
    // Schnittkanten (v = Tiefe), Unterkante bei y = −9
    { const K = [], KU = [], KI = []; let n = 0;
      const rand = [[i => [G.x0 + (G.x1 - G.x0) * i / nx, G.z1], nx], [i => [G.x1 - (G.x1 - G.x0) * i / nx, G.z0], nx], [i => [G.x0, G.z0 + (G.z1 - G.z0) * i / nz], nz], [i => [G.x1, G.z1 - (G.z1 - G.z0) * i / nz], nz]];
      for (const [f, k] of rand){ let u = 0; for (let i = 0; i <= k; i++){ const [x, z] = f(i), y = h(x, z) + .03; if (i){ const [x0, z0] = f(i - 1); u += Math.hypot(x - x0, z - z0) / 8; }
        K.push(x, y, z, x, -9, z); KU.push(u, 1, u, 1 - (y + 9) / 9 * 1); if (i){ const a = n - 2, b = n - 1, c = n, d = n + 1; KI.push(a, c, b, b, c, d); } n += 2; } }
      // v: oben 1 (Grasnarbe), unten 0 → Textur steht richtig (flipY)
      for (let i = 0; i < KU.length; i += 4){ KU[i + 1] = 1; KU[i + 3] = 1 - ((K[(i / 2) * 3 + 1] + 9)) / 9; }
      const kg = new T.BufferGeometry(); kg.setAttribute('position', new T.Float32BufferAttribute(K, 3)); kg.setAttribute('uv', new T.Float32BufferAttribute(KU, 2)); kg.setIndex(KI); kg.computeVertexNormals();
      const km = new T.Mesh(kg, new T.MeshStandardMaterial({ map:M.kante.map, roughness:1, side:T.DoubleSide })); km.receiveShadow = true; S.add(km); }

    // Gebäude und Bauten aus den Flächen des Kartenbaus: Material je Gebäude, Fenster nur an Gebäuden (nicht an Blöcken)
    const T0 = {}, add = (k, p, n, uv, c) => { const t = T0[k] || (T0[k] = { P:[], N:[], U:[], C:[] }); t.P.push(...p); t.N.push(...n); t.U.push(...uv); t.C.push(...c); };
    for (const f of D.faces){
      const ps = f.p; if (ps.length < 3) continue;
      const horiz = Math.abs(f.n[1]) > .7, ln = Math.hypot(...f.n) || 1, n = f.n.map(v => v / ln);
      let k, col = [1, 1, 1], tile = [4.4, 3.2];
      if (f.mat === 'rock'){ k = 'fels'; tile = [8, 8]; }
      else if (f.mat === 'concrete' || f.mat === 'plaster' || f.mat === 'metal' || f.mat === 'hull' || f.mat === 'slab' || f.mat === 'roof' || !f.mat){
        const m = D.matVon(f), fenster = !!f.bid && !/^blk:/.test(f.bid) && f.mat !== 'hull' && !horiz;
        if (horiz){ k = 'dach'; tile = [6, 6]; col = m.dach; } else { k = m.st + '' + (fenster ? 1 : 0); col = m.farbe; }
        if (!f.mat){ const c = f.col || [180, 180, 180]; col = [c[0] / 255, c[1] / 255, c[2] / 255].map(v => Math.min(1, v * 1.4)); k = horiz ? 'dach' : '10'; }
      } else continue;
      const y0 = Math.min(...ps.map(q => q[1])), t = [-n[2], 0, n[0]], tl = Math.hypot(t[0], t[2]) || 1;
      const uv = q => horiz ? [q[0] / tile[0], q[2] / tile[1]] : [(q[0] * t[0] + q[2] * t[2]) / tl / tile[0], (q[1] - y0) / tile[1]];
      for (let i = 1; i < ps.length - 1; i++){ let tri = [ps[0], ps[i], ps[i + 1]];
        const u = [tri[1][0] - tri[0][0], tri[1][1] - tri[0][1], tri[1][2] - tri[0][2]], v = [tri[2][0] - tri[0][0], tri[2][1] - tri[0][1], tri[2][2] - tri[0][2]];
        const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) tri = [tri[0], tri[2], tri[1]];
        add(k, tri.flat(), [...n, ...n, ...n], tri.flatMap(uv), [...col, ...col, ...col]); }
    }
    // Dachaufbauten: Dachrand, Lüftung, Treppenhaus, Wassertank, Oberlicht, Antenne
    const box = (b, lx, y0, lz, w, hh, d, k, col) => { const a = (b.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), Pq = (x, y, z) => [b.x + x * c - z * s, y, b.z + x * s + z * c], R = q => [q[0] * c - q[2] * s, q[1], q[0] * s + q[2] * c];
      const x0 = lx - w / 2, x1 = lx + w / 2, z0 = lz - d / 2, z1 = lz + d / 2, y1 = y0 + hh;
      for (const [q, nn] of [[[[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]], [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]], [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]],
        [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]], [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]]]){
        const p = q.map(v => Pq(...v)), nr = R(nn), uv = q.map(v => nn[1] ? [v[0] / 3, v[2] / 3] : [(v[0] + v[2]) / 3, (v[1] - y0) / 3]);
        for (const tr of [[0, 1, 2], [0, 2, 3]]) add(k, tr.flatMap(i => p[i]), [...nr, ...nr, ...nr], tr.flatMap(i => uv[i]), [...col, ...col, ...col]); } };
    const tanks = [];
    for (const b of D.bauten){
      if (b.fl < 1 || b.w < 3 || b.d < 3) continue;
      const top = h(b.x, b.z) + b.fl * 3.2, m = D.matVon({ bid:b.id, mat:b.mat }), rc = m.dach.map(v => v * 1.2), tw = b.tower;
      const rand = (ww, dd, y) => { const t = .3, hh = .55; box(b, 0, y, -dd / 2 + t / 2, ww, hh, t, 'dach', rc); box(b, 0, y, dd / 2 - t / 2, ww, hh, t, 'dach', rc); box(b, -ww / 2 + t / 2, y, 0, t, hh, dd - 2 * t, 'dach', rc); box(b, ww / 2 - t / 2, y, 0, t, hh, dd - 2 * t, 'dach', rc); };
      rand(b.w, b.d, top); if (tw) rand(tw.w, tw.d, top + tw.fl * 3.2);
      if (stufe < 1) continue;
      const rr = rng(Math.floor(hs(b.id) * 1e6)), n = 1 + Math.floor(rr() * (b.w * b.d > 120 ? 5 : 3)), ok = (x, z, q) => !tw || Math.abs(x) > tw.w / 2 + q || Math.abs(z) > tw.d / 2 + q;
      for (let i = 0; i < n; i++){ const ox = (rr() - .5) * Math.max(0, b.w - 2.4), oz = (rr() - .5) * Math.max(0, b.d - 2.4), q = rr(); if (!ok(ox, oz, 1.2)) continue;
        if (q < .5) box(b, ox, top, oz, .9 + rr() * 1.2, .6 + rr() * .5, .8 + rr(), 'met', [.8, .82, .84]);
        else if (q < .7) box(b, ox, top, oz, 1.6, 2.2, 1.6, m.st + '0', m.farbe);
        else if (q < .85 && m.st !== 3){ const a = (b.rot || 0) * Math.PI / 180; tanks.push([b.x + ox * Math.cos(a) - oz * Math.sin(a), top, b.z + ox * Math.sin(a) + oz * Math.cos(a)]); }
        else box(b, ox, top, oz, Math.min(b.w * .5, 4), .25, 1, 'glas', [.5, .6, .7]); }
      if (rr() < .3) box(b, tw ? 0 : (rr() - .5) * (b.w - 2), top + (tw ? tw.fl * 3.2 : 0), tw ? 0 : (rr() - .5) * (b.d - 2), .12, 3 + rr() * 2, .12, 'met', [.9, .9, .9]);
    }
    const mat = k => k === 'dach' ? M.dach : k === 'fels' ? M.fels : k === 'met' ? M.metall : k === 'glas' ? (M.glas || (M.glas = new T.MeshStandardMaterial({ color:0x2a3a48, roughness:.08, metalness:.2 }))) : F[k];
    for (const [k, t] of Object.entries(T0)){ const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(t.P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(t.N, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(t.U, 2)); g.setAttribute('color', new T.Float32BufferAttribute(t.C, 3)); const o = new T.Mesh(g, mat(k)); o.castShadow = o.receiveShadow = true; S.add(o); }
    if (tanks.length){ const tg = new T.CylinderGeometry(.9, .9, 1.4, 12), dg = new T.ConeGeometry(1, .5, 12), ti = new T.InstancedMesh(tg, M.metall, tanks.length), di = new T.InstancedMesh(dg, M.metall, tanks.length), m4 = new T.Matrix4();
      tanks.forEach(([x, y, z], i) => { ti.setMatrixAt(i, m4.makeTranslation(x, y + 1.9, z)); di.setMatrixAt(i, m4.makeTranslation(x, y + 2.85, z)); }); ti.castShadow = di.castShadow = true; S.add(ti, di); }

    // Bäume und Büsche: Nadelbaum, Laubbaum, Pappel, Busch (eigene Formen, je Boden andere Farben)
    const base = G.base, snow = base === 'snow', sand = base === 'sand';
    const PAL = snow ? [0x2b4a3a, 0x24402f] : sand ? [0x6b6c3a, 0x5a6232, 0x7a7444] : [0x3c6a2a, 0x4f7d2e, 0x2f5a30, 0x6a8030, 0x8a7428];
    const auf = (x, z) => D.wege.some(([x0, z0, x1, z1, w]) => { const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - x0 - t * dx, z - z0 - t * dz) < w / 2 + 1.1; });
    const nass = (x, z) => D.wasser.some(w => imPoly(x, z, w.p)), nahBau = (x, z) => D.bauten.some(b => Math.abs(x - b.x) < b.w / 2 + 3.5 && Math.abs(z - b.z) < b.d / 2 + 3.5);
    const L = [];   // [x, z, s, art 0–3]
    for (const [x, z, hh] of D.baeume) if (!auf(x, z)) L.push([x, z, Math.max(.8, hh / 3.4), null]);
    let deco = Math.round(({ grass:90, dirt:70, snow:60, sand:14 }[base] || 0) * [.5, 1, 1.4][stufe]);
    for (let i = 0; i < deco * 3 && i < 500 && deco > 0; i++){ const x = G.x0 + 4 + r() * (G.x1 - G.x0 - 8), z = G.z0 + 4 + r() * (G.z1 - G.z0 - 8), s = .8 + r() * .7;
      if (nahBau(x, z) || nass(x, z) || auf(x, z)) continue; L.push([x, z, s, null]); deco--; }
    const arten = [[], [], [], []];
    for (const t of L){ const q = hs(t[0] * 1.7 + t[1] * .31); t[3] = snow ? (q < .8 ? 0 : 3) : q < .3 ? 0 : q < .62 ? 1 : q < .75 ? 2 : 3; arten[t[3]].push(t); }
    const kegel = () => { const gs = [[1.5, 2.4, 1], [1.1, 2.2, 2.3], [.75, 1.8, 3.5]].map(([rr, hh, y]) => new T.ConeGeometry(rr, hh, 7).translate(0, y + hh / 2, 0)); return verbinden(gs); };
    const kronen = [kegel(), new T.IcosahedronGeometry(1.45, 1).translate(0, 2.5, 0), new T.IcosahedronGeometry(.85, 1).scale(1, 2.1, 1).translate(0, 3.1, 0), verbinden([new T.IcosahedronGeometry(.85, 0).translate(.4, .35, 0), new T.IcosahedronGeometry(.7, 0).translate(-.45, .3, .35)])];
    const stamm = new T.CylinderGeometry(.1, .16, 1.6, 5).translate(0, .8, 0), m4 = new T.Matrix4(), farbe = new T.Color();
    arten.forEach((A, k) => { if (!A.length) return; const kr = new T.InstancedMesh(kronen[k], M.laub, A.length), sm2 = k < 3 ? new T.InstancedMesh(stamm, M.stamm, A.length) : null;
      A.forEach(([x, z, s], i) => { const y = h(x, z), w = hs(x * 7.3 + z) * 6.28; m4.compose(new T.Vector3(x, y, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), w), new T.Vector3(s, s * (.9 + hs(z * 3.3) * .25), s));
        kr.setMatrixAt(i, m4); if (sm2) sm2.setMatrixAt(i, m4); farbe.setHex(PAL[Math.floor(hs(x * 3.1 + z * 7.7) * PAL.length)]); if (snow && k === 0) farbe.lerp(new T.Color(0xe8eef4), .25); kr.setColorAt(i, farbe); });
      kr.castShadow = kr.receiveShadow = true; S.add(kr); if (sm2){ sm2.castShadow = true; S.add(sm2); } });

    // Wasser: volle Stufe mit Spiegelung und Wellen, sonst glänzende Fläche; Eis matt-glänzend
    const wasser = [], einfach = [];
    for (const w of D.wasser){
      const sh = new T.Shape(w.p.map(([x, z]) => new T.Vector2(x, -z))), geo = new T.ShapeGeometry(sh), y = .1 + Math.max(0, ...w.p.map(([x, z]) => h(x, z)).slice(0, 1));
      if (w.art === 'ice'){ const o = new T.Mesh(geo, new T.MeshStandardMaterial({ color:0xd8ecf6, roughness:.25, metalness:.05 })); o.rotation.x = -Math.PI / 2; o.position.y = y; o.receiveShadow = true; S.add(o); continue; }
      const farbeW = w.art === 'redwater' ? 0x5a2a22 : null;
      const ein = new T.Mesh(geo, new T.MeshStandardMaterial({ color:farbeW || 0x2c6a8a, roughness:.06, metalness:.15 })); ein.rotation.x = -Math.PI / 2; ein.position.y = y; ein.receiveShadow = true; S.add(ein); einfach.push(ein);
      if (voll){ const wa = new Water(geo, { textureWidth:512, textureHeight:512, waterNormals:NORM, sunDirection:new T.Vector3(), sunColor:0xffffff, waterColor:farbeW || 0x1d4a64, distortionScale:2.2, fog:true });
        wa.rotation.x = -Math.PI / 2; wa.position.y = y; wa.material.uniforms.size.value = 14; S.add(wa); wasser.push({ wa, farbeW }); }
    }
    const s = { S, sonne, hemi, wasser, einfach, fenster:Object.values(F), frei:() => { frei(S); weg.forEach(x => x.dispose()); } };
    szenen.set(id, s);
    if (szenen.size > 2){ const [alt] = szenen.keys(); if (alt !== id){ szenen.get(alt).frei(); szenen.delete(alt); } }
    return s;
  }

  /** Nachbearbeitung (Umgebungsverdunkelung GTAO, Kantenglättung, Ausgabe) für Szene S und Grösse B × H. */
  function fuer(S, B, H, dpr){ const gr = [B, H, dpr].join(',');
    if (!komp){ const rt = new T.WebGLRenderTarget(1, 1, { type:T.HalfFloatType, samples:4 }); komp = new EffectComposer(R, rt); komp.addPass(new RenderPass(S, kamera)); ao = new GTAOPass(S, kamera, B, H);
      ao.blendIntensity = .9; ao.updateGtaoMaterial({ radius:1.4, distanceExponent:1.4, thickness:2, scale:1, samples:12 }); komp.addPass(ao); komp.addPass(new OutputPass()); }
    komp.passes[0].scene = S; ao.scene = S; if (kompGr !== gr){ R.setPixelRatio(dpr); R.setSize(B, H, false); komp.setPixelRatio(dpr); komp.setSize(B, H); kompGr = gr; } }
  /** Licht und Luft setzen (Sonne, Himmel, Umgebung, Hintergrund, Dunst nach Kameraabstand, Fenster); Ergebnis: Sonnenrichtung. */
  function licht(s, L, dist){ const S = s.S, d = new T.Vector3(...L.sonne).normalize();
    s.sonne.position.copy(d.clone().multiplyScalar(200)); s.sonne.target.position.set(0, 0, 0); s.sonne.color.setHex(L.farbe); s.sonne.intensity = L.staerke;
    s.hemi.color.setHex(L.himmel); s.hemi.groundColor.setHex(L.boden); s.hemi.intensity = L.hemi;
    S.environment = umgebung(L); S.environmentIntensity = .45; S.background = hg(L);
    S.fog.color.setHex(L.dunst); S.fog.near = dist * .95; S.fog.far = dist * 3.2;
    for (const m of s.fenster) m.emissiveIntensity = L.fenster;
    return d; }
  /**
   * Zeichnet Map id: o = { B, H, dpr, pos:[x,y,z], ziel:[x,y,z], P:[16] Projektion, near, far, gold, schnell }.
   */
  function bild(id, o){
    const s = szenen.get(id); if (!s || !api.ok) return false;
    const S = s.S, L = o.gold ? LICHT.gold : LICHT.tag, d = licht(s, L, Math.hypot(o.pos[0] - o.ziel[0], o.pos[1] - o.ziel[1], o.pos[2] - o.ziel[2]));
    R.toneMappingExposure = L.bel;
    const spiegeln = !o.schnell && !o.einfach && s.wasser.length > 0;
    for (const w of s.wasser){ w.wa.visible = spiegeln; const u = w.wa.material.uniforms; u.sunDirection.value.copy(d); u.sunColor.value.setHex(L.farbe); u.waterColor.value.setHex(w.farbeW || L.wasser); }
    for (const e of s.einfach) e.visible = !spiegeln;
    // Kamera wie die Zeichen der Karte (gleiche Projektion)
    kamera.near = o.near; kamera.far = o.far; kamera.position.set(...o.pos); kamera.up.set(0, 1, 0); kamera.lookAt(...o.ziel); kamera.updateMatrixWorld();
    kamera.projectionMatrix.fromArray(o.P); kamera.projectionMatrixInverse.copy(kamera.projectionMatrix).invert();
    R.setPixelRatio(o.dpr); R.setSize(o.B, o.H, false);
    if (voll && !o.schnell && !o.einfach){
      fuer(S, o.B, o.H, o.dpr); komp.render();
    } else R.render(S, kamera);
    return api.ok;
  }
  /** Vorbereiten in kleinen Schritten (je eine Aufgabe), damit das erste Bild nicht lange blockiert:
   *  1. Texturen auf die Grafikkarte, 2. Licht setzen und Shader übersetzen, 3. Umgebung (Spiegelungen). */
  function vorwaermen(id){ const s = szenen.get(id); if (!s || s.warm >= (voll ? 5 : 4) || s.wartet) return; s.warm = (s.warm || 0) + 1;
    if (s.warm === 1){ const t = new Set(); s.S.traverse(o => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) for (const k of ['map', 'bumpMap', 'emissiveMap']) if (m[k]) t.add(m[k]); }); for (const x of t) R.initTexture(x); }
    else if (s.warm === 2){ licht(s, LICHT.tag, 170); kamera.position.set(0, 120, 120); kamera.lookAt(0, 0, 0); kamera.updateMatrixWorld(); kamera.updateProjectionMatrix();
      s.wartet = true; R.compileAsync(s.S, kamera).catch(() => {}).then(() => { s.wartet = false; }); }   // übersetzt neben der Seite, wo der Browser es kann
    else if (s.warm === 3) umgebung(LICHT.tag);
    else if (s.warm === 4){ R.setPixelRatio(1); R.setSize(8, 8, false); R.render(s.S, kamera); }   // Probebild: Schattenbild und Puffer einmal anlegen
    else if (voll){ fuer(s.S, 16, 16, 1); for (const w of s.wasser) w.wa.visible = true; for (const e of s.einfach) e.visible = false; komp.render(); } }   // volle Stufe: Nachbearbeitung und Spiegelung einmal
  function frei(){ for (const s of szenen.values()) s.frei(); szenen.clear(); if (komp) komp.dispose(); R.dispose(); }
  return Object.assign(api, { szene, bild, frei, vorwaermen, hat:id => szenen.has(id), warm:id => (szenen.get(id) || {}).warm >= (voll ? 5 : 4) && !szenen.get(id).wartet });
}

/** Mehrere Formen zu einer (gleiche Attribute: Position, Normale, UV). */
function verbinden(gs){
  const a = gs.map(g => g.index ? g.toNonIndexed() : g), n = a.reduce((s, g) => s + g.attributes.position.count, 0), out = new T.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']){ const sz = a[0].attributes[k].itemSize, arr = new Float32Array(n * sz); let o = 0; for (const g of a){ arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new T.BufferAttribute(arr, sz)); }
  return out;
}
