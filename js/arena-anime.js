/* R3 — motor 3D mínimo, sem dependências: malhas, esqueleto articulado, rasterizador com z-buffer,
   sombreamento "cel" (3 tons), contorno em pixels e textura de rosto. Roda em qualquer navegador, offline. */
(function (G) {
  'use strict';
  const D2R = Math.PI / 180, PI = Math.PI;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- matrizes 4x4 (colunas) ---------- */
  const m4 = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
  const _t = new Float32Array(16);
  function mul(a, b, o) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      _t[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      _t[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      _t[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      _t[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    o.set(_t); return o;
  }
  // posição + rotação euler (graus, ordem Y·X·Z) + escala
  function trs(o, p, r, s) {
    const x = r[0] * D2R, y = r[1] * D2R, z = r[2] * D2R;
    const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
    const X = s ? s[0] : 1, Y = s ? s[1] : 1, Z = s ? s[2] : 1;
    o[0] = (cy * cz + sy * sx * sz) * X; o[1] = cx * sz * X; o[2] = (-sy * cz + cy * sx * sz) * X; o[3] = 0;
    o[4] = (-cy * sz + sy * sx * cz) * Y; o[5] = cx * cz * Y; o[6] = (sy * sz + cy * sx * cz) * Y; o[7] = 0;
    o[8] = sy * cx * Z; o[9] = -sx * Z; o[10] = cy * cx * Z; o[11] = 0;
    o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1; return o;
  }
  // quaternion [x,y,z,w] equivalente ao euler Y·X·Z (para exportar glTF)
  function eulerQuat(r) {
    const h = D2R * .5, x = r[0] * h, y = r[1] * h, z = r[2] * h;
    const qx = [Math.sin(x), 0, 0, Math.cos(x)], qy = [0, Math.sin(y), 0, Math.cos(y)], qz = [0, 0, Math.sin(z), Math.cos(z)];
    const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    return qm(qm(qy, qx), qz);
  }

  /* ---------- cores ---------- */
  function hex(c) {
    if (typeof c === 'number') return [c >> 16 & 255, c >> 8 & 255, c & 255];
    c = c.replace('#', ''); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    const n = parseInt(c.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  const pack = (r, g, b, a) => ((a === undefined ? 255 : a) << 24 | clamp(b | 0, 0, 255) << 16 | clamp(g | 0, 0, 255) << 8 | clamp(r | 0, 0, 255)) >>> 0;
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  // quatro tons: sombra, meio, luz, brilho
  function palette(c, shiny) {
    const b = hex(c);
    const dk = mix3(mix3(b, [28, 16, 48], .38), [0, 0, 0], .22), md = mix3(mix3(b, [58, 46, 108], .14), [0, 0, 0], .16);
    const lt = mix3(b, [255, 244, 214], .04), hi = mix3(b, [255, 250, 235], shiny ? .5 : .16);
    return [pack(...dk), pack(...md), pack(...lt), pack(...hi)];
  }

  /* ---------- malhas ---------- */
  function mkMesh(p, n, i, uv) { return { p: Float32Array.from(p), n: n ? Float32Array.from(n) : null, i: Uint16Array.from(i), uv: uv ? Float32Array.from(uv) : null, nv: p.length / 3 }; }
  function fixWinding(m) {
    const p = m.p, i = m.i, nv = m.nv; let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < nv; k++) { cx += p[k * 3]; cy += p[k * 3 + 1]; cz += p[k * 3 + 2]; } cx /= nv; cy /= nv; cz /= nv;
    for (let t = 0; t < i.length; t += 3) {
      const a = i[t] * 3, b = i[t + 1] * 3, c = i[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const tx = (p[a] + p[b] + p[c]) / 3 - cx, ty = (p[a + 1] + p[b + 1] + p[c + 1]) / 3 - cy, tz = (p[a + 2] + p[b + 2] + p[c + 2]) / 3 - cz;
      if (nx * tx + ny * ty + nz * tz < 0) { const s = i[t + 1]; i[t + 1] = i[t + 2]; i[t + 2] = s; }
    }
    return m;
  }
  // normais planas (vértices duplicados por triângulo)
  function flatten(pos, idx) {
    const P = [], N = [], I = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const k = P.length / 3;
      for (const q of [a, b, c]) { P.push(pos[q], pos[q + 1], pos[q + 2]); N.push(nx, ny, nz); }
      I.push(k, k + 1, k + 2);
    }
    return mkMesh(P, N, I);
  }
  function bpts(hh, r, seg) {
    if (r <= 1e-4) return [-hh, hh];
    const L = []; for (let k = 0; k <= seg; k++) { const a = (k / seg) * PI / 4; L.push(-hh + r - r * Math.tan(a)); }
    return L.concat(L.map(v => -v).reverse());
  }
  const FACES = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  // caixa com cantos arredondados (normais suaves)
  function rbox(w, h, d, r, seg) {
    seg = seg || 2; const hx = w / 2, hy = h / 2, hz = d / 2; r = Math.min(r || 0, hx, hy, hz) * .999;
    const P = [], N = [], I = [], half = [hx, hy, hz];
    for (const [n, u, v] of FACES) {
      const ai = n.findIndex(q => q), au = u.findIndex(q => q), av = v.findIndex(q => q);
      const U = bpts(half[au], r, seg), Vv = bpts(half[av], r, seg), base = P.length / 3;
      for (let j = 0; j < Vv.length; j++) for (let i = 0; i < U.length; i++) {
        const p = [0, 0, 0]; p[ai] = n[ai] * half[ai]; p[au] = u[au] * U[i]; p[av] = v[av] * Vv[j];
        const q = [clamp(p[0], -(hx - r), hx - r), clamp(p[1], -(hy - r), hy - r), clamp(p[2], -(hz - r), hz - r)];
        let dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2]; let l = Math.hypot(dx, dy, dz);
        if (l < 1e-6) { dx = n[0]; dy = n[1]; dz = n[2]; l = 1; } dx /= l; dy /= l; dz /= l;
        P.push(q[0] + dx * r, q[1] + dy * r, q[2] + dz * r); N.push(dx, dy, dz);
      }
      for (let j = 0; j < Vv.length - 1; j++) for (let i = 0; i < U.length - 1; i++) {
        const a = base + j * U.length + i, b = a + 1, c = a + U.length + 1, d2 = a + U.length; I.push(a, b, c, a, c, d2);
      }
    }
    return fixWinding(mkMesh(P, N, I));
  }
  function sphere(rx, ry, rz, ns, nv) {
    ns = ns || 10; nv = nv || 7; const P = [], N = [], I = [];
    for (let i = 0; i <= nv; i++) {
      const ph = i / nv * PI; for (let j = 0; j <= ns; j++) {
        const th = j / ns * 2 * PI;
        const x = Math.sin(ph) * Math.cos(th), y = Math.cos(ph), z = Math.sin(ph) * Math.sin(th);
        P.push(x * rx, y * ry, z * rz); const nx = x / rx, ny = y / ry, nz = z / rz, l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, ny / l, nz / l);
      }
    }
    for (let i = 0; i < nv; i++) for (let j = 0; j < ns; j++) { const a = i * (ns + 1) + j, b = a + 1, c = a + ns + 2, d = a + ns + 1; I.push(a, b, c, a, c, d); }
    return fixWinding(mkMesh(P, N, I));
  }
  // cilindro/cone/tronco (eixo Y)
  function cyl(rt, rb, h, seg, capped) {
    seg = seg || 8; const P = [], N = [], I = [], sl = (rb - rt) / h;
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * 2 * PI, c = Math.cos(a), s = Math.sin(a), l = Math.hypot(1, sl);
      P.push(c * rt, h / 2, s * rt, c * rb, -h / 2, s * rb); N.push(c / l, sl / l, s / l, c / l, sl / l, s / l);
    }
    for (let j = 0; j < seg; j++) { const a = j * 2, b = a + 1, c = a + 3, d = a + 2; I.push(a, d, c, a, c, b); }
    if (capped !== false) for (const [y, r, ny] of [[h / 2, rt, 1], [-h / 2, rb, -1]]) {
      if (r <= 0) continue; const k = P.length / 3; P.push(0, y, 0); N.push(0, ny, 0);
      for (let j = 0; j <= seg; j++) { const a = j / seg * 2 * PI; P.push(Math.cos(a) * r, y, Math.sin(a) * r); N.push(0, ny, 0); }
      for (let j = 0; j < seg; j++) I.push(k, k + 1 + j, k + 2 + j);
    }
    return fixWinding(mkMesh(P, N, I));
  }
  // "loft": anéis de pontos 3D (mesmo número por anel), normais planas. Serve p/ lâminas, chifres, mantos
  function loft(rings, capBottom, capTop) {
    const M = rings[0].length, P = [], I = [];
    rings.forEach(r => r.forEach(q => P.push(q[0], q[1], q[2])));
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < M; i++) { const j = (i + 1) % M, a = k * M + i, b = k * M + j, c = (k + 1) * M + j, d = (k + 1) * M + i; I.push(a, b, c, a, c, d); }
    if (capBottom) for (let i = 1; i < M - 1; i++) I.push(0, i, i + 1);
    if (capTop) { const o = (rings.length - 1) * M; for (let i = 1; i < M - 1; i++) I.push(o, o + i, o + i + 1); }
    return fixWinding(flatten(P, I));
  }
  // polígono convexo extrudado em Z (espessura t)
  function prism(poly, t) {
    const n = poly.length, P = [], I = [];
    poly.forEach(q => P.push(q[0], q[1], t / 2)); poly.forEach(q => P.push(q[0], q[1], -t / 2));
    for (let i = 1; i < n - 1; i++) { I.push(0, i, i + 1); I.push(n, n + i, n + i + 1); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; I.push(i, j, n + j, i, n + j, n + i); }
    return fixWinding(flatten(P, I));
  }
  // lâmina de espada (seção em losango) ao longo de +Y; curve desloca a ponta em Z
  function blade(len, w, t, tip, curve) {
    const kt = len * (1 - (tip || .16)), c = curve || 0, ring = (y, s, zc) => [[-w / 2 * s, y, zc], [0, y, zc + t / 2 * s], [w / 2 * s, y, zc], [0, y, zc - t / 2 * s]];
    const r0 = ring(0, 1, 0), r1 = ring(kt, 1, c * .75 * (kt / len) * (kt / len)), top = [len * 0.0, len, c];
    const rings = [r0, r1, [[0, len, c], [0, len, c], [0, len, c], [0, len, c]]];
    const m = loft(rings, true, false); return m;
  }
  // cone com a base na origem (pivô na base) apontando +Y
  function cone(r, h, seg) { const m = cyl(0, r, h, seg || 6, true); for (let k = 1; k < m.p.length; k += 3) m.p[k] += h / 2; return m; }
  // plano com UV (para texturas de rosto)
  function quad(w, h) {
    const m = mkMesh([-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], [0, 1, 2, 0, 2, 3], [0, 0, 1, 0, 1, 1, 0, 1]);
    return m;
  }

  /* ---------- esqueleto ---------- */
  class Node {
    constructor(name, pos, rest) {
      this.name = name; this.pos = pos ? pos.slice() : [0, 0, 0]; this.rest = rest ? rest.slice() : [0, 0, 0];
      this.rot = [0, 0, 0]; this.off = [0, 0, 0]; this.scl = [1, 1, 1]; this.kids = []; this.parts = []; this.parent = null;
      this.M = m4(); this.W = m4();
    }
  }
  class Rig {
    constructor(name) { this.name = name; this.root = new Node('root'); this.N = { root: this.root }; this.nodes = [this.root]; this.parts = []; this.trails = []; this.t = 0; this.meta = {}; this.hidden = {}; }
    node(name, parent, pos, rest) { const n = new Node(name, pos, rest); n.parent = parent; parent.kids.push(n); this.N[name] = n; this.nodes.push(n); return n; }
    add(node, mesh, o) {
      o = o || {}; const L = m4(); trs(L, o.o || [0, 0, 0], o.ro || [0, 0, 0], o.sc);
      const pt = { node, mesh, L, color: o.c || '#888', pal: palette(o.c || '#888', o.shiny), emis: !!o.emis, shiny: !!o.shiny, dbl: !!o.dbl, tex: o.tex || null, og: o.og || null, bias: o.bias || 0, tag: o.tag || '', glow: o.glow || null, o: o.o || [0, 0, 0], ro: o.ro || [0, 0, 0], sc: o.sc || null, shape: o.shape || null };
      node.parts.push(pt); this.parts.push(pt); return pt;
    }
    update() {
      const upd = (n) => {
        const p = [n.pos[0] + n.off[0], n.pos[1] + n.off[1], n.pos[2] + n.off[2]];
        trs(n.M, p, [n.rest[0] + n.rot[0], n.rest[1] + n.rot[1], n.rest[2] + n.rot[2]], n.scl);
        if (n.parent) mul(n.parent.W, n.M, n.W); else n.W.set(n.M);
        n.hid = !!(n.hide || (n.parent && n.parent.hid));
        for (const k of n.kids) upd(k);
      };
      upd(this.root);
    }
    // posição mundial de um ponto local de um nó (após update)
    world(node, p) { const W = node.W; return [W[0] * p[0] + W[4] * p[1] + W[8] * p[2] + W[12], W[1] * p[0] + W[5] * p[1] + W[9] * p[2] + W[13], W[2] * p[0] + W[6] * p[1] + W[10] * p[2] + W[14]]; }
    resetPose() { for (const n of this.nodes) { n.rot[0] = n.rot[1] = n.rot[2] = 0; n.off[0] = n.off[1] = n.off[2] = 0; } }
  }

  /* ---------- textura de rosto ---------- */
  function Tex(w, h) { const t = { w, h, d: new Uint32Array(w * h) }; return t; }

  /* ---------- rasterizador ---------- */
  class Renderer {
    constructor(w, h) { this.resize(w, h); this.light = norm([-.5, .85, .62]); this.th = [.3, .56, .86]; this.outline = true; this.inner = true; }
    resize(w, h) {
      this.w = w; this.h = h; this.buf = new Uint32Array(w * h); this.z = new Float32Array(w * h); this.id = new Int32Array(w * h);
      this.cap = 4096; this.sx = new Float32Array(this.cap); this.sy = new Float32Array(this.cap); this.sz = new Float32Array(this.cap); this.sI = new Float32Array(this.cap);
      this.img = null; this.nid = 1; this.cvs = null;
    }
    clear() { this.buf.fill(0); this.z.fill(-1e9); this.id.fill(0); this.nid = 1; }
    // view: {yaw,pitch,scale,cx,cy}
    setView(v) {
      const R = m4(), Y = m4(); trs(R, [0, 0, 0], [v.pitch === undefined ? 30 : v.pitch, 0, 0]); trs(Y, [0, 0, 0], [0, v.yaw || 0, 0]);
      this.V = mul(R, Y, m4()); this.S = v.scale || 20; this.ox = v.cx === undefined ? this.w / 2 : v.cx; this.oy = v.cy === undefined ? this.h * .8 : v.cy; return this;
    }
    project(p) { const V = this.V; return [this.ox + this.S * (V[0] * p[0] + V[4] * p[1] + V[8] * p[2] + V[12]), this.oy - this.S * (V[1] * p[0] + V[5] * p[1] + V[9] * p[2] + V[13]), V[2] * p[0] + V[6] * p[1] + V[10] * p[2] + V[14]]; }
    drawRig(rig) {
      rig.update(); const V = this.V, S = this.S, ox = this.ox, oy = this.oy, WL = new Float32Array(16), C = new Float32Array(16), Ld = this.light, groups = this.groups = {};
      for (const pt of rig.parts) {
        if (rig.hidden[pt.tag] || pt.node.hid) continue;
        const m = pt.mesh, nv = m.nv;
        if (nv > this.cap) { this.cap = nv * 2; this.sx = new Float32Array(this.cap); this.sy = new Float32Array(this.cap); this.sz = new Float32Array(this.cap); this.sI = new Float32Array(this.cap); }
        mul(pt.node.W, pt.L, WL); mul(V, WL, C);
        const p = m.p, n = m.n, sx = this.sx, sy = this.sy, sz = this.sz, sI = this.sI;
        for (let k = 0, j = 0; k < nv; k++, j += 3) {
          const x = p[j], y = p[j + 1], z = p[j + 2];
          sx[k] = ox + S * (C[0] * x + C[4] * y + C[8] * z + C[12]); sy[k] = oy - S * (C[1] * x + C[5] * y + C[9] * z + C[13]); sz[k] = C[2] * x + C[6] * y + C[10] * z + C[14];
          if (n) {
            const a = n[j], b = n[j + 1], c = n[j + 2]; let wx = WL[0] * a + WL[4] * b + WL[8] * c, wy = WL[1] * a + WL[5] * b + WL[9] * c, wz = WL[2] * a + WL[6] * b + WL[10] * c;
            const l = Math.hypot(wx, wy, wz) || 1; sI[k] = ((wx * Ld[0] + wy * Ld[1] + wz * Ld[2]) / l) * .5 + .5;
          } else sI[k] = .7;
        }
        let id; if (pt.og) { id = groups[pt.og]; if (!id) id = groups[pt.og] = this.nid++; } else id = this.nid++;
        this._mesh(m, pt, id);
      }
    }
    _mesh(m, pt, id) {
      const idx = m.i, W = this.w, H = this.h, sx = this.sx, sy = this.sy, sz = this.sz, sI = this.sI, buf = this.buf, zb = this.z, idb = this.id, th = this.th, pal = pt.pal, dbl = pt.dbl, tex = pt.tex, uv = m.uv, emis = pt.emis, bias = pt.bias;
      const hiCol = pal[3], E = -1e-4;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        const x0 = sx[a], y0 = sy[a], x1 = sx[b], y1 = sy[b], x2 = sx[c], y2 = sy[c];
        const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        if (area === 0) continue; const back = area > 0; if (back && !dbl) continue;
        let minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2)), minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
        if (maxX < 0 || maxY < 0 || minX >= W || minY >= H) continue; if (minX < 0) minX = 0; if (minY < 0) minY = 0; if (maxX > W - 1) maxX = W - 1; if (maxY > H - 1) maxY = H - 1;
        const inv = 1 / area, z0 = sz[a] + bias, z1 = sz[b] + bias, z2 = sz[c] + bias; let i0 = sI[a], i1 = sI[b], i2 = sI[c]; if (back) { i0 = 1 - i0; i1 = 1 - i1; i2 = 1 - i2; }
        for (let y = minY; y <= maxY; y++) {
          const py = y + .5, row = y * W;
          for (let x = minX; x <= maxX; x++) {
            const px = x + .5;
            const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv, w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv, w2 = 1 - w0 - w1;
            if (w0 < E || w1 < E || w2 < E) continue;
            const z = w0 * z0 + w1 * z1 + w2 * z2, o = row + x; if (z <= zb[o]) continue;
            let col;
            if (tex) {
              const u = w0 * uv[a * 2] + w1 * uv[b * 2] + w2 * uv[c * 2], v = w0 * uv[a * 2 + 1] + w1 * uv[b * 2 + 1] + w2 * uv[c * 2 + 1];
              const tx = clamp((u * tex.w) | 0, 0, tex.w - 1), ty = clamp(((1 - v) * tex.h) | 0, 0, tex.h - 1); col = tex.d[ty * tex.w + tx]; if ((col >>> 24) < 128) continue; const I = w0 * i0 + w1 * i1 + w2 * i2, m = I < th[0] ? .66 : I < th[1] ? .84 : I < th[2] ? 1 : 1.04; col = pack((col & 255) * m, (col >> 8 & 255) * m, (col >> 16 & 255) * m, 255);
            }
            else if (emis) col = hiCol;
            else { const I = w0 * i0 + w1 * i1 + w2 * i2; col = I < th[0] ? pal[0] : I < th[1] ? pal[1] : I < th[2] ? pal[2] : pal[3]; }
            buf[o] = col; zb[o] = z; idb[o] = id;
          }
        }
      }
    }
    // contorno: silhueta (pixel vazio vizinho) + linhas internas onde há degrau de profundidade entre peças
    finish(opts) {
      opts = opts || {}; if (opts.outline === false) return; const W = this.w, H = this.h, buf = this.buf, zb = this.z, idb = this.id, out = new Uint32Array(buf);
      const dark = (c, k) => pack((c & 255) * k, (c >> 8 & 255) * k, (c >> 16 & 255) * k + 6, 255), thr = (opts.depthStep || .09);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = y * W + x; const c = buf[o];
        if (!(c >>> 24)) {
          let best = 0, bz = -1e9;
          if (x > 0 && (buf[o - 1] >>> 24) && zb[o - 1] > bz) { bz = zb[o - 1]; best = buf[o - 1]; }
          if (x < W - 1 && (buf[o + 1] >>> 24) && zb[o + 1] > bz) { bz = zb[o + 1]; best = buf[o + 1]; }
          if (y > 0 && (buf[o - W] >>> 24) && zb[o - W] > bz) { bz = zb[o - W]; best = buf[o - W]; }
          if (y < H - 1 && (buf[o + W] >>> 24) && zb[o + W] > bz) { bz = zb[o + W]; best = buf[o + W]; }
          if (best) out[o] = dark(best, .26);
        } else if (this.inner !== false) {
          const id = idb[o], z = zb[o]; let line = false;
          if (x > 0 && idb[o - 1] !== id && (buf[o - 1] >>> 24) && zb[o - 1] - z > thr) line = true;
          else if (x < W - 1 && idb[o + 1] !== id && (buf[o + 1] >>> 24) && zb[o + 1] - z > thr) line = true;
          else if (y > 0 && idb[o - W] !== id && (buf[o - W] >>> 24) && zb[o - W] - z > thr) line = true;
          else if (y < H - 1 && idb[o + W] !== id && (buf[o + W] >>> 24) && zb[o + W] - z > thr) line = true;
          if (line) out[o] = dark(c, .46);
        }
      }
      buf.set(out);
    }
    // rastro de lâmina/energia: faixas translúcidas entre amostras (sem z-test)
    trail(strip, rgb, alpha) {
      const W = this.w, H = this.h, buf = this.buf, S = this.S;
      for (let k = 0; k < strip.length - 1; k++) {
        const A = strip[k], B = strip[k + 1], f = (k + 1) / (strip.length - 1), al = alpha * f * f;
        const q = [A[0], A[1], B[1], B[0]].map(p => this.project(p));
        for (const tri of [[0, 1, 2], [0, 2, 3]]) {
          const [p0, p1, p2] = tri.map(i => q[i]); const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]); if (!area) continue; const inv = 1 / area;
          const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0]))), minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
          for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
            const px = x + .5, py = y + .5, w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) * inv, w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) * inv, w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue; const o = y * W + x, d = buf[o], da = d >>> 24;
            if (!da) buf[o] = pack(rgb[0], rgb[1], rgb[2], 255 * al);
            else buf[o] = pack(lerp(d & 255, rgb[0], al), lerp(d >> 8 & 255, rgb[1], al), lerp(d >> 16 & 255, rgb[2], al), 255);
          }
        }
      }
    }
    // halo/sombra: só em pixels vazios (depois do contorno), com alfa quantizado e pontilhado ordenado
    halo(cx, cy, rx, ry, rgb, a, steps) {
      const W = this.w, H = this.h, buf = this.buf, B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; steps = steps || 4;
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
        const o = y * W + x; if (buf[o] >>> 24) continue; const d = Math.hypot((x - cx) / rx, (y - cy) / ry); if (d >= 1) continue;
        const v = a * Math.pow(1 - d, 1.4) * steps, k = Math.floor(v) + ((v % 1) * 16 > B[(y & 3) * 4 + (x & 3)] ? 1 : 0); if (k <= 0) continue;
        buf[o] = pack(rgb[0], rgb[1], rgb[2], Math.min(255, 255 * k / steps * .9));
      }
    }
    // sombra no chão: escurece só pixels cujo id é o do chão (gid), com pontilhado ordenado
    shadow(cx, cy, rx, ry, k, gid) {
      const W = this.w, H = this.h, buf = this.buf, idb = this.id, B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
        const o = y * W + x; if (idb[o] !== gid || !(buf[o] >>> 24)) continue; const d = Math.hypot((x - cx) / rx, (y - cy) / ry); if (d >= 1) continue;
        const v = (1 - d * d) * 2.2; const lv = v >= 1 ? 1 : (v * 16 > B[(y & 3) * 4 + (x & 3)] ? 1 : 0); if (!lv) continue;
        const c = buf[o], m = 1 - k; buf[o] = pack((c & 255) * m, (c >> 8 & 255) * m, ((c >> 16 & 255) * m) + 3, 255);
      }
    }
    // poça de luz (tocha): clareia/aquece pixels cobertos em poucos degraus pontilhados
    glow(cx, cy, rx, ry, rgb, a, steps) {
      const W = this.w, H = this.h, buf = this.buf, B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; steps = steps || 4;
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
        const o = y * W + x, c = buf[o]; if (!(c >>> 24)) continue; const d = Math.hypot((x - cx) / rx, (y - cy) / ry); if (d >= 1) continue;
        const v = a * (1 - d) * (1 - d) * steps * 2, k = Math.floor(v) + ((v % 1) * 16 > B[(y & 3) * 4 + (x & 3)] ? 1 : 0); if (k <= 0) continue; const f = Math.min(.6, k / steps * .5);
        buf[o] = pack(lerp(c & 255, rgb[0], f), lerp(c >> 8 & 255, rgb[1], f), lerp(c >> 16 & 255, rgb[2], f), 255);
      }
    }
    // joga o resultado num canvas 2D (ampliação sem suavização)
    blit(ctx, dx, dy, dw, dh) {
      if (!this.cvs) { this.cvs = document.createElement('canvas'); }
      if (this.cvs.width !== this.w || this.cvs.height !== this.h) { this.cvs.width = this.w; this.cvs.height = this.h; this.cx2 = this.cvs.getContext('2d'); this.img = new ImageData(new Uint8ClampedArray(this.buf.buffer), this.w, this.h); }
      this.cx2.putImageData(this.img, 0, 0); const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(this.cvs, dx, dy, dw === undefined ? this.w : dw, dh === undefined ? this.h : dh); ctx.imageSmoothingEnabled = sm;
    }
  }
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  G.R3 = Object.assign(G.R3 || {}, { m4, mul, trs, eulerQuat, hex, pack, palette, mkMesh, rbox, sphere, cyl, loft, prism, blade, quad, cone, flatten, fixWinding, Node, Rig, Renderer, Tex, clamp, lerp, norm, D2R });
})(typeof window !== 'undefined' ? window : globalThis);

/* R3 rigs — 5 personagens articulados (esqueleto de juntas), rostos em pixel, poses e animações procedurais. */
(function (G) {
  'use strict';
  const R3 = G.R3, { Rig, rbox, sphere, cyl, blade, prism, loft, quad, Tex, hex, pack, lerp, clamp } = R3;
  const MC = {};
  // R3.lod: 0 = detalhe cheio, 1 = baixo (personagens pequenos no mapa 3D): menos segmentos em caixas, esferas e cilindros
  const MESH = (kind, d) => {
    const lod = R3.lod | 0, k = lod + kind + d.join(','); if (MC[k]) return MC[k];
    if (lod) { d = d.slice(); if (kind === 'b') d[4] = 1; else if (kind === 's') { d[3] = Math.max(5, Math.round((d[3] || 10) * .7)); d[4] = Math.max(3, Math.round((d[4] || 7) * .65)); } else if (kind === 'c') d[3] = Math.max(5, Math.round((d[3] || 8) * .7)); }
    return MC[k] = kind === 'b' ? rbox(...d) : kind === 's' ? sphere(...d) : kind === 'c' ? cyl(...d) : kind === 'bl' ? blade(...d) : kind === 'pr' ? prism(...d) : kind === 'q' ? quad(...d) : kind === 'cn' ? R3.cone(...d) : null;
  };
  const toHex = (a) => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const shade = (c, k) => toHex(hex(c).map(v => v * k));
  const mixc = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => lerp(v, y[i], t))); };

  /* ---------- tabelas por personagem ---------- */
  const TONE = { Espadachim: '#f2c9a0', Mago: '#f0cf9e', Ninja: '#edc49a', Lutador: '#d9a06c', Vampiro: '#d3ccd2' };
  const EYEC = { Espadachim: '#5ac8e0', Mago: '#c99aff', Ninja: '#8fd8e8', Lutador: '#e0923c', Vampiro: '#e8a030' };
  const BLADES = [{ c: '#cfd9ec', hilt: '#d8b34a', curve: 0, len: 1.25 }, { c: '#a9e8c5', hilt: '#7a3c3c', curve: .22, len: 1.18 }, { c: '#e8c98a', hilt: '#3a3a44', curve: -.2, len: 1.3 }];

  /* ---------- rosto 16x12 em pixel (textura) ---------- */
  const FW = 16, FH = 12;
  function paintFace(tex, spec, expr) {
    const d = tex.d, set = (x, y, c) => { if (x >= 0 && x < FW && y >= 0 && y < FH) d[y * FW + x] = c; };
    const S = pack(...hex(spec.skin)), K = pack(26, 18, 24), W = pack(255, 255, 255), I = pack(...hex(spec.eye)), Id = pack(...hex(shade(spec.eye, .55))), B = pack(...hex(shade(spec.hair, .8))),
      BL = pack(...hex(mixc(spec.skin, '#ff7a90', .5))), M = pack(...hex(mixc('#6a1620', spec.skin, .1))), SH = pack(...hex(shade(spec.skin, .9)));
    d.fill(S);
    for (let x = 0; x < FW; x++) set(x, FH - 1, SH);
    const eye = (ex, left) => { for (let i = 0; i < 4; i++) set(ex + i, 4, K); set(ex + (left ? 0 : 3), 5, K); set(ex + (left ? 3 : 0), 5, I); set(ex + (left ? 2 : 1), 5, I); set(ex + (left ? 1 : 2), 5, W); for (let i = 0; i < 4; i++) { set(ex + i, 6, I); set(ex + i, 7, Id); } set(ex + (left ? 0 : 3), 7, K); };
    const eyes = (open) => {
      for (const [ex, left] of [[2, true], [10, false]]) {
        const c = ex + 1;
        if (open === 'blink') { for (let i = 0; i < 4; i++) set(ex + i, 6, K); continue; }
        if (open === 'hurt') { const a = left ? 1 : -1, x0 = left ? c : c + 1; set(x0, 4, K); set(x0 + a, 5, K); set(x0 + 2 * a, 6, K); set(x0 + a, 7, K); set(x0, 8, K); continue; }
        if (open === 'dead') { set(c, 4, K); set(c + 2, 4, K); set(c + 1, 5, K); set(c, 6, K); set(c + 2, 6, K); continue; }
        if (open === 'happy') { set(ex, 6, K); set(ex + 1, 5, K); set(ex + 2, 5, K); set(ex + 3, 6, K); continue; }
        eye(ex, left);
      }
    };
    const brow = (kind) => { for (const [ex, left] of [[2, true], [10, false]]) { const rows = kind === 'angry' ? [2, 2, 3, 3] : kind === 'up' ? [1, 1, 1, 1] : [2, 2, 2, 2]; for (let i = 0; i < 4; i++) set(ex + (left ? i : 3 - i), rows[i], B); } };
    eyes(expr === 'blink' ? 'blink' : expr === 'hurt' ? 'hurt' : expr === 'dead' ? 'dead' : expr === 'happy' ? 'happy' : 'open');
    brow(expr === 'angry' || expr === 'cast' ? 'angry' : expr === 'hurt' ? 'up' : 'n');
    if (spec.blush !== false && expr !== 'dead') { set(1, 8, BL); set(2, 8, BL); set(13, 8, BL); set(14, 8, BL); set(1, 9, BL); set(14, 9, BL); }
    // boca
    if (expr === 'angry') { for (let x = 6; x <= 9; x++) { set(x, 9, K); } for (let x = 7; x <= 8; x++) set(x, 10, M); }
    else if (expr === 'hurt') { set(7, 9, K); set(8, 9, K); set(7, 10, K); set(8, 10, K); }
    else if (expr === 'happy') { set(6, 9, K); set(7, 10, K); set(8, 10, K); set(9, 9, K); }
    else if (expr === 'cast') { set(7, 9, M); set(8, 9, M); set(7, 10, M); set(8, 10, M); }
    else if (expr === 'dead') { for (let x = 6; x <= 9; x++) set(x, 10, K); }
    else { set(7, 9, M); set(8, 9, M); }
    if (spec.fangs && expr !== 'dead') { set(6, 10, W); set(9, 10, W); if (expr === 'angry') { set(6, 9, W); set(9, 9, W); } }
    if (spec.mask) { const MK = pack(...hex(spec.mask)), MD = pack(...hex(shade(spec.mask, .6))); for (let y = 8; y < FH; y++) for (let x = 0; x < FW; x++) d[y * FW + x] = (y === 8 ? MD : MK); for (let x = 6; x <= 9; x++) set(x, 7, MD); }
    if (spec.scar) { set(12, 3, pack(150, 70, 70)); set(12, 4, pack(150, 70, 70)); }
  }
  function faceTex(spec) { const t = Tex(FW, FH); t.spec = spec; t.expr = null; t.set = (e) => { if (t.expr !== e) { t.expr = e; paintFace(t, spec, e); } }; t.set('idle'); return t; }

  /* ---------- construtores comuns ---------- */
  class B {
    constructor(name, pal) { this.rig = new Rig(name); this.pal = pal; this.rig.name = name; this.N = this.rig.N; }
    n(name, parent, pos, rest) { return this.rig.node(name, typeof parent === 'string' ? this.N[parent] : parent, pos, rest); }
    p(node, kind, dims, o) { const nd = typeof node === 'string' ? this.N[node] : node; return this.rig.add(nd, MESH(kind, dims), o); }
  }
  function skeleton(b, o) {
    o = o || {}; const hipsY = o.hipsY || .86;
    b.n('hips', b.rig.root, [0, hipsY, 0]); b.n('spine', 'hips', [0, .1, 0]); b.n('chest', 'spine', [0, .2, 0]); b.n('neck', 'chest', [0, .5, 0]); b.n('head', 'neck', [0, .12, 0]);
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      b.n('leg' + s, 'hips', [sg * (o.legW || .17), -.06, 0]); b.n('knee' + s, 'leg' + s, [0, -.34, 0]); b.n('foot' + s, 'knee' + s, [0, -.31, 0]);
      b.n('arm' + s, 'chest', [sg * (o.shW || .47), .36, 0], [0, 0, sg * 6]); b.n('elbow' + s, 'arm' + s, [0, -.3, 0]); b.n('hand' + s, 'elbow' + s, [0, -.26, 0]); b.n('wp' + s, 'hand' + s, [0, -.08, 0]);
    }
  }
  // pernas, pelve, tronco e braços padrão
  function body(b, c) {
    const P = (n, k, d, o) => b.p(n, k, d, o);
    P('hips', 'b', [.62, .3, .42, .12, 2], { c: c.pants, o: [0, 0, 0], og: 'pelvis' });
    P('spine', 'b', [.6, .26, .4, .1, 1], { c: c.waist || c.shirt, o: [0, .04, 0] });
    P('chest', 'b', [c.torsoW || .74, .6, .46, .16, 2], { c: c.shirt, o: [0, .2, 0], og: 'torso' });
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      P('leg' + s, 'b', [.27, .38, .29, .09, 2], { c: c.pants, o: [0, -.17, 0] });
      P('knee' + s, 'b', [.25, .34, .27, .08, 2], { c: c.shin || c.pants, o: [0, -.15, 0] });
      P('foot' + s, 'b', [.3, .2, .46, .08, 2], { c: c.boot, o: [0, -.05, .07] });
      P('arm' + s, 'b', [c.armW || .22, .34, .24, .08, 2], { c: c.sleeve, o: [0, -.14, 0] });
      P('elbow' + s, 'b', [(c.armW || .22) - .02, .3, .22, .07, 2], { c: c.forearm || c.sleeve, o: [0, -.12, 0] });
      P('hand' + s, 's', [c.fist || .125, c.fist || .125, c.fist || .125, 8, 6], { c: c.skin, o: [0, -.05, 0] });
    }
    P('neck', 'b', [.3, .16, .3, .05, 1], { c: c.skin, o: [0, .0, 0] });
  }
  function head(b, spec, o) {
    o = o || {}; const tex = faceTex(spec); b.rig.face = tex;
    b.p('head', 'b', [.98, .9, .92, .24, 2], { c: spec.skin, o: [0, .46, 0], og: 'head', tag: 'head' });
    b.p('head', 'q', [.72, .54], { tex, o: [0, .35, .472], og: 'head', bias: .03, tag: 'face' });
    if (!o.noEars) for (const sg of [1, -1]) b.p('head', 'b', [.1, .2, .14, .04, 1], { c: shade(spec.skin, .95), o: [sg * .5, .36, -.02], og: 'head' });
  }
  const sword = (b, node, i, extra) => {
    const V = BLADES[i % 3], n = node, L = V.len;
    b.p(n, 'bl', [L, .2, .07, .2, V.curve], { c: V.c, shiny: true, o: [0, .3, 0], ro: [0, 90, 0], tag: 'sword' + i });
    b.p(n, 'b', [.4, .07, .12, .02, 1], { c: V.hilt, o: [0, .25, 0], ro: [0, 90, 0], shiny: true, tag: 'sword' + i });
    b.p(n, 'c', [.045, .045, .3, 6], { c: '#2c2018', o: [0, .08, 0], tag: 'sword' + i });
    b.p(n, 's', [.07, .07, .07, 6, 5], { c: V.hilt, o: [0, -.08, 0], shiny: true, tag: 'sword' + i });
  };
  const blob = (b, node, r, col, o) => b.p(node, 's', [r, r, r, 8, 6], Object.assign({ c: col, emis: true }, o || {}));

  // espetos de cabelo (cones com pivô na base) e franjas (cones para baixo)
  function spikes(b, col, list, bangs) { for (const s of list) b.p('head', 'cn', [s[3] || .13, s[4] || .38, 6], { c: col, o: [s[0], s[1], s[2]], ro: [s[5] || 0, 0, s[6] || 0], og: 'hair' }); }
  const TOPSP = (n, y, w, len, r) => Array.from({ length: n }, (_, i) => { const x = (i / (n - 1) - .5) * w; return [x, y, -.06 + (i % 2) * .1, r || .13, len + (i % 3) * .1, -10 + (i % 2) * 22, -x * 70]; });
  const BANGS = (xs, y, len, r) => xs.map((x, i) => [x, y, .43, r || .13, len * .8 - (i % 2) * .05, 168 + (i % 2) * 8, -x * 22]);
  /* ================= PERSONAGENS ================= */
  const BUILD = {};

  BUILD.Espadachim = (pal, opt) => {
    const b = new B('Espadachim', pal), tone = TONE.Espadachim; skeleton(b, { shW: .49 });
    const steel = '#9aa4b4', dark = shade(pal.shadow || pal.body, .8), coat = !!pal.coat;
    body(b, { pants: '#2a2630', shirt: pal.body, sleeve: pal.body, forearm: mixc(pal.body, '#000', .2), boot: '#2c2422', skin: tone, torsoW: .76, waist: dark });
    head(b, { skin: tone, eye: EYEC.Espadachim, hair: pal.hair }, {});
    // cabelo curto repicado + faixa
    b.p('head', 'b', [1.04, .52, .86, .24, 2], { c: pal.hair, o: [0, .72, -.07], og: 'hair' });
    b.p('head', 'b', [.99, .46, .12, .1, 1], { c: pal.hair, o: [0, .52, -.5], og: 'hair' });
    spikes(b, pal.hair, TOPSP(5, .93, .7, .34, .14)); spikes(b, pal.hair, BANGS([-.3, -.02, .28], .87, .3, .13));
    b.p('head', 'b', [1.04, .13, .96, .05, 1], { c: pal.accent, o: [0, .64, -.02], og: 'band' });
    b.p('head', 'b', [.26, .15, .06, .03, 1], { c: steel, o: [0, .64, .48], shiny: true, og: 'band' });
    // ombreiras e peitoral
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      b.p('arm' + s, 'b', [.34, .2, .34, .09, 2], { c: steel, o: [sg * .04, .07, 0], shiny: true, og: 'pad' + s });
      b.p('arm' + s, 'b', [.36, .05, .36, .02, 1], { c: pal.accent, o: [sg * .04, -.03, 0], og: 'pad' + s });
      b.p('elbow' + s, 'b', [.24, .12, .26, .05, 1], { c: pal.accent, o: [0, -.03, 0] });
    }
    b.p('chest', 'b', [.6, .36, .1, .06, 1], { c: shade(steel, .9), o: [0, .24, .22], shiny: true, og: 'plate' });
    b.p('chest', 'b', [.14, .14, .04, .03, 1], { c: pal.accent, o: [0, .3, .28], shiny: true, og: 'plate', emis: !!pal.glow });
    b.p('spine', 'b', [.66, .09, .44, .03, 1], { c: pal.accent, o: [0, -.03, 0], og: 'belt' });
    b.p('spine', 'b', [.16, .13, .06, .03, 1], { c: '#e6c24a', o: [0, -.03, .22], shiny: true, og: 'belt' });
    // casaco/saiote: painéis articulados
    const cl = coat ? .62 : .36;
    for (const [nm, x, z, w] of [['coatFL', .2, .21, .3], ['coatFR', -.2, .21, .3], ['coatBL', .2, -.21, .3], ['coatBR', -.2, -.21, .3]]) {
      b.n(nm, 'hips', [x, -.1, z]); b.p(nm, 'b', [w, cl, .06, .03, 1], { c: coat ? pal.body : shade(pal.body, .9), o: [0, -cl / 2, 0], og: nm }); b.p(nm, 'b', [w + .01, .05, .07, .02, 1], { c: pal.glow || pal.accent, o: [0, -cl + .02, 0], og: nm, emis: !!pal.glow });
    }
    if (!coat) {
      b.n('cape1', 'chest', [0, .4, -.26]); b.n('cape2', 'cape1', [0, -.44, 0]);
      b.p('cape1', 'b', [.62, .46, .05, .02, 1], { c: pal.accent, o: [0, -.22, 0], og: 'cape' }); b.p('cape2', 'b', [.56, .5, .05, .02, 1], { c: shade(pal.accent, .85), o: [0, -.25, 0], og: 'cape2' });
    }
    // espadas (1 a 3)
    const nS = clamp(opt.swords || 1, 1, 3); b.rig.meta.swords = nS;
    b.N.wpR.rest = [165, 0, 0]; sword(b, 'wpR', 0);
    if (nS >= 2) { b.N.wpL.rest = [165, 0, 0]; sword(b, 'wpL', 1); }
    if (nS >= 3) { b.n('scab', 'spine', [.3, -.04, -.1], [0, 0, -62]); b.p('scab', 'b', [.09, .86, .1, .03, 1], { c: '#241a14', o: [0, -.4, 0], og: 'scab' }); b.p('scab', 'c', [.045, .045, .26, 6], { c: '#2c2018', o: [0, .14, 0] }); b.p('scab', 'b', [.3, .06, .1, .02, 1], { c: BLADES[2].hilt, o: [0, .0, 0], shiny: true }); }
    b.rig.sw = [
      ...['coatFL', 'coatFR'].map((n, i) => ({ n, ax: 0, base: -4, amp: 5, f: 2.2, ph: i, vk: -26 })), ...['coatBL', 'coatBR'].map((n, i) => ({ n, ax: 0, base: 4, amp: 5, f: 2.0, ph: 1 + i, vk: 30 })),
      ...(coat ? [] : [{ n: 'cape1', ax: 0, base: 4, amp: 3, f: 2.1, ph: 0, vk: 38 }, { n: 'cape2', ax: 0, base: 6, amp: 6, f: 2.1, ph: .9, vk: 30 }])];
    b.rig.def = { ready: { armR: [-34, 0, -34], elbowR: [-70, 0, 0], handR: [0, 0, 0], armL: [-26, 0, 34], elbowL: [-64, 0, 0] }, readyW: { R: .85, L: nS >= 2 ? .85 : .2 }, trail: [{ n: 'wpR', a: [0, .35, 0], b: [0, 1.5, 0], col: [235, 245, 255] }].concat(nS >= 2 ? [{ n: 'wpL', a: [0, .35, 0], b: [0, 1.45, 0], col: [190, 255, 220] }] : []), aura: pal.glow };
    b.rig.wp = ['wpR', 'wpL']; return b.rig;
  };

  BUILD.Mago = (pal, opt) => {
    const b = new B('Mago', pal), tone = TONE.Mago; skeleton(b, { legW: .15 });
    const robeDk = shade(pal.body, .8), trim = pal.accent;
    body(b, { pants: robeDk, shirt: pal.body, sleeve: pal.body, forearm: pal.body, armW: .24, boot: '#2a1c2e', skin: tone, waist: robeDk, torsoW: .72, fist: .11 });
    head(b, { skin: tone, eye: EYEC.Mago, hair: pal.hair }, {});
    // saia da túnica com painéis
    b.p('hips', 'c', [.34, .5, .6, 10], { c: pal.body, o: [0, -.27, 0], og: 'robe' });
    b.p('hips', 'c', [.512, .515, .06, 10, false], { c: trim, o: [0, -.54, 0], og: 'robe', shiny: true });
    for (const [nm, z] of [['skF', .28], ['skB', -.28]]) { b.n(nm, 'hips', [0, -.02, z]); b.p(nm, 'b', [.34, .56, .05, .02, 1], { c: z > 0 ? mixc(pal.body, pal.accent, .12) : robeDk, o: [0, -.28, 0], og: nm }); b.p(nm, 'b', [.35, .05, .06, .02, 1], { c: trim, o: [0, -.54, 0], og: nm, shiny: true }); }
    // mangas largas e cinto
    for (const s of ['L', 'R']) { b.p('elbow' + s, 'b', [.34, .22, .3, .1, 1], { c: pal.body, o: [0, -.2, 0], og: 'sl' + s }); b.p('elbow' + s, 'b', [.35, .05, .31, .02, 1], { c: trim, o: [0, -.3, 0], og: 'sl' + s }); }
    b.p('spine', 'b', [.62, .1, .42, .03, 1], { c: trim, o: [0, -.03, 0], og: 'belt' }); b.p('spine', 's', [.08, .08, .05, 6, 5], { c: pal.glow || '#ff6a9a', o: [0, -.03, .22], emis: true });
    b.p('chest', 'b', [.78, .14, .5, .06, 1], { c: pal.hair, o: [0, .46, 0], og: 'collar' }); // gola/ombros
    // cabelo longo
    b.p('head', 'b', [1.06, .58, .98, .26, 2], { c: pal.hair, o: [0, .7, -.08], og: 'hair' });
    b.p('head', 'pr', [[[-.45, 0], [.3, 0], [.18, .3], [-.35, .2]], .1], { c: pal.hair, o: [-.05, .62, .46], ro: [0, 0, 6] });
    b.p('head', 'pr', [[[.0, 0], [.34, 0], [.22, .26]], .1], { c: pal.hair, o: [.1, .62, .46] });
    for (const s of [1, -1]) { b.n('hairS' + s, 'head', [s * .5, .5, .0]); b.p('hairS' + s, 'b', [.12, .5, .16, .05, 1], { c: pal.hair, o: [0, -.18, 0] }); }
    b.n('hairB1', 'head', [0, .5, -.46]); b.n('hairB2', 'hairB1', [0, -.4, 0]); b.n('hairB3', 'hairB2', [0, -.4, 0]);
    b.p('hairB1', 'b', [.8, .46, .12, .05, 1], { c: pal.hair, o: [0, -.18, .02] }); b.p('hairB2', 'b', [.7, .46, .1, .05, 1], { c: shade(pal.hair, .94), o: [0, -.18, 0] }); b.p('hairB3', 'b', [.46, .4, .08, .05, 1], { c: shade(pal.hair, .88), o: [0, -.16, 0] });
    // chapéu pontudo articulado
    b.n('hat1', 'head', [0, .9, -.04], [-6, 0, 0]); b.n('hat2', 'hat1', [0, .46, 0]); b.n('hat3', 'hat2', [0, .34, 0]);
    b.p('hat1', 'c', [.58, .58, .07, 14], { c: pal.hair, o: [0, 0, 0], og: 'hat' }); b.p('hat1', 'c', [.45, .56, .5, 10, false], { c: pal.hair, o: [0, .24, 0], og: 'hat' });
    b.p('hat1', 'c', [.5, .56, .14, 10, false], { c: trim, o: [0, .07, 0], og: 'hat', shiny: true });
    b.p('hat2', 'c', [.22, .44, .4, 8, false], { c: pal.hair, o: [0, .1, 0], og: 'hat' }); b.p('hat3', 'c', [0, .24, .4, 8], { c: shade(pal.hair, .92), o: [0, .12, 0], og: 'hat' });
    b.p('hat3', 's', [.07, .07, .07, 6, 5], { c: trim, o: [0, .3, 0], emis: true, shiny: true });
    // cajado + orbe
    const st = b.N.wpR; st.rest = [0, 0, 8]; b.rig.keepUp = ['wpR'];
    b.p(st, 'c', [.05, .05, 2.4, 7], { c: '#5a3d24', o: [0, .3, 0], og: 'staff' }); b.p(st, 'c', [.09, .06, .12, 7], { c: trim, o: [0, 1.42, 0], shiny: true, og: 'staff' });
    b.n('orb', st, [0, 1.68, 0]); b.p('orb', 's', [.2, .2, .2, 9, 7], { c: pal.glow || trim, emis: true, shiny: true, tag: 'orb' });
    b.n('orbit', 'orb', [0, 0, 0]); for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283; b.n('sat' + i, 'orbit', [Math.cos(a) * .36, Math.sin(a * 2) * .06, Math.sin(a) * .36]); b.p('sat' + i, 's', [.055, .055, .055, 6, 5], { c: pal.glow || trim, emis: true, shiny: true, tag: 'sat' }); }
    b.rig.sw = [{ n: 'skF', ax: 0, base: -3, amp: 5, f: 1.9, ph: 0, vk: -34 }, { n: 'skB', ax: 0, base: 3, amp: 5, f: 1.7, ph: 1, vk: 30 },
    { n: 'hairB1', ax: 0, base: 3, amp: 3, f: 1.8, ph: 0, vk: 18 }, { n: 'hairB2', ax: 0, base: 4, amp: 5, f: 1.8, ph: .8, vk: 18 }, { n: 'hairB3', ax: 0, base: 4, amp: 6, f: 1.8, ph: 1.6, vk: 18 },
    { n: 'hairS1', ax: 2, base: 4, amp: 5, f: 2.2, ph: 0, vk: 0 }, { n: 'hairS-1', ax: 2, base: -4, amp: 5, f: 2.2, ph: 1, vk: 0 }, { n: 'hat2', ax: 0, base: -8, amp: 4, f: 1.7, ph: 0, vk: -16 }, { n: 'hat3', ax: 0, base: -14, amp: 6, f: 1.7, ph: .9, vk: -16 }];
    b.rig.def = { ready: { armR: [-24, 0, -14], elbowR: [-52, 0, 0], handR: [0, 0, 0], armL: [-12, 0, 10], elbowL: [-24, 0, 0] }, readyW: { R: .9, L: .25 }, aura: pal.glow, orbCol: pal.glow || trim, orbit: true, fit: .78 };
    b.rig.wp = ['wpR']; return b.rig;
  };

  BUILD.Ninja = (pal, opt) => {
    const b = new B('Ninja', pal), tone = TONE.Ninja; skeleton(b, { legW: .16 });
    const wrap = pal.accent, steel = '#aab4c2';
    body(b, { pants: shade(pal.body, .9), shirt: pal.body, sleeve: pal.body, forearm: shade(wrap, .65), boot: '#1a1c24', skin: tone, torsoW: .7, shin: shade(wrap, .6), waist: shade(pal.body, .8), fist: .11 });
    head(b, { skin: tone, eye: EYEC.Ninja, hair: pal.hair, mask: mixc(wrap, '#000', .35) }, {});
    b.p('head', 'b', [1.04, .5, .9, .24, 2], { c: pal.hair, o: [0, .74, -.06], og: 'hair' });
    b.p('head', 'b', [.99, .12, .12, .05, 1], { c: pal.hair, o: [0, .56, -.5], og: 'hair' });
    spikes(b, pal.hair, TOPSP(4, .94, .6, .3, .12)); spikes(b, pal.hair, BANGS([-.32, -.1, .12, .34], .86, .2, .11));
    b.p('head', 'b', [1.04, .15, .96, .05, 1], { c: '#20262f', o: [0, .62, -.02], og: 'band' }); b.p('head', 'b', [.3, .14, .05, .03, 1], { c: steel, o: [0, .62, .49], shiny: true, og: 'band' });
    b.p('head', 'c', [.03, .03, .07, 4], { c: wrap, o: [0, .62, .52], ro: [90, 0, 0], emis: true });
    for (const s of [1, -1]) { b.n('twin' + s, 'head', [s * .5, .74, -.1], [0, 0, s * 25]); b.n('twinB' + s, 'twin' + s, [0, -.3, 0]); b.p('twin' + s, 'b', [.22, .34, .22, .08, 1], { c: pal.hair, o: [0, -.1, 0] }); b.p('twinB' + s, 'b', [.18, .34, .18, .07, 1], { c: shade(pal.hair, .9), o: [0, -.12, 0] }); b.p('twinB' + s, 's', [.1, .1, .1, 6, 5], { c: wrap, o: [0, -.3, 0] }); }
    for (const s of ['L', 'R']) { b.p('elbow' + s, 'b', [.23, .22, .24, .06, 1], { c: shade(wrap, .7), o: [0, -.16, 0], og: 'wr' + s }); b.p('knee' + s, 'b', [.27, .12, .29, .05, 1], { c: shade(wrap, .6), o: [0, -.16, 0] }); }
    b.p('spine', 'b', [.66, .1, .44, .03, 1], { c: wrap, o: [0, -.02, 0], og: 'belt' });
    b.p('chest', 'b', [.5, .06, .5, .02, 1], { c: shade(wrap, .7), o: [0, .5, 0] });
    // cachecol em 3 segmentos
    b.n('scf1', 'neck', [0, .02, -.14]); b.n('scf2', 'scf1', [0, 0, -.36]); b.n('scf3', 'scf2', [0, 0, -.36]);
    b.p('neck', 'b', [.46, .2, .42, .08, 1], { c: wrap, o: [0, .0, 0], og: 'scarf0' });
    b.p('scf1', 'b', [.24, .06, .4, .02, 1], { c: wrap, o: [0, 0, -.14], og: 'scf' }); b.p('scf2', 'b', [.22, .05, .4, .02, 1], { c: shade(wrap, .88), o: [0, 0, -.14], og: 'scf' }); b.p('scf3', 'pr', [[[-.1, 0], [.1, 0], [.12, -.36], [0, -.46], [-.12, -.36]], .05], { c: shade(wrap, .78), o: [0, 0, 0], ro: [90, 0, 0], og: 'scf' });
    // lâminas curtas (kunai) nas mãos + espada às costas + shuriken
    b.N.wpR.rest = [160, 0, 0]; b.N.wpL.rest = [160, 0, 0];
    for (const s of ['wpR', 'wpL']) { b.p(s, 'bl', [.62, .14, .05, .26, 0], { c: '#c9d2de', shiny: true, o: [0, .1, 0], ro: [0, 90, 0], tag: 'kunai' }); b.p(s, 'c', [.04, .04, .22, 6], { c: '#222', o: [0, -.02, 0], tag: 'kunai' }); b.p(s, 's', [.07, .07, .03, 7, 5], { c: wrap, o: [0, -.16, 0], tag: 'kunai' }); }
    b.n('back', 'chest', [0, .25, -.3], [0, 0, 36]); b.p('back', 'b', [.08, 1.0, .08, .03, 1], { c: '#241a22', o: [0, .1, 0] }); b.p('back', 'b', [.26, .05, .1, .02, 1], { c: wrap, o: [0, -.38, 0] }); b.p('back', 'c', [.04, .04, .22, 6], { c: '#1a1018', o: [0, -.5, 0] });
    b.n('star', 'chest', [.0, .04, -.3]); b.p('star', 'pr', [[[0, .22], [.06, .06], [.22, 0], [.06, -.06], [0, -.22], [-.06, -.06], [-.22, 0], [-.06, .06]], .03], { c: '#b8c2d0', shiny: true, o: [0, 0, 0] });
    b.rig.sw = [{ n: 'scf1', ax: 0, base: -4, amp: 6, f: 3, ph: 0, vk: -24 }, { n: 'scf2', ax: 0, base: -8, amp: 9, f: 3, ph: .8, vk: -24 }, { n: 'scf3', ax: 0, base: -10, amp: 14, f: 3, ph: 1.6, vk: -24 },
    { n: 'twin1', ax: 2, base: 0, amp: 5, f: 2.4, ph: 0, vk: 0 }, { n: 'twin-1', ax: 2, base: 0, amp: 5, f: 2.4, ph: 1, vk: 0 }, { n: 'twinB1', ax: 0, base: 4, amp: 6, f: 2.4, ph: .7, vk: 24 }, { n: 'twinB-1', ax: 0, base: 4, amp: 6, f: 2.4, ph: 1.4, vk: 24 }];
    b.rig.def = { ready: { armR: [-44, 0, -16], elbowR: [-88, 0, 0], armL: [-34, 0, 18], elbowL: [-78, 0, 0] }, readyW: { R: .9, L: .9 }, crouch: .09, trail: [{ n: 'wpR', a: [0, .1, 0], b: [0, .72, 0], col: [200, 220, 255] }, { n: 'wpL', a: [0, .1, 0], b: [0, .72, 0], col: [160, 255, 240] }], aura: pal.glow };
    b.rig.wp = ['wpR', 'wpL']; return b.rig;
  };

  BUILD.Lutador = (pal, opt) => {
    const b = new B('Lutador', pal), tone = TONE.Lutador; skeleton(b, { shW: .52, legW: .18 });
    const gi = pal.body, band = pal.accent;
    body(b, { pants: mixc(gi, '#e8dcc0', .38), shirt: tone, sleeve: tone, forearm: tone, boot: shade(gi, .55), skin: tone, torsoW: .84, armW: .27, waist: shade(gi, .9), fist: .16, shin: mixc(gi, '#e8dcc0', .38) });
    head(b, { skin: tone, eye: EYEC.Lutador, hair: pal.hair, scar: true }, {});
    // colete aberto, faixa, cabelo espetado
    for (const sg of [1, -1]) b.p('chest', 'b', [.28, .56, .1, .05, 1], { c: gi, o: [sg * .27, .22, .22], og: 'vest', ro: [0, sg * -8, 0] });
    b.p('spine', 'b', [.7, .12, .46, .04, 1], { c: band, o: [0, -.02, 0], og: 'belt' });
    for (const s of ['L', 'R']) { b.p('elbow' + s, 'b', [.29, .1, .27, .04, 1], { c: band, o: [0, -.16, 0], og: 'wr' + s }); b.p('foot' + s, 'b', [.34, .08, .5, .03, 1], { c: band, o: [0, .02, .05], og: 'fb' + s }); b.p('knee' + s, 'b', [.3, .08, .3, .03, 1], { c: band, o: [0, -.2, 0] }); }
    b.p('head', 'b', [1.04, .46, .9, .24, 2], { c: pal.hair, o: [0, .74, -.06], og: 'hair' });
    spikes(b, pal.hair, TOPSP(6, .93, .78, .42, .15)); spikes(b, pal.hair, BANGS([-.28, .0, .3], .88, .24, .12));
    b.p('head', 'b', [1.04, .15, .96, .05, 1], { c: band, o: [0, .66, -.02], og: 'band' });
    b.n('bnd1', 'head', [0, .66, -.5]); b.n('bnd2', 'bnd1', [0, 0, -.3]); b.n('bnd3', 'bnd2', [0, 0, -.3]);
    b.p('bnd1', 'b', [.16, .08, .34, .02, 1], { c: band, o: [0, 0, -.1] }); b.p('bnd2', 'b', [.15, .07, .34, .02, 1], { c: shade(band, .88), o: [0, 0, -.1] }); b.p('bnd3', 'pr', [[[-.07, 0], [.07, 0], [0, -.26]], .05], { c: shade(band, .8), o: [0, 0, 0], ro: [90, 0, 0] });
    b.n('bndB1', 'head', [.06, .66, -.5], [0, 20, 0]); b.n('bndB2', 'bndB1', [0, 0, -.3]); b.p('bndB1', 'b', [.14, .07, .32, .02, 1], { c: shade(band, .9), o: [0, 0, -.1] }); b.p('bndB2', 'pr', [[[-.06, 0], [.06, 0], [0, -.24]], .05], { c: shade(band, .75), ro: [90, 0, 0] });
    // aura de ki (esferas emissivas nas mãos)
    for (const s of ['L', 'R']) { b.n('ki' + s, 'wp' + s, [0, -.12, .02]); blob(b, 'ki' + s, .12, pal.glow || '#5cf0a0', { tag: 'ki' }); b.N['ki' + s].hide = true; }
    b.rig.sw = [{ n: 'bnd1', ax: 0, base: -2, amp: 5, f: 3.2, ph: 0, vk: -18 }, { n: 'bnd2', ax: 0, base: -6, amp: 9, f: 3.2, ph: .8, vk: -22 }, { n: 'bnd3', ax: 0, base: -8, amp: 14, f: 3.2, ph: 1.6, vk: -22 },
    { n: 'bndB1', ax: 0, base: -2, amp: 6, f: 3.0, ph: .5, vk: -18 }, { n: 'bndB2', ax: 0, base: -8, amp: 12, f: 3.0, ph: 1.3, vk: -22 }];
    b.rig.def = { ready: { armR: [-30, 0, -22], elbowR: [-96, 0, 0], armL: [-44, 0, 20], elbowL: [-90, 0, 0] }, readyW: { R: .9, L: .9 }, crouch: .06, aura: pal.glow, kiCol: pal.glow || '#5cf0a0' };
    b.rig.wp = ['wpR', 'wpL']; return b.rig;
  };

  BUILD.Vampiro = (pal, opt) => {
    const b = new B('Vampiro', pal), tone = TONE.Vampiro; skeleton(b, { legW: .16 });
    const coatC = pal.body, red = pal.accent, lining = mixc(red, '#000', .25);
    body(b, { pants: shade(coatC, .75), shirt: coatC, sleeve: coatC, forearm: shade(coatC, .9), boot: '#140c10', skin: tone, torsoW: .74, waist: shade(coatC, .8), fist: .11 });
    head(b, { skin: tone, eye: EYEC.Vampiro, hair: pal.hair, fangs: true, blush: false }, { noEars: true });
    // orelhas pontudas (cones laterais, tom um pouco mais claro) e cabelo bagunçado
    for (const sg of [1, -1]) { b.p('head', 'c', [0, .1, .46, 6], { c: mixc(tone, '#ffd8d0', .15), o: [sg * .64, .46, -.02], ro: [0, 0, sg * -75], og: 'ear' + sg }); }
    b.p('head', 'b', [1.06, .56, .96, .25, 2], { c: pal.hair, o: [0, .7, -.07], og: 'hair' });
    b.p('head', 'b', [1.0, .3, .12, .08, 1], { c: pal.hair, o: [0, .56, -.5], og: 'hair' });
    spikes(b, pal.hair, TOPSP(6, .93, .8, .36, .13)); spikes(b, pal.hair, BANGS([-.34, -.12, .1, .32], .88, .36, .13));
    // gola alta, camisa e broche
    b.p('chest', 'b', [.84, .22, .58, .09, 1], { c: shade(coatC, 1.15), o: [0, .5, -.02], og: 'collar' });
    for (const sg of [1, -1]) b.p('chest', 'pr', [[[0, 0], [.2, 0], [.16, .3], [-.02, .14]], .06], { c: lining, o: [sg * .28, .5, .02], ro: [0, sg * 16, 0], og: 'lapel' });
    b.p('chest', 'b', [.24, .36, .06, .03, 1], { c: '#e8e4ee', o: [0, .25, .24], og: 'shirt' });
    b.p('chest', 's', [.07, .07, .05, 7, 5], { c: pal.glow || red, emis: true, o: [0, .4, .3], shiny: true });
    b.p('spine', 'b', [.64, .1, .44, .03, 1], { c: lining, o: [0, -.02, 0], og: 'belt' });
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1; b.p('elbow' + s, 'b', [.25, .1, .26, .04, 1], { c: red, o: [0, -.2, 0], og: 'cf' + s });
      for (let i = 0; i < 3; i++) b.p('hand' + s, 'c', [.028, 0, .2, 5], { c: '#ece6f2', o: [(i - 1) * .06, -.22, .03], tag: 'claw' });
    }
    b.p('arm' + 'L', 'b', [.34, .12, .34, .06, 1], { c: lining, o: [.04, .12, 0], og: 'padL' }); b.p('arm' + 'R', 'b', [.34, .12, .34, .06, 1], { c: lining, o: [-.04, .12, 0], og: 'padR' });
    // casaco longo (painéis) e capa rasgada articulada
    for (const [nm, x, z] of [['coatFL', .2, .21], ['coatFR', -.2, .21]]) { b.n(nm, 'hips', [x, -.1, z]); b.p(nm, 'b', [.3, .5, .06, .03, 1], { c: coatC, o: [0, -.25, 0], og: nm }); b.p(nm, 'b', [.31, .04, .07, .02, 1], { c: red, o: [0, -.48, 0], og: nm }); }
    b.n('cape1', 'chest', [0, .46, -.26]); b.n('cape2', 'cape1', [0, -.46, 0]); b.n('cape3', 'cape2', [0, -.46, 0]);
    b.p('cape1', 'b', [.9, .5, .06, .02, 1], { c: red, o: [0, -.22, 0], og: 'cape' }); b.p('cape2', 'b', [.86, .5, .06, .02, 1], { c: shade(red, .88), o: [0, -.24, 0], og: 'cape2' });
    b.p('cape3', 'b', [.82, .3, .06, .02, 1], { c: shade(red, .78), o: [0, -.14, 0], og: 'cape3' });
    for (let i = 0; i < 4; i++) b.p('cape3', 'pr', [[[-.1, 0], [.1, 0], [i % 2 ? .02 : -.02, -(.3 + (i % 3) * .1)]], .06], { c: shade(red, .72), o: [-.31 + i * .205, -.28, 0], ro: [0, 0, (i - 1.5) * 4], og: 'cape3' });
    b.p('cape1', 'b', [.94, .08, .08, .02, 1], { c: shade(coatC, 1.1), o: [0, .02, .0], og: 'cape' });
    // morcegos para a magia de enxame (ocultos fora das ações)
    b.n('bats', b.rig.root, [0, 1.2, 0]); for (let i = 0; i < 4; i++) {
      const a = i / 4 * 6.283; b.n('bat' + i, 'bats', [Math.cos(a) * .9, Math.sin(a * 2) * .2, Math.sin(a) * .9]);
      b.p('bat' + i, 'pr', [[[0, 0], [.3, .12], [.22, -.04], [.12, -.1], [0, -.06]], .03], { c: '#171018', o: [0, 0, 0], tag: 'bat', dbl: true }); b.p('bat' + i, 'pr', [[[0, 0], [-.3, .12], [-.22, -.04], [-.12, -.1], [0, -.06]], .03], { c: '#171018', tag: 'bat', dbl: true }); b.p('bat' + i, 's', [.06, .06, .08, 6, 5], { c: '#2b1c26', tag: 'bat' });
    }
    b.N.bats.hide = true;
    b.rig.sw = [{ n: 'coatFL', ax: 0, base: -4, amp: 5, f: 2.2, ph: 0, vk: -28 }, { n: 'coatFR', ax: 0, base: -4, amp: 5, f: 2.2, ph: 1, vk: -28 },
    { n: 'cape1', ax: 0, base: 5, amp: 3, f: 2.0, ph: 0, vk: 40 }, { n: 'cape2', ax: 0, base: 8, amp: 7, f: 2.0, ph: .9, vk: 34 }, { n: 'cape3', ax: 0, base: 10, amp: 10, f: 2.0, ph: 1.8, vk: 30 }];
    b.rig.def = { ready: { armR: [-24, 0, -22], elbowR: [-60, 0, 0], handR: [-10, 0, 0], armL: [-18, 0, 24], elbowL: [-52, 0, 0] }, readyW: { R: .85, L: .85 }, trail: [{ n: 'wpR', a: [-.1, -.1, 0], b: [.1, -.5, .2], col: [255, 90, 120] }, { n: 'wpL', a: [-.1, -.1, 0], b: [.1, -.5, .2], col: [255, 90, 120] }], aura: pal.glow, bats: true };
    b.rig.wp = ['wpR', 'wpL']; return b.rig;
  };

  /* ================= ANIMAÇÃO ================= */
  const sm = (t) => t * t * (3 - 2 * t), eIn = (t) => t * t, eOut = (t) => 1 - (1 - t) * (1 - t);
  // avalia keyframes [[p, pose, ease?], ...] → pose interpolada por nó
  function evalKeys(keys, p) {
    const names = new Set(); keys.forEach(k => Object.keys(k[1]).forEach(n => names.add(n))); const out = {};
    for (const n of names) {
      let ks = keys.filter(k => k[1][n]); if (ks[0][0] > keys[0][0]) ks = [[keys[0][0], { [n]: [0, 0, 0] }, 'lin']].concat(ks); let a = null, bb = null;
      for (const k of ks) { if (k[0] <= p) a = k; if (k[0] > p && !bb) bb = k; }
      if (!a) { out[n] = ks[0][1][n]; continue; } if (!bb) { out[n] = a[1][n]; continue; }
      let t = (p - a[0]) / (bb[0] - a[0]); const e = bb[2]; t = e === 'in' ? eIn(t) : e === 'out' ? eOut(t) : e === 'lin' ? t : sm(t);
      const va = a[1][n], vb = bb[1][n]; out[n] = [lerp(va[0] || 0, vb[0] || 0, t), lerp(va[1] || 0, vb[1] || 0, t), lerp(va[2] || 0, vb[2] || 0, t)];
    }
    return out;
  }
  const mirror = (pose) => { const o = {}; for (const k in pose) { const nk = k.replace(/L$/, '#').replace(/R$/, 'L').replace(/#$/, 'R'); o[nk] = [pose[k][0], -(pose[k][1] || 0), -(pose[k][2] || 0)]; } return o; };

  /* ações: dur (s), keys, trail:[p0,p1], face, hold. Poses no sistema: rx negativo = frente/levanta; hips.p = deslocamento [x,y,z] (z=frente). */
  const ACT = {};
  const common = {
    hit: { dur: .5, face: 'hurt', keys: [[0, { chest: [0, 0, 0], head: [0, 0, 0] }], [.18, { chest: [-14, 0, 4], head: [-22, 0, 6], armR: [10, 0, -30], armL: [10, 0, 30], elbowR: [-30], elbowL: [-30], 'hips.p': [0, -.04, -.22] }, 'out'], [1, { chest: [0, 0, 0], head: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    die: {
      dur: 1.15, face: 'dead', hold: true, keys: [[0, { chest: [0, 0, 0] }], [.3, { chest: [-18, 0, 0], head: [-26, 0, 8], armR: [20, 0, -50], armL: [20, 0, 50], legL: [-20, 0, 0], legR: [14, 0, 0], kneeL: [30], kneeR: [14], 'hips.p': [0, -.12, -.3] }, 'out'],
      [.7, { chest: [-30, 0, 0], head: [-14, 0, 10], armR: [-10, 0, -70], armL: [-10, 0, 70], legL: [-70, 0, 0], legR: [-60, 0, 0], kneeL: [80], kneeR: [70], 'hips.p': [0, -.5, -.5], hips: [-60, 0, 0] }, 'in'], [1, { chest: [-6, 0, 0], head: [-10, 0, 8], armR: [-6, 0, -80], armL: [-6, 0, 80], legL: [-80, 0, 0], legR: [-76, 0, 0], kneeL: [90], kneeR: [86], 'hips.p': [0, -.78, -.7], hips: [-84, 0, 0] }, 'out']]
    },
    win: {
      dur: 1.7, face: 'happy', loop: true, keys: [[0, { armR: [-20, 0, -20], armL: [-20, 0, 20], elbowR: [-60], elbowL: [-60], 'hips.p': [0, 0, 0], chest: [0, 0, 0] }], [.25, { armR: [-150, 0, -26], elbowR: [-20], armL: [-20, 0, 20], elbowL: [-60], chest: [-6, 14, 0], head: [-6, 10, 0], 'hips.p': [0, .1, 0] }],
      [.5, { armR: [-160, 0, -16], elbowR: [-10], armL: [-20, 0, 20], elbowL: [-60], chest: [-8, 0, 0], 'hips.p': [0, 0, 0] }], [.75, { armR: [-150, 0, -26], elbowR: [-20], chest: [-6, -14, 0], 'hips.p': [0, .1, 0] }], [1, { armR: [-20, 0, -20], armL: [-20, 0, 20], elbowR: [-60], elbowL: [-60], chest: [0, 0, 0], 'hips.p': [0, 0, 0] }]]
    }
  };

  // --- Espadachim: corte largo em arco e investida giratória ---
  ACT.Espadachim = Object.assign({}, common, {
    atk: {
      dur: .55, face: 'angry', trail: [.3, .62], keys: [
        [0, { armR: [-38, 0, -12], elbowR: [-82], chest: [0, 0, 0], 'hips.p': [0, 0, 0] }],
        [.28, { armR: [-96, -30, -62], elbowR: [-70], armL: [-40, 0, 24], chest: [4, -42, 0], head: [0, 28, 0], hips: [0, -16, 0], legR: [16, 0, 0], legL: [-24, 0, 0], kneeR: [20], 'hips.p': [0, -.05, -.06] }, 'out'],
        [.52, { armR: [-86, 20, 8], elbowR: [-18], armL: [-30, 0, 30], chest: [8, 56, 0], head: [0, -34, 0], hips: [0, 24, 0], legL: [-34, 0, 0], legR: [20, 0, 0], kneeL: [26], 'hips.p': [0, -.06, .3] }, 'in'],
        [.8, { armR: [-70, 30, 14], elbowR: [-30], chest: [4, 40, 0], head: [0, -20, 0], 'hips.p': [0, -.02, .26] }], [1, { armR: [-38, 0, -12], elbowR: [-82], chest: [0, 0, 0], 'hips.p': [0, 0, 0] }]]
    },
    cast: { dur: .6, face: 'angry', trail: [.3, .55], keys: [[0, { armR: [-38, 0, -12], elbowR: [-82] }], [.3, { armR: [-130, 0, -20], elbowR: [-40], chest: [-10, -10, 0], 'hips.p': [0, -.04, -.1] }, 'out'], [.55, { armR: [-70, 14, 4], elbowR: [-6], chest: [10, 20, 0], 'hips.p': [0, -.05, .22] }, 'in'], [1, { armR: [-38, 0, -12], elbowR: [-82], chest: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    spec: {
      dur: 1.27, face: 'angry', trail: [.28, .72], keys: [
        [0, { armR: [-38, 0, -12], armL: [-26, 0, 14], elbowR: [-82], elbowL: [-70], chest: [0, 0, 0], 'hips.p': [0, 0, 0] }],
        [.2, { armR: [-70, 0, -70], armL: [-70, 0, 70], elbowR: [-60], elbowL: [-60], chest: [-12, 0, 0], head: [-10, 0, 0], hips: [0, 0, 0], legL: [-14, 0, 6], legR: [-14, 0, -6], kneeL: [24], kneeR: [24], 'hips.p': [0, -.16, -.12] }, 'out'],
        [.3, { armR: [-100, 0, -92], armL: [-100, 0, 92], elbowR: [-20], elbowL: [-20], chest: [-16, -40, 0], hips: [0, -24, 0], 'hips.p': [0, -.22, -.18] }],
        [.4, { armR: [-86, 60, 12], armL: [-86, -60, -12], elbowR: [-14], elbowL: [-14], chest: [14, 70, 0], hips: [0, 40, 0], legR: [20, 0, 0], legL: [-40, 0, 0], kneeL: [36], 'hips.p': [0, -.12, .5] }, 'in'],
        [.56, { armR: [-86, 80, 12], armL: [-86, -80, -12], chest: [12, 220, 0], hips: [0, 150, 0], 'hips.p': [0, -.1, .6] }, 'lin'],
        [.7, { armR: [-86, 60, 12], armL: [-86, -60, -12], chest: [10, 380, 0], hips: [0, 300, 0], 'hips.p': [0, -.08, .5] }, 'lin'],
        [.84, { armR: [-60, 0, -30], armL: [-50, 0, 30], elbowR: [-60], elbowL: [-50], chest: [8, 360, 0], hips: [0, 340, 0], 'hips.p': [0, -.06, .3] }], [1, { armR: [-38, 0, -12], armL: [-26, 0, 14], elbowR: [-82], elbowL: [-70], chest: [0, 360, 0], hips: [0, 360, 0], 'hips.p': [0, 0, 0] }]]
    }
  });
  // --- Mago: cajado, orbe e raio ---
  ACT.Mago = Object.assign({}, common, {
    atk: { dur: .6, face: 'cast', keys: [[0, { armR: [-24, 0, -14], elbowR: [-52], wpR: [4, 0, 0] }], [.3, { armR: [-100, 0, -10], elbowR: [-30], chest: [-8, 0, 0], wpR: [-25, 0, 0], 'hips.p': [0, -.03, -.05] }, 'out'], [.5, { armR: [-74, 0, -4], elbowR: [-10], chest: [10, 0, 0], wpR: [70, 0, 0], 'hips.p': [0, -.04, .12] }, 'in'], [1, { armR: [-24, 0, -14], elbowR: [-52], wpR: [4, 0, 0], chest: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    cast: { dur: .9, face: 'cast', keys: [[0, { armR: [-24, 0, -14], elbowR: [-52], armL: [-12, 0, 10], elbowL: [-24], wpR: [4, 0, 0] }], [.3, { armR: [-90, 0, -30], elbowR: [-70], armL: [-100, 0, 30], elbowL: [-70], chest: [-8, 0, 0], head: [-14, 0, 0], wpR: [10, 0, 0], 'hips.p': [0, -.04, 0] }, 'out'], [.55, { armL: [-96, 0, 6], elbowL: [-20], armR: [-90, 0, -10], elbowR: [-16], chest: [8, 0, 0], wpR: [62, 0, 0], 'hips.p': [0, -.05, .1] }, 'in'], [1, { armR: [-24, 0, -14], elbowR: [-52], armL: [-12, 0, 10], elbowL: [-24], wpR: [4, 0, 0], chest: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    spec: {
      dur: 1.27, face: 'cast', keys: [[0, { armR: [-24, 0, -14], elbowR: [-52], armL: [-12, 0, 10], elbowL: [-24], wpR: [4, 0, 0] }],
      [.22, { armR: [-170, 0, -14], elbowR: [-12], armL: [-130, 0, 26], elbowL: [-30], chest: [-12, 0, 0], head: [-22, 0, 0], wpR: [0, 0, 0], 'hips.p': [0, .22, 0], legL: [-8, 0, 0], legR: [-8, 0, 0] }, 'out'],
      [.42, { armR: [-175, 0, -10], elbowR: [-6], armL: [-140, 0, 20], chest: [-16, 0, 0], head: [-26, 0, 0], wpR: [4, 0, 0], 'hips.p': [0, .34, 0] }],
      [.58, { armR: [-86, 0, -4], elbowR: [-6], armL: [-84, 0, 8], elbowL: [-10], chest: [18, 0, 0], head: [10, 0, 0], wpR: [76, 0, 0], 'hips.p': [0, -.1, .3], legL: [-30, 0, 0], legR: [20, 0, 0], kneeL: [30] }, 'in'],
      [.82, { armR: [-80, 0, -6], armL: [-70, 0, 12], chest: [12, 0, 0], wpR: [70, 0, 0], 'hips.p': [0, -.06, .26] }], [1, { armR: [-24, 0, -14], elbowR: [-52], armL: [-12, 0, 10], elbowL: [-24], wpR: [4, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], 'hips.p': [0, 0, 0], legL: [0, 0, 0], legR: [0, 0, 0], kneeL: [0] }]]
    }
  });
  // --- Ninja: golpes cruzados e investida em X ---
  ACT.Ninja = Object.assign({}, common, {
    atk: { dur: .4, face: 'angry', trail: [.2, .65], keys: [[0, { armR: [-44, 0, -16], elbowR: [-88], armL: [-34, 0, 18], elbowL: [-78] }], [.25, { armR: [-70, -40, -56], elbowR: [-60], armL: [-60, 20, 34], elbowL: [-70], chest: [6, -36, 0], 'hips.p': [0, -.1, -.08] }, 'out'], [.55, { armR: [-90, 30, 12], elbowR: [-14], armL: [-80, 60, 40], elbowL: [-40], chest: [14, 50, 0], hips: [0, 20, 0], 'hips.p': [0, -.12, .3] }, 'in'], [1, { armR: [-44, 0, -16], elbowR: [-88], armL: [-34, 0, 18], elbowL: [-78], chest: [0, 0, 0], hips: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    cast: { dur: .55, face: 'angry', keys: [[0, { armR: [-44, 0, -16], elbowR: [-88], armL: [-34, 0, 18], elbowL: [-78] }], [.3, { armR: [-130, 0, -30], elbowR: [-40], chest: [-8, -20, 0], 'hips.p': [0, -.08, 0] }, 'out'], [.5, { armR: [-86, 0, -4], elbowR: [-6], chest: [8, 14, 0] }, 'in'], [1, { armR: [-44, 0, -16], elbowR: [-88], armL: [-34, 0, 18], elbowL: [-78], chest: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    spec: {
      dur: 1.27, face: 'angry', trail: [.35, .75], keys: [[0, { armR: [-44, 0, -16], elbowR: [-88], armL: [-34, 0, 18], elbowL: [-78], 'hips.p': [0, 0, 0] }],
      [.2, { armR: [-76, 0, -10], armL: [-76, 0, 10], elbowR: [-100], elbowL: [-100], chest: [16, 0, 0], head: [10, 0, 0], legL: [-16, 0, 6], legR: [-16, 0, -6], kneeL: [40], kneeR: [40], 'hips.p': [0, -.3, -.05] }, 'out'],
      [.34, { armR: [-96, 0, -80], armL: [-96, 0, 80], elbowR: [-10], elbowL: [-10], chest: [10, 0, 0], 'hips.p': [0, -.32, -.1] }],
      [.46, { armR: [-100, 10, 36], armL: [-100, -10, -36], elbowR: [-6], elbowL: [-6], chest: [34, 0, 0], head: [-14, 0, 0], legL: [-60, 0, 0], legR: [30, 0, 0], kneeL: [50], 'hips.p': [0, -.2, .7] }, 'in'],
      [.62, { armR: [-70, 0, 60], armL: [-70, 0, -60], elbowR: [-4], elbowL: [-4], chest: [24, 0, 0], 'hips.p': [0, -.16, .9] }],
      [.82, { armR: [-60, 0, -20], armL: [-50, 0, 20], elbowR: [-70], elbowL: [-60], chest: [10, 0, 0], 'hips.p': [0, -.1, .5] }], [1, { armR: [-44, 0, -16], elbowR: [-88], armL: [-34, 0, 18], elbowL: [-78], chest: [0, 0, 0], head: [0, 0, 0], legL: [0, 0, 0], legR: [0, 0, 0], kneeL: [0], kneeR: [0], 'hips.p': [0, 0, 0] }]]
    }
  });
  // --- Lutador: socos, rajada e chute ---
  ACT.Lutador = Object.assign({}, common, {
    atk: { dur: .4, face: 'angry', keys: [[0, { armR: [-30, 0, -22], elbowR: [-96], armL: [-44, 0, 20], elbowL: [-90] }], [.3, { armR: [20, 0, -36], elbowR: [-110], armL: [-70, 0, 6], elbowL: [-60], chest: [0, -30, 0], hips: [0, -14, 0], 'hips.p': [0, -.06, -.1] }, 'out'], [.55, { armR: [-90, 0, -2], elbowR: [-4], armL: [-40, 0, 24], elbowL: [-100], chest: [8, 38, 0], hips: [0, 22, 0], legL: [-30, 0, 0], legR: [20, 0, 0], kneeL: [20], 'hips.p': [0, -.06, .3] }, 'in'], [1, { armR: [-30, 0, -22], elbowR: [-96], armL: [-44, 0, 20], elbowL: [-90], chest: [0, 0, 0], hips: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    cast: { dur: .7, face: 'angry', ki: [.3, .8], keys: [[0, { armR: [-30, 0, -22], elbowR: [-96], armL: [-44, 0, 20], elbowL: [-90] }], [.3, { armR: [10, 0, -60], armL: [10, 0, 60], elbowR: [-70], elbowL: [-70], chest: [-6, 0, 0], legL: [-14, 0, 8], legR: [-14, 0, -8], kneeL: [26], kneeR: [26], 'hips.p': [0, -.14, -.04] }, 'out'], [.55, { armR: [-90, -10, -10], armL: [-90, 10, 10], elbowR: [-6], elbowL: [-6], chest: [14, 0, 0], 'hips.p': [0, -.1, .14] }, 'in'], [1, { armR: [-30, 0, -22], elbowR: [-96], armL: [-44, 0, 20], elbowL: [-90], chest: [0, 0, 0], legL: [0, 0, 0], legR: [0, 0, 0], kneeL: [0], kneeR: [0], 'hips.p': [0, 0, 0] }]] },
    spec: {
      dur: 1.27, face: 'angry', ki: [.25, .7], keys: [[0, { armR: [-30, 0, -22], elbowR: [-96], armL: [-44, 0, 20], elbowL: [-90], 'hips.p': [0, 0, 0] }],
      [.22, { armR: [24, 0, -50], armL: [24, 0, 50], elbowR: [-40], elbowL: [-40], chest: [-14, 0, 0], head: [-10, 0, 0], legL: [-12, 0, 10], legR: [-12, 0, -10], kneeL: [34], kneeR: [34], 'hips.p': [0, -.24, -.08] }, 'out'],
      [.34, { armR: [60, 0, -70], armL: [60, 0, 70], elbowR: [-30], elbowL: [-30], chest: [-20, 0, 0], head: [-14, 0, 0], 'hips.p': [0, -.28, -.1] }],
      [.46, { armR: [-100, -20, -2], armL: [-100, 20, 2], elbowR: [-4], elbowL: [-4], chest: [22, 0, 0], head: [8, 0, 0], legL: [-40, 0, 0], legR: [26, 0, 0], kneeL: [30], 'hips.p': [0, -.14, .48] }, 'in'],
      [.7, { armR: [-96, -10, -2], armL: [-96, 10, 2], chest: [18, 0, 0], 'hips.p': [0, -.1, .5] }], [.88, { armR: [-50, 0, -20], armL: [-50, 0, 20], elbowR: [-60], elbowL: [-60], chest: [8, 0, 0], 'hips.p': [0, -.04, .2] }], [1, { armR: [-30, 0, -22], elbowR: [-96], armL: [-44, 0, 20], elbowL: [-90], chest: [0, 0, 0], head: [0, 0, 0], legL: [0, 0, 0], legR: [0, 0, 0], kneeL: [0], kneeR: [0], 'hips.p': [0, 0, 0] }]]
    }
  });
  // --- Vampiro: garras, névoa de morcegos e investida carmesim ---
  ACT.Vampiro = Object.assign({}, common, {
    atk: { dur: .5, face: 'angry', trail: [.28, .6], keys: [[0, { armR: [-24, 0, -22], elbowR: [-60], armL: [-18, 0, 24], elbowL: [-52] }], [.28, { armR: [-100, -20, -76], elbowR: [-40], armL: [-30, 0, 30], chest: [-4, -36, 0], hips: [0, -14, 0], 'hips.p': [0, -.06, -.08] }, 'out'], [.52, { armR: [-86, 40, 20], elbowR: [-6], armL: [-24, 0, 36], chest: [12, 52, 0], hips: [0, 24, 0], legL: [-30, 0, 0], legR: [22, 0, 0], kneeL: [22], 'hips.p': [0, -.07, .3] }, 'in'], [1, { armR: [-24, 0, -22], elbowR: [-60], armL: [-18, 0, 24], elbowL: [-52], chest: [0, 0, 0], hips: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    cast: { dur: .9, face: 'angry', bats: [.2, .95], keys: [[0, { armR: [-24, 0, -22], elbowR: [-60], armL: [-18, 0, 24], elbowL: [-52] }], [.3, { armR: [-30, 0, -100], armL: [-30, 0, 100], elbowR: [-30], elbowL: [-30], chest: [-12, 0, 0], head: [-14, 0, 0], 'hips.p': [0, -.06, 0], cape1: [-30, 0, 0] }, 'out'], [.6, { armR: [-96, 0, -30], armL: [-96, 0, 30], elbowR: [-10], elbowL: [-10], chest: [16, 0, 0], 'hips.p': [0, -.06, .16] }, 'in'], [1, { armR: [-24, 0, -22], elbowR: [-60], armL: [-18, 0, 24], elbowL: [-52], chest: [0, 0, 0], head: [0, 0, 0], 'hips.p': [0, 0, 0] }]] },
    spec: {
      dur: 1.27, face: 'angry', bats: [.3, .9], trail: [.4, .75], keys: [[0, { armR: [-24, 0, -22], elbowR: [-60], armL: [-18, 0, 24], elbowL: [-52], 'hips.p': [0, 0, 0] }],
      [.2, { armR: [-20, 0, -110], armL: [-20, 0, 110], elbowR: [-20], elbowL: [-20], chest: [-16, 0, 0], head: [-20, 0, 0], legL: [-8, 0, 8], legR: [-8, 0, -8], kneeL: [20], kneeR: [20], 'hips.p': [0, -.1, -.1] }, 'out'],
      [.34, { armR: [-30, 0, -140], armL: [-30, 0, 140], elbowR: [-10], elbowL: [-10], chest: [-22, 0, 0], head: [-26, 0, 0], 'hips.p': [0, .26, -.14], cape1: [-24, 0, 0] }],
      [.46, { armR: [-96, 30, -26], armL: [-90, -30, 26], elbowR: [-6], elbowL: [-6], chest: [28, 0, 0], head: [10, 0, 0], legL: [-50, 0, 0], legR: [26, 0, 0], kneeL: [40], 'hips.p': [0, -.1, .7] }, 'in'],
      [.62, { armR: [-100, 50, 10], armL: [-90, -50, -10], chest: [30, 0, 0], 'hips.p': [0, -.1, .9] }], [.85, { armR: [-50, 0, -40], armL: [-40, 0, 40], elbowR: [-40], elbowL: [-40], chest: [10, 0, 0], 'hips.p': [0, -.04, .4] }], [1, { armR: [-24, 0, -22], elbowR: [-60], armL: [-18, 0, 24], elbowL: [-52], chest: [0, 0, 0], head: [0, 0, 0], legL: [0, 0, 0], legR: [0, 0, 0], kneeL: [0], kneeR: [0], 'hips.p': [0, 0, 0] }]]
    }
  });

  const DURS = { idle: 2.4, walk: 1.2, run: .6 };
  const ANIMS = ['idle', 'walk', 'run', 'atk', 'cast', 'spec', 'hit', 'die', 'win'];
  const ANAMES = { idle: 'Parado', walk: 'Andar', run: 'Correr', atk: 'Ataque', cast: 'Magia / ranged', spec: 'Golpe final', hit: 'Dano', die: 'Morte', win: 'Vitória' };

  /* ---------- pose ---------- */
  function applyPose(rig, pose, w) {
    for (const k in pose) {
      const v = pose[k];
      if (k.endsWith('.p')) { const n = rig.N[k.slice(0, -2)]; if (n) { n.off[0] = lerp(n.off[0], (v[0] || 0), w); n.off[1] = lerp(n.off[1], (v[1] || 0), w); n.off[2] = lerp(n.off[2], (v[2] || 0), w); } continue; }
      const n = rig.N[k]; if (!n) continue; n.rot[0] = lerp(n.rot[0], v[0] || 0, w); n.rot[1] = lerp(n.rot[1], v[1] || 0, w); n.rot[2] = lerp(n.rot[2], v[2] || 0, w);
    }
  }
  // S: {t, anim, p, speed, phase}. anim: idle|walk|run|atk|cast|spec|hit|die|win. p: progresso da ação (0..1) — se omitido usa t/dur.
  function pose(rig, S) {
    const N = rig.N, def = rig.def, t = S.t || 0; rig.resetPose();
    // posição/giro/escala do corpo inteiro no mundo (mapa 3D): o resetPose zera a raiz, então reaplica aqui
    N.root.rot[1] = S.yaw || 0; if (S.pos) { N.root.off[0] = S.pos[0]; N.root.off[1] = S.pos[1]; N.root.off[2] = S.pos[2]; } const ks = S.scale || 1; N.root.scl[0] = N.root.scl[1] = N.root.scl[2] = ks;
    let anim = S.anim || 'idle', spd = S.speed !== undefined ? S.speed : (anim === 'walk' ? 1 : anim === 'run' ? 1.7 : 0); if (anim === 'idle') spd = S.speed || 0;
    const isAct = !!(ACT[rig.name] && ACT[rig.name][anim]);
    const phase = S.phase !== undefined ? S.phase : t * 6.283 / (anim === 'run' ? .6 : 1.2);
    const sp = Math.min(1.8, spd), A = lerp(0, 36 + 14 * Math.max(0, sp - 1), Math.min(1, sp)), sn = Math.sin(phase), cs = Math.cos(phase);
    // respiração e gingado
    const br = Math.sin(t * 6.283 / 2.4), cr = def.crouch || 0, idleW = 1 - Math.min(1, sp);
    const mv = Math.min(1, sp);
    N.hips.off[1] = -cr * idleW - .045 * Math.abs(cs) * mv + .014 * br * idleW; N.chest.rot[0] = 1.8 * br * idleW + 4 * sp; N.head.rot[1] = 4 * Math.sin(t * 6.283 / 4.8) * idleW; N.head.rot[0] = -2 * br * idleW;
    N.legL.rot[0] = -A * sn - 9 * idleW - cr * 150 * idleW; N.legR.rot[0] = A * sn + 12 * idleW - cr * 150 * idleW;
    N.kneeL.rot[0] = 52 * Math.max(0, cs) * mv + 12 * idleW + cr * 300 * idleW; N.kneeR.rot[0] = 52 * Math.max(0, -cs) * mv + 8 * idleW + cr * 300 * idleW;
    N.legL.rot[2] = (5 + (cr ? 8 : 0)) * idleW; N.legR.rot[2] = -(5 + (cr ? 8 : 0)) * idleW; N.hips.rot[1] = -6 * sn * mv; N.chest.rot[1] = 8 * sn * mv; N.head.rot[1] += -3 * sn * mv;
    // braços: balanço natural → pose de guarda do personagem
    const B = 34 * Math.min(1, sp) * (anim === 'run' ? 1.2 : 1);
    N.armL.rot[0] = B * sn; N.armR.rot[0] = -B * sn; N.elbowL.rot[0] = -(14 + 20 * Math.min(1, sp)); N.elbowR.rot[0] = -(14 + 20 * Math.min(1, sp));
    N.armL.rot[2] = 2 * br * idleW; N.armR.rot[2] = -2 * br * idleW;
    const rd = def.ready || {}, rw = def.readyW || {}, bob = Math.sin(t * 6.283 / 2.4 + 1) * 2;
    for (const s of ['R', 'L']) { const w = (rw[s] || 0) * (1 - .35 * Math.min(1, sp)); for (const k of ['arm', 'elbow', 'hand']) { const v = rd[k + s]; if (v) { const n = N[k + s]; n.rot[0] = lerp(n.rot[0], v[0] + (k === 'arm' ? bob : 0), w); n.rot[1] = lerp(n.rot[1], v[1] || 0, w); n.rot[2] = lerp(n.rot[2], v[2] || 0, w); } } }
    // compensa a orientação das armas segundo a pose (cajado sempre em pé etc.)
    // ação
    let p = 0, w = 0, extra = null;
    if (isAct) {
      const a = ACT[rig.name][anim]; p = S.p !== undefined ? S.p : clamp(t / a.dur, 0, 1);
      w = a.hold ? Math.min(1, p / .08) : Math.min(1, p / .1, (1 - p) / .14); w = sm(clamp(w, 0, 1)); if (a.loop) w = 1;
      applyPose(rig, evalKeys(a.keys, p), a.hold ? Math.min(1, p / .08 + .0) : w); extra = a;
    }
    if (S.hit > 0) applyPose(rig, evalKeys(ACT[rig.name].hit.keys, .18), clamp(S.hit, 0, 1) * .8);
    rig.speed = sp; rig.act = isAct ? anim : null; rig.actP = p; rig.actDef = extra;
    secondary(rig, t, sp, extra, p);
    if (rig.keepUp) for (const w of rig.keepUp) { const sd = w.slice(2), tilt = N[w].rot[0] + 4, sum = N['arm' + sd].rot[0] + N['elbow' + sd].rot[0] + N['hand' + sd].rot[0]; N[w].rot[0] = tilt - sum; }
    // efeitos
    const face = rig.face; if (face) { let e = 'idle'; if (extra) e = extra.face || 'angry'; else if (S.hit > .2) e = 'hurt'; else if (((t + 1.7) % 3.6) < .13) e = 'blink'; face.set(e); }
    const nd = rig.N; if (nd.bats) nd.bats.hide = !(extra && extra.bats && p > extra.bats[0] && p < extra.bats[1]);
    for (const s of ['L', 'R']) { const k = nd['ki' + s]; if (k) k.hide = !(extra && extra.ki && p > extra.ki[0] && p < extra.ki[1]); }
    if (nd.bats && !nd.bats.hide) { nd.bats.rot[1] = t * 380; for (let i = 0; i < 4; i++) { const b = nd['bat' + i]; b.rot[2] = Math.sin(t * 22 + i) * 40; b.rot[1] = 90; } }
    if (nd.orbit) { nd.orbit.rot[1] = t * 150; const big = extra && (anim === 'spec') ? 1 + 1.2 * Math.sin(clamp((p - .1) / .4, 0, 1) * 3.14) : 1; nd.orb.scl = [big, big, big]; }
    rig.t = t;
  }
  function secondary(rig, t, sp, act, p) {
    const burst = act && act.bats ? 1 : 0, flare = act ? 1 : 0;
    for (const s of rig.sw || []) { const n = rig.N[s.n]; if (!n) continue; const v = s.base + s.amp * Math.sin(t * 6.283 * Math.max(1, Math.round(s.f)) / 1.2 + s.ph) + (s.vk || 0) * Math.min(1, sp) * .5 + (s.ax === 0 ? (flare * (s.vk || 0) * .18) : 0); n.rot[s.ax || 0] += v; }
  }

  /* ---------- API pública ---------- */
  function build(name, pal, opt) { const rig = BUILD[name](Object.assign({ shadow: '#222' }, pal), opt || {}); rig.charName = name; rig.pal = pal; rig.opt = opt || {}; rig.pose = (S) => pose(rig, S); rig.update(); return rig; }
  // amostra do rastro de lâmina: guarda pontos mundiais (a,b) por quadro
  function trailSample(rig) {
    const def = rig.def; if (!def.trail) return; rig.trailHist = rig.trailHist || def.trail.map(() => []);
    const on = rig.act && rig.actDef && rig.actDef.trail && rig.actP > rig.actDef.trail[0] && rig.actP < rig.actDef.trail[1];
    def.trail.forEach((tr, i) => { const h = rig.trailHist[i]; if (on) { const nd = rig.N[tr.n]; if (nd && !(i == 1 && !rig.N[tr.n].parts.length)) { rig.update(); h.push([rig.world(nd, tr.a), rig.world(nd, tr.b)]); if (h.length > 9) h.shift(); } } else if (h.length) h.shift(); });
  }
  function drawTrails(rd, rig) { const def = rig.def; if (!def.trail || !rig.trailHist) return; def.trail.forEach((tr, i) => { const h = rig.trailHist[i]; if (h && h.length > 1) rd.trail(h, tr.col, .85); }); }
  function skinPal(name, idx) { const l = R3.SKINS[name] || []; const s = l[idx] || l[0] || {}; return { body: s.body || '#444', hair: s.hair || '#222', accent: s.accent || '#c9a04a', shadow: s.shadow || '#111', glow: s.glow || null, coat: !!s.coat }; }

  Object.assign(R3, { build, pose, ANIMS, ANAMES, ACT, DURS, trailSample, drawTrails, skinPal, TONE, EYEC, NAMES: Object.keys(BUILD), shade, mixc });
})(typeof window !== 'undefined' ? window : globalThis);

/* R3.World — mapa 3D: malhas em lote por cor, cenas (cidade, masmorra, lazer, arena), câmera orbital e monstros articulados. */
(function (G) {
  'use strict';
  const R3 = G.R3, { hex, palette, mkMesh, Rig, rbox, sphere, cyl, lerp, clamp } = R3;
  const ID = new Float32Array(16); ID[0] = ID[5] = ID[10] = ID[15] = 1;
  const IDN = { W: ID, hid: false };
  const mixc = R3.mixc, shade = R3.shade;
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };

  /* ---------- lote de geometria plana (normais por face) ---------- */
  class Batch {
    constructor(color, o) { this.color = color; this.o = o || {}; this.P = []; this.N = []; this.I = []; this.done = []; }
    _flush() { if (this.P.length) { this.done.push(mkMesh(this.P, this.N, this.I)); this.P = []; this.N = []; this.I = []; } }
    tri(a, b, c, n) {
      if (this.P.length / 3 + 3 > 65000) this._flush();
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (!n) { const l = Math.hypot(cx, cy, cz) || 1; n = [cx / l, cy / l, cz / l]; }
      const k = this.P.length / 3, flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
      const q = flip ? [a, c, b] : [a, b, c];
      for (const p of q) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); }
      this.I.push(k, k + 1, k + 2);
    }
    quad(a, b, c, d, n) { this.tri(a, b, c, n); this.tri(a, c, d, n); }
    // caixa alinhada aos eixos; skip: {top,bottom,px,nx,pz,nz}
    box(x0, y0, z0, x1, y1, z1, skip) {
      skip = skip || { bottom: true };
      if (!skip.px) this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]);
      if (!skip.nx) this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]);
      if (!skip.top) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
      if (!skip.bottom) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]);
      if (!skip.pz) this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]);
      if (!skip.nz) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
    }
    // caixa girada em torno de Y (centro cx,cz; tamanho sx,sz; yaw em graus)
    rbox(cx, y0, cz, sx, y1, sz, yaw, skip) {
      skip = skip || { bottom: true }; const a = yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hx = sx / 2, hz = sz / 2;
      const T = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
      const A = T(-hx, -hz), B = T(hx, -hz), C = T(hx, hz), D = T(-hx, hz);
      const wall = (p, q, n) => this.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], n);
      const nx = [c, 0, -s], nz = [s, 0, c];
      wall(B, C, nx); wall(D, A, [-nx[0], 0, -nx[2]]); wall(C, D, nz); wall(A, B, [-nz[0], 0, -nz[2]]);
      if (!skip.top) this.quad([A[0], y1, A[1]], [B[0], y1, B[1]], [C[0], y1, C[1]], [D[0], y1, D[1]], [0, 1, 0]);
    }
    // cilindro/disco (eixo Y), rx/rz permitem elipse
    cyl(cx, y0, cz, rx, rz, y1, seg, capTop) {
      seg = seg || 10; const P = (k, y) => { const a = k / seg * 2 * Math.PI; return [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz]; };
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * 2 * Math.PI, a1 = (k + 1) / seg * 2 * Math.PI, am = (a0 + a1) / 2, n = [Math.cos(am) / rx, 0, Math.sin(am) / rz], l = Math.hypot(n[0], n[2]); n[0] /= l; n[2] /= l;
        this.quad(P(k, y0), P(k + 1, y0), P(k + 1, y1), P(k, y1), n);
      }
      if (capTop !== false) for (let k = 0; k < seg; k++) this.tri([cx, y1, cz], P(k + 1, y1), P(k, y1), [0, 1, 0]);
    }
    // pirâmide/cone de base elíptica
    cone(cx, y0, cz, rx, rz, y1, seg) {
      seg = seg || 4; for (let k = 0; k < seg; k++) {
        const a0 = k / seg * 2 * Math.PI + Math.PI / seg, a1 = (k + 1) / seg * 2 * Math.PI + Math.PI / seg;
        this.tri([cx + Math.cos(a0) * rx, y0, cz + Math.sin(a0) * rz], [cx + Math.cos(a1) * rx, y0, cz + Math.sin(a1) * rz], [cx, y1, cz]);
      }
    }
    meshes() { this._flush(); return this.done; }
  }

  /* ---------- cena: lotes por bloco de 8x8 casas ---------- */
  class Scene {
    constructor(W, H) { this.W = W; this.H = H; this.CS = 8; this.cells = new Map(); this.lights = []; this.labels = []; this.chunks = []; this.state = {}; }
    b(x, z, key, color, o) {
      const ck = ((x / this.CS) | 0) + ',' + ((z / this.CS) | 0); let ch = this.cells.get(ck); if (!ch) { ch = new Map(); this.cells.set(ck, ch); }
      const k = key + color; let bt = ch.get(k); if (!bt) { bt = new Batch(color, o); ch.set(k, bt); } return bt;
    }
    finish() {
      this.chunks = [];
      for (const ch of this.cells.values()) {
        const parts = []; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        for (const bt of ch.values()) for (const m of bt.meshes()) {
          for (let i = 0; i < m.p.length; i += 3) for (let k = 0; k < 3; k++) { const v = m.p[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
          parts.push({ mesh: m, node: IDN, L: ID, pal: palette(bt.color, bt.o.shiny), color: bt.color, emis: !!bt.o.emis, shiny: !!bt.o.shiny, dbl: false, tex: null, og: bt.o.og || null, bias: bt.o.bias || 0, tag: '', side: bt.o.side || null, when: bt.o.when || null });
        }
        this.chunks.push({ parts, mn, mx });
      }
      this.cells = null; return this;
    }
  }

  const NIGHT = '#0a0a2a';
  const nt = (c, k) => mixc(c, NIGHT, k === undefined ? .2 : k);

  /* ---------- cenário: elementos comuns ---------- */
  function torchPost(sc, x, z, h, baseY) {
    baseY = baseY || 0;
    sc.b(x, z, 'tp', '#4a3020').cyl(x, baseY, z, .06, .06, baseY + h, 6);
    sc.b(x, z, 'tf', '#ffb02e', { emis: true, bias: .02 }).cyl(x, baseY + h, z, .13, .13, baseY + h + .26, 6);
    sc.b(x, z, 'tg', '#fff2a0', { emis: true, bias: .03 }).cyl(x, baseY + h + .05, z, .06, .06, baseY + h + .32, 5);
  }
  function barrel(sc, x, z, s) { s = s || 1; sc.b(x, z, 'bar', '#5a3a20').cyl(x, 0, z, .2 * s, .2 * s, .5 * s, 8); sc.b(x, z, 'barh', '#2a1a10').cyl(x, .08 * s, z, .21 * s, .21 * s, .12 * s, 8, false); sc.b(x, z, 'barh', '#2a1a10').cyl(x, .34 * s, z, .21 * s, .21 * s, .4 * s, 8, false); }
  function crate(sc, x, z, s, c) { s = s || 1; sc.b(x, z, 'cr', c || '#6b4a2a').box(x - .2 * s, 0, z - .2 * s, x + .2 * s, .4 * s, z + .2 * s); sc.b(x, z, 'crx', '#3a281a').box(x - .21 * s, .17 * s, z - .21 * s, x + .21 * s, .23 * s, z + .21 * s, { bottom: true }); }

  // telhado de duas águas: ridge ao longo do maior lado; o = beiral
  function gable(sc, x0, z0, x1, z1, wh, rh, o, roofC, wallC) {
    const w = x1 - x0, d = z1 - z0, alongX = w >= d, cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
    const R = sc.b(cxm, czm, 'roof', roofC), Rd = sc.b(cxm, czm, 'roofd', shade(roofC, .7)), Wl = sc.b(cxm, czm, 'gab', wallC);
    const e0x = x0 - o, e1x = x1 + o, e0z = z0 - o, e1z = z1 + o, ry = wh + rh;
    if (alongX) {
      R.quad([e0x, wh, e0z], [e1x, wh, e0z], [e1x, ry, czm], [e0x, ry, czm]); R.quad([e1x, wh, e1z], [e0x, wh, e1z], [e0x, ry, czm], [e1x, ry, czm]);
      Wl.tri([x0, wh, z0], [x0, wh, z1], [x0, ry, czm]); Wl.tri([x1, wh, z1], [x1, wh, z0], [x1, ry, czm]);
      Rd.box(e0x, ry - .05, czm - .05, e1x, ry + .06, czm + .05, { bottom: true });
    } else {
      R.quad([e0x, wh, e1z], [e0x, wh, e0z], [cxm, ry, e0z], [cxm, ry, e1z]); R.quad([e1x, wh, e0z], [e1x, wh, e1z], [cxm, ry, e1z], [cxm, ry, e0z]);
      Wl.tri([x1, wh, z0], [x0, wh, z0], [cxm, ry, z0]); Wl.tri([x0, wh, z1], [x1, wh, z1], [cxm, ry, z1]);
      Rd.box(cxm - .05, ry - .05, e0z, cxm + .05, ry + .06, e1z, { bottom: true });
    }
  }

  /* ---------- cidade ---------- */
  function buildCity(mp, blds, CW, CH) {
    const sc = new Scene(CW, CH);
    const road = (i, j) => (j >= 15 && j <= 17) || (i >= 22 && i <= 25);
    for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
      const border = i == 0 || j == 0 || i == CW - 1 || j == CH - 1, r = road(i, j), ch = (i + j) % 2;
      const gc = nt(r ? (ch ? '#3b362f' : '#413b33') : (ch ? '#4c463d' : '#544d43'), .12);
      sc.b(i, j, 'g', gc, { og: 'ground' }).quad([i, 0, j], [i, 0, j + 1], [i + 1, 0, j + 1], [i + 1, 0, j], [0, 1, 0]);
      if ((i * 7 + j * 13) % 5 == 0 && !border) { const d = sc.b(i, j, 'dec', mixc(gc, '#000', .3), { bias: .02 }); d.quad([i + .2, .005, j + .25], [i + .2, .005, j + .55], [i + .6, .005, j + .55], [i + .6, .005, j + .25], [0, 1, 0]); d.quad([i + .55, .005, j + .65], [i + .55, .005, j + .85], [i + .85, .005, j + .85], [i + .85, .005, j + .65], [0, 1, 0]); }
      if (border) {
        const wc = nt('#6b665a', .12); sc.b(i, j, 'bw', wc).box(i, 0, j, i + 1, 1.5, j + 1);
        sc.b(i, j, 'bt', nt('#8a8474', .12)).box(i + .06, 1.5, j + .06, i + .94, 1.62, j + .94, { bottom: true });
        if ((i + j) % 2 == 0) sc.b(i, j, 'bm', nt('#7d786a', .12)).box(i + .2, 1.62, j + .2, i + .8, 1.95, j + .8, { bottom: true });
      }
    }
    blds.forEach(b => building(sc, b));
    // tochas
    (mp.tr || []).forEach(([i, j]) => { torchPost(sc, i + .14, j + .14, 1.25); sc.lights.push({ x: i + .5, z: j + .5, y: 1.4, r: 3.6, a: .55 }); });
    // barris e caixas decorativos nos cantos das ruas
    blds.forEach(([bx, by, w, h, tp], n) => { if (tp == 'arena') return; const r = hash(bx, by); barrel(sc, bx + .35, by + h + .17); if (r > .4) crate(sc, bx + w - .35, by + h + .17, 1, r > .7 ? '#5b4632' : '#6b4a2a'); });
    return sc.finish();
  }
  function building(sc, [bx, by, w, h, tp, lb, rc]) {
    const x0 = bx, z0 = by, x1 = bx + w, z1 = by + h, cx = (x0 + x1) / 2;
    if (tp == 'arena') return colosseum(sc, x0, z0, x1, z1, lb);
    const WH = tp == 'templo' ? 3.4 : tp == 'loja' ? 2.7 : 2.3, wallC = nt(tp == 'templo' ? '#7a7a88' : tp == 'loja' ? '#6a5844' : '#6d5c49', .2), roofC = nt(rc, .12), wood = nt('#3b2c1e', .15);
    sc.b(cx, z0, 'plin', nt('#4b4a44', .2)).box(x0 - .06, 0, z0 - .06, x1 + .06, .3, z1 + .06);
    sc.b(cx, z0, 'wall', wallC).box(x0, .3, z0, x1, WH, z1, { bottom: true });
    // vigas de madeira na fachada sul e laterais
    for (let k = 0; k <= w; k++) sc.b(cx, z0, 'beam', wood).box(x0 + k - .06, .3, z1, x0 + k + .06, WH, z1 + .06);
    sc.b(cx, z0, 'beam', wood).box(x0, WH * .52, z1, x1, WH * .52 + .1, z1 + .05);
    sc.b(cx, z0, 'beam', wood).box(x0, .3, z0 - .04, x0 + .1, WH, z1 + .04); sc.b(cx, z0, 'beam', wood).box(x1 - .1, .3, z0 - .04, x1, WH, z1 + .04);
    const dk = (w / 2) | 0;
    for (let k = 0; k < w; k++) {
      if (k == dk) { sc.b(cx, z0, 'door', '#1c120a').box(x0 + k + .22, .3, z1, x0 + k + .78, 1.55, z1 + .08); sc.b(cx, z0, 'doorf', wood).box(x0 + k + .16, 1.55, z1, x0 + k + .84, 1.68, z1 + .1); sc.b(cx, z0, 'doorf', wood).box(x0 + k + .16, .3, z1, x0 + k + .22, 1.68, z1 + .1); sc.b(cx, z0, 'doorf', wood).box(x0 + k + .78, .3, z1, x0 + k + .84, 1.68, z1 + .1); }
      else { sc.b(cx, z0, 'win', '#f2b84b', { emis: true }).box(x0 + k + .25, 1.0, z1, x0 + k + .75, 1.55, z1 + .06); sc.b(cx, z0, 'winx', wood).box(x0 + k + .47, 1.0, z1, x0 + k + .53, 1.55, z1 + .08); }
    }
    // janelas nas laterais e fundos (algumas apagadas)
    const side = (a, b, fixed, nz) => {
      for (let t = a + .5; t < b - .3; t += 1.5) {
        const on = hash(Math.round(t * 3) + bx, fixed + by) > .3, c = on ? '#f2b84b' : '#5a4222';
        if (nz) sc.b(cx, z0, on ? 'win' : 'wind', c, { emis: on }).box(t - .22, WH * .5 + .2, fixed - (nz > 0 ? 0 : .06), t + .22, WH * .5 + .75, fixed + (nz > 0 ? .06 : 0)); else sc.b(cx, z0, 'win', c).box(fixed - .06, WH * .5 + .2, t - .22, fixed, WH * .5 + .75, t + .22);
      }
    };
    side(x0, x1, z0, -1);
    for (let t = z0 + .5; t < z1 - .3; t += 1.5) {
      const on = hash(Math.round(t * 3) + bx, 7 + by) > .3, c = on ? '#f2b84b' : '#5a4222', kk = on ? 'win' : 'wind', o = { emis: on };
      sc.b(cx, z0, kk, c, o).box(x1, WH * .5 + .2, t - .22, x1 + .06, WH * .5 + .75, t + .22); sc.b(cx, z0, kk, c, o).box(x0 - .06, WH * .5 + .2, t - .22, x0, WH * .5 + .75, t + .22);
    }
    const rh = tp == 'templo' ? Math.min(w, h) * .3 + .5 : Math.min(w, h) * .36 + .4;
    gable(sc, x0, z0, x1, z1, WH, rh, .3, roofC, wallC);
    if (tp == 'casa' && hash(bx, by) > .35) sc.b(cx, z0, 'chim', nt('#4a4440', .2)).box(x0 + .5, WH + rh * .4, z0 + .5, x0 + .95, WH + rh + .6, z0 + .95);
    if (tp == 'loja') { sc.b(cx, z0, 'sign', nt('#5a3a20', .15)).box(cx - .6, 1.95, z1 + .1, cx + .6, 2.4, z1 + .16); sc.b(cx, z0, 'signc', '#e6c229', { emis: true }).box(cx - .1, 2.1, z1 + .16, cx + .1, 2.3, z1 + .19); sc.b(cx, z0, 'sup', wood).box(cx - .65, 1.95, z1, cx - .6, 2.5, z1 + .2); }
    if (tp == 'templo') { // torre com pináculo
      const tx = x1 - 1.4, tz = z0 + 1.4; sc.b(cx, z0, 'wall', wallC).box(tx - .9, WH, tz - .9, tx + .9, WH + 1.2, tz + .9, { bottom: true });
      sc.b(cx, z0, 'roof', nt('#2c2c40', .1)).cone(tx, WH + 1.2, tz, 1.25, 1.25, WH + 3.9, 4);
      sc.b(cx, z0, 'orb', '#b070ff', { emis: true }).cyl(tx, WH + 3.9, tz, .13, .13, WH + 4.2, 6);
      sc.lights.push({ x: tx, z: tz + 1.8, y: 2, r: 2.6, a: .4, col: [170, 110, 255] });
      for (let k = 0; k < 2; k++) sc.b(cx, z0, 'win', '#b070ff', { emis: true }).box(tx - .25 + k * .3 - .15, WH + .35, tz + .9, tx - .25 + k * .3 + .15, WH + .95, tz + .96);
    }
    if (lb) sc.labels.push({ text: lb, x: cx, z: z1 - .2, h: WH + rh + (tp == 'templo' ? 1.2 : .3), col: '#8fd18f' });
  }
  function colosseum(sc, x0, z0, x1, z1, lb) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2, R = 1.6, N = 56, wc = nt('#57534a', .15), hc = nt('#2e2620', .2);
    const rr = (a) => { // retângulo de cantos arredondados
      const hx = rx - R, hz = rz - R, s = Math.cos(a), t = Math.sin(a); const sx = Math.sign(s) || 1, sz = Math.sign(t) || 1;
      return [cx + sx * hx + s * R, cz + sz * hz + t * R];
    };
    // anel de muralha
    const pts = []; for (let k = 0; k < N; k++) pts.push(rr(k / N * 2 * Math.PI));
    for (let k = 0; k < N; k++) {
      const p = pts[k], q = pts[(k + 1) % N], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) + .05, mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, yaw = Math.atan2(dz, dx) * 180 / Math.PI * -1;
      const gate = Math.abs(mx - 37.5) < 1 && mz < cz;
      if (gate) continue;
      sc.b(mx, mz, 'cw', wc).rbox(mx, 0, mz, L, 2.0, .9, yaw);
      if (k % 2 == 0) sc.b(mx, mz, 'cm', nt('#8a8474', .15)).rbox(mx, 2.0, mz, L * .9, 2.35, .5, yaw);
    }
    sc.b(cx, cz, 'cf', hc, { og: 'ground' }).cyl(cx, .02, cz, rx - 1.2, rz - 1.2, .03, 28);
    for (let k = 0; k < 9; k++) { const a = hash(k, 31) * 6.28, r = hash(k, 77) * .7; sc.b(cx, cz, 'bone', '#a8a28c').box(cx + Math.cos(a) * (rx - 3) * r - .12, .03, cz + Math.sin(a) * (rz - 2.2) * r - .05, cx + Math.cos(a) * (rx - 3) * r + .12, .08, cz + Math.sin(a) * (rz - 2.2) * r + .05); }
    // portão
    const gx = 37, gz = z0 + .45; sc.b(gx, gz, 'gp', nt('#4a463c', .15)).box(gx - .15, 0, gz - .5, gx + .15, 2.5, gz + .5); sc.b(gx, gz, 'gp', nt('#4a463c', .15)).box(gx + .85, 0, gz - .5, gx + 1.15, 2.5, gz + .5);
    sc.b(gx, gz, 'gp', nt('#4a463c', .15)).box(gx - .15, 2.2, gz - .5, gx + 1.15, 2.6, gz + .5);
    sc.b(gx, gz, 'gd', '#0a0808').box(gx + .15, 0, gz - .3, gx + .85, 2.2, gz + .3);
    for (let k = 0; k < 4; k++) sc.b(gx, gz, 'gb', '#777').box(gx + .22 + k * .18, 0, gz + .32, gx + .26 + k * .18, 2.1, gz + .35);
    torchPost(sc, gx - .45, z0 - .25, 1.4); torchPost(sc, gx + 1.45, z0 - .25, 1.4);
    sc.lights.push({ x: gx + .5, z: z0 - .5, y: 1.5, r: 3.2, a: .5 });
    if (lb) sc.labels.push({ text: lb, x: cx, z: z0 + .1, h: 2.9, col: '#8fd18f' });
  }

  /* ---------- masmorra ---------- */
  function buildDungeon(mp, tint, DW, DH) {
    const sc = new Scene(DW, DH), S = mp.solid;
    const open = (i, j) => i >= 0 && j >= 0 && i < DW && j < DH && !S[j][i];
    const near = (i, j) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (open(i + a, j + b)) return true; return false; };
    const fc = nt(tint, .05);
    for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
      if (!S[j][i]) {
        const c = (i + j) % 2 ? mixc(fc, '#ffffff', .05) : mixc(fc, '#000', .08);
        sc.b(i, j, 'f', c, { og: 'ground' }).quad([i, 0, j], [i, 0, j + 1], [i + 1, 0, j + 1], [i + 1, 0, j], [0, 1, 0]);
        if ((i * 5 + j * 11) % 7 == 0) sc.b(i, j, 'dec', mixc(fc, '#000', .35), { bias: .02 }).quad([i + .25, .005, j + .3], [i + .25, .005, j + .6], [i + .7, .005, j + .6], [i + .7, .005, j + .3], [0, 1, 0]);
      } else if (near(i, j)) {
        const face = j + 1 < DH && !S[j + 1][i], v = hash(i, j), col = nt(face ? (v > .5 ? '#5a5044' : '#54493d') : (v > .5 ? '#463e35' : '#3d362e'), .12), H = 1.7;
        const sk = { bottom: true, px: i + 1 < DW && S[j][i + 1], nx: i > 0 && S[j][i - 1], pz: j + 1 < DH && S[j + 1][i], nz: j > 0 && S[j - 1][i] };
        sc.b(i, j, 'w', col).box(i, 0, j, i + 1, H, j + 1, sk);
        if (face && v > .55) sc.b(i, j, 'wb', mixc(col, '#000', .3)).box(i + .1 + v * .3, H * .3, j + 1, i + .45 + v * .3, H * .3 + .12, j + 1.03);
      }
    }
    // chefe: marca no chão
    sc.b(mp.boss.x, mp.boss.y, 'bz', mixc(fc, '#a01e1e', .4), { bias: .015 }).cyl(mp.boss.x + .5, .008, mp.boss.y + .5, 3, 2.2, .012, 24, true);
    // escada: aberta (limpa) ou bloqueada
    const s = mp.stairs;
    for (let k = 0; k < 4; k++) {
      sc.b(s.x, s.y, 'st1', nt('#c8b070', .1), { when: m => m.cleared }).box(s.x + .12, 0, s.y + .1 + k * .2, s.x + .88, .1 + k * .1, s.y + .3 + k * .2);
      sc.b(s.x, s.y, 'st2', nt('#4a4038', .1), { when: m => !m.cleared }).box(s.x + .12, 0, s.y + .1 + k * .2, s.x + .88, .1 + k * .1, s.y + .3 + k * .2);
    }
    const xb = sc.b(s.x, s.y, 'stx', '#a33', { emis: true, bias: .03, when: m => !m.cleared });
    xb.rbox(s.x + .5, .2, s.y + .5, 1.1, .26, .12, 45); xb.rbox(s.x + .5, .2, s.y + .5, 1.1, .26, .12, -45);
    // tochas nas paredes
    (mp.tr || []).forEach(([i, j]) => {
      const x = i + .5, z = j + 1.05;
      sc.b(x, z, 'tp', '#4a3020').box(x - .05, 1.0, z - .08, x + .05, 1.25, z + .1);
      sc.b(x, z, 'tf', '#ffb02e', { emis: true, bias: .02 }).cyl(x, 1.25, z, .12, .12, 1.52, 6); sc.b(x, z, 'tg', '#fff2a0', { emis: true, bias: .03 }).cyl(x, 1.28, z, .05, .05, 1.5, 5);
      sc.lights.push({ x, z: z + .6, y: 1.3, r: 3.4, a: .5 });
    });
    return sc.finish();
  }

  /* ---------- local de lazer ---------- */
  function buildLeisure(LW, LH, spots) {
    const sc = new Scene(LW, LH);
    for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) sc.b(i, j, 'g', (i + j) % 2 == 0 ? '#5a4230' : '#543d2b', { og: 'ground' }).quad([i, 0, j], [i, 0, j + 1], [i + 1, 0, j + 1], [i + 1, 0, j], [0, 1, 0]);
    // paredes (lados escondíveis conforme a câmera)
    const wc = '#3a2a1c', wt = '#2a1f16', WH = 2.5, t = .4;
    const wall = (x0, z0, x1, z1, side) => { sc.b(x0, z0, 'wl' + side, wc, { side }).box(x0, 0, z0, x1, WH, z1, { bottom: true }); sc.b(x0, z0, 'wt' + side, wt, { side }).box(x0 - .02, WH, z0 - .02, x1 + .02, WH + .12, z1 + .02, { bottom: true }); };
    wall(0, 0, LW, t, 'N'); wall(0, LH - t, LW, LH, 'S'); wall(0, 0, t, LH, 'W'); wall(LW - t, 0, LW, LH, 'E');
    // rodapé e quadros na parede norte
    sc.b(10, 0, 'rod', '#5a3a2a', { side: 'N' }).box(t, .1, t, LW - t, .35, t + .08);
    for (let k = 0; k < 4; k++) { const px = 7 + k * 2; sc.b(px, 0, 'pic' + k % 2, k % 2 ? '#8a6a3a' : '#6a4a2a', { side: 'N' }).box(px, 1.2, t, px + 1.2, 2.0, t + .06); sc.b(px, 0, 'picp' + k, ['#3a6a8a', '#8a3a3a', '#5a8a4a', '#8a6a9a'][k], { side: 'N' }).box(px + .1, 1.3, t + .06, px + 1.1, 1.9, t + .09); }
    // tapete oval
    sc.b(10, 7, 'rug2', '#4a2626', { bias: .01, og: 'rug' }).cyl(10.5, .004, 7.5, 5.8, 3.8, .006, 40, true);
    sc.b(10, 7, 'rug', '#6b3a3a', { bias: .02, og: 'rug' }).cyl(10.5, .008, 7.5, 5.4, 3.4, .01, 40, true);
    sc.b(10, 7, 'rug3', '#7d4747', { bias: .03, og: 'rug' }).cyl(10.5, .012, 7.5, 3.6, 2.2, .014, 36, true);
    // estante de livros
    sc.b(4, 2, 'shelf', '#3a2a1a').box(3, 0, 2.05, 5.6, 2.4, 2.65, { bottom: true });
    for (let r = 0; r < 3; r++) {
      sc.b(4, 2, 'shb', '#1a120a').box(3.05, .3 + r * .7, 2.65, 5.55, .36 + r * .7, 2.72);
      for (let b = 0; b < 8; b++) { const bc = ['#8a3a3a', '#3a6a8a', '#6a8a3a', '#8a6a3a', '#5a3a8a'][(b + r) % 5], hh = .42 + hash(b, r) * .12; sc.b(4, 2, 'bk' + bc, bc).box(3.12 + b * .3, .36 + r * .7, 2.65, 3.12 + b * .3 + .22, .36 + r * .7 + hh, 2.75); }
    }
    // TV
    sc.b(16, 2, 'tvb', '#1a1a1e').box(15.2, .5, 2.2, 17.6, 1.95, 2.45, { bottom: true });
    sc.b(16, 2, 'tvs', '#4a90e2', { emis: true }).box(15.35, .65, 2.45, 17.45, 1.8, 2.5);
    sc.b(16, 2, 'tvl', '#2a2a30').box(15, 0, 2.05, 17.8, .5, 2.7, { bottom: true });
    sc.lights.push({ x: 16.4, z: 3.5, y: 1, r: 2.8, a: .35, col: [100, 160, 255] });
    // mesa de sinuca (ao norte do ponto de jogo 16,9)
    sc.b(16, 8, 'pt', '#2e2e36').box(14.6, .55, 7.1, 17.9, .95, 8.9, { bottom: true });
    sc.b(16, 8, 'pf', '#4a7a3a').box(14.8, .95, 7.3, 17.7, 1.0, 8.7, { bottom: true });
    for (const [lx, lz] of [[14.7, 7.2], [17.6, 7.2], [14.7, 8.7], [17.6, 8.7]]) sc.b(16, 8, 'pl', '#1a1a20').box(lx, 0, lz, lx + .2, .55, lz + .2);
    sc.b(16, 8, 'ball', '#111').cyl(16.8, 1.0, 7.9, .09, .09, 1.18, 7); sc.b(16, 8, 'ballw', '#eee').cyl(15.4, 1.0, 8.1, .09, .09, 1.18, 7); sc.b(16, 8, 'ballr', '#d33').cyl(16.1, 1.0, 8.4, .09, .09, 1.18, 7);
    sc.b(16, 8, 'taco', '#c9a04a').rbox(16.2, 1.0, 7.5, 1.5, 1.07, .06, 18);
    // sofá ao norte do ponto de descanso (10,6)
    sc.b(10, 5, 'sofa', '#6a3a4a').box(9.0, 0, 5.0, 12.0, .55, 5.9, { bottom: true }); sc.b(10, 5, 'sofab', '#7a4a5a').box(9.0, .55, 5.0, 12.0, 1.2, 5.3, { bottom: true });
    for (const sx of [9.0, 11.8]) sc.b(10, 5, 'sofaa', '#5a2a3a').box(sx, .55, 5.0, sx + .2, .95, 5.9, { bottom: true });
    sc.b(10, 5, 'cush', '#d8b34a').box(9.3, .55, 5.35, 9.9, .75, 5.8, { bottom: true });
    sc.b(12, 5, 'cup', '#e8dcc0').cyl(12.55, 0, 5.3, .22, .22, .45, 8); sc.b(12, 5, 'cupt', '#5a3a2a').cyl(12.55, .45, 5.3, .3, .3, .5, 10); sc.b(12, 5, 'cupc', '#e8dcc0').cyl(12.5, .5, 5.3, .08, .08, .62, 7);
    // mesa de comida (pizza) ao sul do ponto (10,10)
    sc.b(10, 11, 'ft', '#5a3a2a').cyl(10.5, .5, 11.75, .8, .8, .65, 14); sc.b(10, 11, 'fl', '#3a2418').cyl(10.5, 0, 11.75, .13, .13, .5, 6);
    sc.b(10, 11, 'pz', '#e0a030').cyl(10.5, .65, 11.75, .36, .36, .72, 12); sc.b(10, 11, 'pzp', '#c33').cyl(10.38, .72, 11.68, .07, .07, .75, 6); sc.b(10, 11, 'pzp', '#c33').cyl(10.62, .72, 11.85, .07, .07, .75, 6);
    // console de jogos ao norte do ponto (4,9)
    sc.b(4, 7, 'cns', '#2a2a30').box(3.2, 0, 7.6, 5.0, .5, 8.6, { bottom: true }); sc.b(4, 7, 'cnt', '#3a6aaa', { emis: true }).box(3.35, .5, 8.6, 4.85, 1.25, 8.67);
    sc.b(4, 7, 'cnb', '#1a1a20').box(3.2, .5, 7.6, 5.0, 1.3, 8.6, { bottom: true });
    sc.b(4, 7, 'cnj', '#d33').cyl(3.6, 1.3, 8.2, .07, .07, 1.38, 6); sc.b(4, 7, 'cnj', '#3d3').cyl(4.2, 1.3, 8.2, .07, .07, 1.38, 6);
    // lâmpadas de parede
    for (const [lx, lz] of [[1.2, 1.2], [18.8, 1.2], [1.2, 11.8], [18.8, 11.8]]) { torchPost(sc, lx, lz, 1.2); sc.lights.push({ x: lx, z: lz, y: 1.3, r: 3.4, a: .45 }); }
    // plantas
    for (const [px, pz] of [[1.2, 6.5], [18.8, 6.5]]) { sc.b(px, pz, 'pot', '#7a4a2a').cyl(px, 0, pz, .3, .3, .4, 8); sc.b(px, pz, 'leaf', '#3a7a3a').cone(px, .4, pz, .5, .5, 1.35, 6); sc.b(px, pz, 'leaf2', '#4a9a4a').cone(px, .4, pz, .35, .35, 1.7, 5); }
    return sc.finish();
  }

  /* ---------- arena ---------- */
  function buildArena(W, H, pil, tr) {
    const sc = new Scene(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const wall = i == 0 || j == 0 || i == W - 1 || j == H - 1, lava = j >= H - 2 && !wall, ch = (i + j) % 2;
      sc.b(i, j, 'g', wall ? (ch ? '#17100f' : '#120d0c') : (ch ? '#2a211c' : '#302520'), { og: 'ground' }).quad([i, 0, j], [i, 0, j + 1], [i + 1, 0, j + 1], [i + 1, 0, j], [0, 1, 0]);
      if (lava && i % 3 == 0) sc.b(i, j, 'lava', '#ff6a1a', { emis: true, bias: .02 }).quad([i + .12, .01, j + .85], [i + .12, .01, j + .97], [i + .88, .01, j + .97], [i + .88, .01, j + .85], [0, 1, 0]);
      else if (!wall && (i * 7 + j * 13) % 7 == 0) sc.b(i, j, 'dec', '#1a1410', { bias: .02 }).quad([i + .2, .005, j + .4], [i + .2, .005, j + .55], [i + .65, .005, j + .55], [i + .65, .005, j + .4], [0, 1, 0]);
    }
    const WH = 2.3, wc = ['#2a1d19', '#241915'];
    const side = (x0, z0, x1, z1, s) => {
      for (let k = 0; k < Math.max(x1 - x0, z1 - z0); k++) {
        const a = x1 - x0 > z1 - z0 ? x0 + k : x0, b = x1 - x0 > z1 - z0 ? z0 : z0 + k, c = wc[k % 2];
        sc.b(a, b, 'aw' + s + (k % 2), c, { side: s }).box(a, 0, b, a + (x1 - x0 > z1 - z0 ? 1 : x1 - x0), WH, b + (x1 - x0 > z1 - z0 ? z1 - z0 : 1), { bottom: true });
        sc.b(a, b, 'ac' + s, '#3a2a22', { side: s }).box(a + .05, WH, b + .05, a + (x1 - x0 > z1 - z0 ? .95 : x1 - x0 - .05), WH + .15, b + (x1 - x0 > z1 - z0 ? z1 - z0 - .05 : .95), { bottom: true });
      }
    };
    side(0, 0, W, 1, 'N'); side(0, H - 1, W, H, 'S'); side(0, 0, 1, H, 'W'); side(W - 1, 0, W, H, 'E');
    pil.forEach(([i, j]) => { const x = i + .5, z = j + .5; sc.b(x, z, 'pil', '#0c0a09').cyl(x, 0, z, .42, .42, WH + 1.2, 8); sc.b(x, z, 'pilh', '#1c1512').cyl(x, 0, z, .46, .46, .3, 8); sc.b(x, z, 'pilh', '#1c1512').cyl(x, WH + .9, z, .5, .5, WH + 1.2, 8); });
    tr.forEach(([i, j]) => { torchPost(sc, i + .5, j + .5, 1.3); sc.lights.push({ x: i + .5, z: j + .5, y: 1.4, r: 3.8, a: .6 }); });
    return sc.finish();
  }

  /* ---------- câmera e desenho da cena ---------- */
  // cam: {tx,tz (alvo em casas), yaw, pitch, S (pixels por casa), W,H (buffer), ox,oy (deslocamento)}
  function setCam(rd, cam) {
    rd.setView({ yaw: cam.yaw, pitch: cam.pitch, scale: cam.S, cx: 0, cy: 0 });
    const p = rd.project([cam.tx, 0, cam.tz]);
    rd.setView({ yaw: cam.yaw, pitch: cam.pitch, scale: cam.S, cx: rd.w / 2 - p[0] + (cam.ox || 0), cy: rd.h * .56 - p[1] + (cam.oy || 0) });
  }
  function drawScene(rd, sc, ents, o) {
    o = o || {}; rd.clear();
    const V = rd.V, vx = V[2], vz = V[10], W = rd.w, H = rd.h, list = [], pad = 24;
    const dirs = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
    const hideSide = (s) => { const d = dirs[s]; const dd = d[0] * vx + d[1] * vz, ln = Math.hypot(vx, vz) || 1; return dd / ln > .3; };
    const sideHid = {}; for (const s in dirs) sideHid[s] = hideSide(s);
    const P = []; for (const ch of sc.chunks) {
      const a = ch.mn, b = ch.mx; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let k = 0; k < 8; k++) { const q = rd.project([k & 1 ? b[0] : a[0], k & 2 ? b[1] : a[1], k & 4 ? b[2] : a[2]]); if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
      if (x1 < -pad || y1 < -pad || x0 > W + pad || y0 > H + pad) continue;
      for (const pt of ch.parts) { if (pt.side && sideHid[pt.side]) continue; if (pt.when && !pt.when(o.mp || sc.state)) continue; list.push(pt); }
    }
    rd.drawRig({ update() { }, parts: list, hidden: {} });
    const gid = rd.groups.ground || -1, rid = rd.groups.rug || -2; sc.gid = gid;
    // sombras
    const S = rd.S, sinP = Math.abs(V[5]) || .7;
    for (const e of ents) { if (!e.shadow) continue; const q = rd.project([e.x, 0, e.z]), r = (e.shadowR || .38) * S; rd.shadow(q[0], q[1], r, r * sinP, .42, gid); if (rid > 0) rd.shadow(q[0], q[1], r, r * sinP, .42, rid); }
    // poças de luz das tochas
    const t = (o.time || 0);
    for (const L of sc.lights) { const q = rd.project([L.x, 0, L.z]); if (q[0] < -60 || q[1] < -60 || q[0] > W + 60 || q[1] > H + 60) continue; const fl = 1 + Math.sin(t * .011 + L.x * 3 + L.z) * .06; rd.glow(q[0], q[1], L.r * S * fl, L.r * S * sinP * fl, L.col || [255, 150, 50], L.a, 4); }
    // personagens e monstros
    for (const e of ents) { rd.drawRig(e.rig); if (e.trails) R3.drawTrails(rd, e.rig); }
    rd.finish({ outline: true, depthStep: o.depthStep || .05 });
  }

  /* ---------- monstros articulados (7 espécies) ---------- */
  const MC = {};
  const mesh = (kind, d) => { const k = kind + d.join(','); return MC[k] || (MC[k] = kind === 'b' ? rbox(...d) : kind === 's' ? sphere(...d) : kind === 'c' ? cyl(...d) : kind === 'cn' ? R3.cone(...d) : kind === 'pr' ? R3.prism(...d) : kind === 'bl' ? R3.blade(...d) : null); };
  class MB {
    constructor(name) { this.rig = new Rig(name); this.N = this.rig.N; }
    n(name, parent, pos, rest) { return this.rig.node(name, typeof parent === 'string' ? this.N[parent] : parent, pos, rest); }
    p(node, kind, d, o) { return this.rig.add(typeof node === 'string' ? this.N[node] : node, mesh(kind, d), o); }
  }
  const eyes = (b, node, y, z, sx, c, r) => { for (const s of [1, -1]) b.p(node, 's', [r || .07, r || .07, r || .07, 6, 4], { c: c || '#ff3', emis: true, o: [s * sx, y, z] }); };
  function horn(b, node, x, y, z, r, h, c, rz) { b.p(node, 'cn', [r, h, 6], { c, o: [x, y, z], ro: [0, 0, rz || 0], shiny: true }); }
  function crown(b, node, y, r) { b.p(node, 'c', [r, r, .12, 10], { c: '#e6c229', o: [0, y, 0], shiny: true }); for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283; b.p(node, 'cn', [.06, .2, 5], { c: '#ffe27a', o: [Math.cos(a) * r * .9, y + .05, Math.sin(a) * r * .9], shiny: true }); } }

  const MONSTER = {
    0(col) { // rato
      const b = new MB('Rato'); b.n('body', b.rig.root, [0, .3, 0]); b.n('head', 'body', [0, .08, .38]); b.n('tail1', 'body', [0, 0, -.42]); b.n('tail2', 'tail1', [0, 0, -.3]);
      for (const [nm, x, z] of [['legFL', .17, .22], ['legFR', -.17, .22], ['legBL', .17, -.22], ['legBR', -.17, -.22]]) { b.n(nm, 'body', [x, -.12, z]); b.p(nm, 'b', [.1, .18, .1, .04, 1], { c: shade(col, .8), o: [0, -.08, 0] }); }
      b.p('body', 's', [.3, .24, .46, 9, 6], { c: col, o: [0, 0, 0] }); b.p('head', 's', [.2, .18, .24, 8, 6], { c: col, o: [0, 0, 0] });
      b.p('head', 's', [.05, .05, .05, 6, 4], { c: '#d88', o: [0, -.02, .24] }); eyes(b, 'head', .06, .16, .1, '#e22', .04);
      for (const s of [1, -1]) { b.p('head', 's', [.12, .12, .03, 7, 5], { c: '#e99', o: [s * .14, .17, -.04] }); }
      b.p('tail1', 'c', [.03, .035, .32, 5], { c: '#d99', o: [0, 0, -.1], ro: [90, 0, 0] }); b.p('tail2', 'c', [.02, .03, .3, 5], { c: '#d99', o: [0, 0, -.12], ro: [90, 0, 0] });
      b.rig.def = { h: .8, sw: [['tail1', 1, 22, 0], ['tail2', 1, 30, .9]] }; return b.rig;
    },
    1(col) { // morcego
      const b = new MB('Morcego'); b.n('body', b.rig.root, [0, 1.1, 0]); b.n('head', 'body', [0, .26, .05]); b.n('wingL', 'body', [.16, .08, 0]); b.n('wingR', 'body', [-.16, .08, 0]);
      b.p('body', 's', [.22, .3, .2, 8, 6], { c: col }); b.p('head', 's', [.2, .18, .18, 8, 6], { c: col });
      for (const s of [1, -1]) { horn(b, 'head', s * .12, .13, 0, .06, .18, col, s * -8); b.p('head', 's', [.04, .04, .04, 5, 4], { c: '#fff', o: [s * .05, -.1, .16] }); }
      eyes(b, 'head', .03, .15, .08, '#ff4', .045);
      for (const [nm, sg] of [['wingL', 1], ['wingR', -1]]) {
        b.p(nm, 'pr', [[[0, .18], [sg * .75, .42], [sg * .95, -.05], [sg * .6, -.25], [sg * .25, -.12]], .035], { c: '#4a2a66', o: [0, 0, 0], ro: [90, 0, 0], dbl: true });
        b.p(nm, 'c', [.015, .015, .85, 4], { c: shade(col, .7), o: [sg * .4, .0, 0], ro: [0, 0, 90 + sg * -10] });
      }
      b.rig.def = { h: 1.4, fly: true }; return b.rig;
    },
    2(col) { // esqueleto
      const b = new MB('Esqueleto'); b.n('body', b.rig.root, [0, .9, 0]); b.n('chest', 'body', [0, .12, 0]); b.n('head', 'chest', [0, .62, 0]);
      for (const s of ['L', 'R']) { const sg = s == 'L' ? 1 : -1; b.n('leg' + s, 'body', [sg * .16, -.05, 0]); b.n('knee' + s, 'leg' + s, [0, -.4, 0]); b.n('arm' + s, 'chest', [sg * .4, .45, 0]); b.n('elbow' + s, 'arm' + s, [0, -.34, 0]); }
      b.p('body', 'b', [.4, .2, .26, .06, 1], { c: shade(col, .85) }); b.p('chest', 'b', [.56, .55, .34, .1, 1], { c: col, o: [0, .22, 0] });
      for (let k = 0; k < 3; k++) b.p('chest', 'b', [.5, .05, .04, .02, 1], { c: '#1a1612', o: [0, .1 + k * .15, .175] });
      b.p('head', 's', [.32, .34, .32, 9, 7], { c: col, o: [0, .16, 0] }); b.p('head', 'b', [.3, .14, .26, .05, 1], { c: shade(col, .9), o: [0, -.08, .03] });
      for (const s of [1, -1]) { b.p('head', 'b', [.12, .12, .06, .03, 1], { c: '#160a0a', o: [s * .1, .17, .28] }); b.p('head', 's', [.035, .035, .035, 5, 4], { c: '#f33', emis: true, o: [s * .1, .17, .3] }); }
      for (const s of ['L', 'R']) {
        b.p('leg' + s, 'b', [.1, .42, .1, .03, 1], { c: col, o: [0, -.2, 0] }); b.p('knee' + s, 'b', [.1, .38, .1, .03, 1], { c: col, o: [0, -.18, 0] }); b.p('knee' + s, 'b', [.16, .08, .26, .03, 1], { c: shade(col, .85), o: [0, -.4, .05] });
        b.p('arm' + s, 'b', [.1, .36, .1, .03, 1], { c: col, o: [0, -.17, 0] }); b.p('elbow' + s, 'b', [.09, .34, .09, .03, 1], { c: col, o: [0, -.16, 0] });
      }
      b.p('elbowR', 'bl', [.9, .1, .03, .2, 0], { c: '#aab4c4', shiny: true, o: [0, -.3, 0], ro: [90, 0, 0] }); b.p('elbowR', 'b', [.22, .05, .06, .02, 1], { c: '#7a5a3a', o: [0, -.3, 0] });
      b.rig.def = { h: 2.1 }; return b.rig;
    },
    3(col) { // orc
      const b = new MB('Orc'); b.n('body', b.rig.root, [0, .95, 0]); b.n('chest', 'body', [0, .15, 0]); b.n('head', 'chest', [0, .62, 0]);
      for (const s of ['L', 'R']) { const sg = s == 'L' ? 1 : -1; b.n('leg' + s, 'body', [sg * .25, -.05, 0]); b.n('knee' + s, 'leg' + s, [0, -.38, 0]); b.n('arm' + s, 'chest', [sg * .62, .45, 0]); b.n('elbow' + s, 'arm' + s, [0, -.38, 0]); }
      b.p('body', 'b', [.78, .3, .52, .1, 1], { c: '#2a1a10' }); b.p('chest', 'b', [.98, .75, .6, .18, 1], { c: '#5a3a20', o: [0, .25, 0] }); b.p('chest', 'b', [.7, .5, .2, .08, 1], { c: shade(col, .9), o: [0, .3, .28] });
      b.p('head', 'b', [.78, .62, .66, .2, 1], { c: col, o: [0, .28, 0] }); b.p('head', 'b', [.5, .16, .12, .05, 1], { c: shade(col, .8), o: [0, .02, .3] });
      for (const s of [1, -1]) { b.p('head', 'cn', [.07, .24, 5], { c: '#f4f0e0', o: [s * .2, .0, .32], shiny: true }); b.p('head', 'cn', [.08, .22, 5], { c: shade(col, .8), o: [s * .42, .38, 0], ro: [0, 0, -s * 70] }); }
      eyes(b, 'head', .34, .33, .16, '#ee3', .06); b.p('head', 'b', [.72, .1, .6, .04, 1], { c: shade(col, .6), o: [0, .5, .02] });
      for (const s of ['L', 'R']) {
        b.p('leg' + s, 'b', [.34, .46, .34, .1, 1], { c: '#4a3a28', o: [0, -.2, 0] }); b.p('knee' + s, 'b', [.32, .42, .32, .09, 1], { c: shade(col, .85), o: [0, -.18, 0] }); b.p('knee' + s, 'b', [.38, .16, .5, .06, 1], { c: '#2a1a10', o: [0, -.38, .06] });
        b.p('arm' + s, 'b', [.34, .42, .34, .1, 1], { c: col, o: [0, -.18, 0] }); b.p('elbow' + s, 'b', [.32, .4, .32, .09, 1], { c: shade(col, .9), o: [0, -.18, 0] }); b.p('elbow' + s, 's', [.2, .2, .2, 8, 6], { c: col, o: [0, -.42, 0] });
      }
      b.p('elbowR', 'c', [.07, .07, 1.5, 6], { c: '#6b4a2a', o: [0, -.5, .2], ro: [90, 0, 0] }); b.p('elbowR', 's', [.28, .28, .28, 8, 6], { c: '#5a3a20', o: [0, -.5, .8] });
      b.rig.def = { h: 2.5 }; return b.rig;
    },
    4(col) { // fantasma
      const b = new MB('Fantasma'); b.n('body', b.rig.root, [0, 1.0, 0]); b.n('armL', 'body', [.45, .1, .05]); b.n('armR', 'body', [-.45, .1, .05]);
      b.p('body', 's', [.55, .6, .5, 10, 8], { c: col, shiny: true, o: [0, .35, 0] }); b.p('body', 'c', [.55, .55, .9, 10], { c: col, shiny: true, o: [0, -.1, 0] });
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; b.p('body', 'cn', [.2, .4, 5], { c: col, shiny: true, o: [Math.cos(a) * .4, -.1, Math.sin(a) * .35], ro: [180, 0, 0] }); }
      for (const s of [1, -1]) { b.p('body', 'b', [.12, .2, .06, .03, 1], { c: '#0a1a2a', o: [s * .2, .4, .46] }); }
      b.p('body', 'b', [.14, .12, .06, .04, 1], { c: '#0a1a2a', o: [0, .12, .5] });
      for (const s of ['L', 'R']) { const sg = s == 'L' ? 1 : -1; b.p('arm' + s, 's', [.14, .22, .14, 7, 5], { c: col, shiny: true, o: [sg * .08, -.12, .08] }); }
      b.rig.def = { h: 2.1, float: true }; return b.rig;
    },
    5(col) { // troll
      const b = new MB('Troll'); b.n('body', b.rig.root, [0, 1.25, 0]); b.n('chest', 'body', [0, .1, 0]); b.n('head', 'chest', [0, .72, .1]);
      for (const s of ['L', 'R']) { const sg = s == 'L' ? 1 : -1; b.n('leg' + s, 'body', [sg * .34, -.1, 0]); b.n('knee' + s, 'leg' + s, [0, -.5, 0]); b.n('arm' + s, 'chest', [sg * .86, .55, 0]); b.n('elbow' + s, 'arm' + s, [0, -.5, 0]); }
      b.p('body', 'b', [1.1, .4, .8, .16, 1], { c: shade(col, .85) }); b.p('chest', 's', [.82, .78, .6, 10, 8], { c: col, o: [0, .35, 0] }); b.p('chest', 'b', [.9, .12, .7, .05, 1], { c: '#5a3a20', o: [0, 0, 0] });
      b.p('head', 'b', [.68, .56, .62, .2, 1], { c: '#7f9070', o: [0, .25, 0] }); eyes(b, 'head', .32, .32, .14, '#ee3', .06);
      for (const s of [1, -1]) b.p('head', 'cn', [.07, .26, 5], { c: '#f4f0e0', o: [s * .18, .0, .3], shiny: true });
      b.p('head', 'b', [.5, .1, .1, .04, 1], { c: '#4a5a3a', o: [0, .06, .32] });
      for (const s of ['L', 'R']) {
        const sg = s == 'L' ? 1 : -1; b.p('leg' + s, 'b', [.5, .6, .5, .15, 1], { c: shade(col, .8), o: [0, -.26, 0] }); b.p('knee' + s, 'b', [.46, .55, .46, .13, 1], { c: shade(col, .75), o: [0, -.24, 0] }); b.p('knee' + s, 'b', [.54, .2, .66, .08, 1], { c: '#2a2a20', o: [0, -.5, .08] });
        b.p('arm' + s, 'b', [.5, .6, .5, .15, 1], { c: col, o: [0, -.26, 0] }); b.p('elbow' + s, 'b', [.46, .55, .46, .13, 1], { c: shade(col, .9), o: [0, -.24, 0] }); b.p('elbow' + s, 's', [.28, .28, .28, 8, 6], { c: '#7f9070', o: [0, -.55, 0] });
      }
      b.p('elbowR', 'c', [.1, .1, 2.0, 6], { c: '#6b4a2a', o: [0, -.62, .3], ro: [90, 0, 0] }); b.p('elbowR', 'b', [.5, .5, .5, .14, 1], { c: '#5a3a20', o: [0, -.62, 1.3] });
      b.rig.def = { h: 3.2 }; return b.rig;
    },
    6(col) { // demônio
      const b = new MB('Demonio'); b.n('body', b.rig.root, [0, .95, 0]); b.n('chest', 'body', [0, .12, 0]); b.n('head', 'chest', [0, .6, 0]); b.n('wingL', 'chest', [.3, .45, -.25]); b.n('wingR', 'chest', [-.3, .45, -.25]); b.n('tail1', 'body', [0, -.05, -.3]); b.n('tail2', 'tail1', [0, 0, -.4]);
      for (const s of ['L', 'R']) { const sg = s == 'L' ? 1 : -1; b.n('leg' + s, 'body', [sg * .2, -.05, 0]); b.n('knee' + s, 'leg' + s, [0, -.4, 0]); b.n('arm' + s, 'chest', [sg * .5, .42, 0]); b.n('elbow' + s, 'arm' + s, [0, -.34, 0]); }
      b.p('body', 'b', [.62, .3, .42, .1, 1], { c: shade(col, .85) }); b.p('chest', 'b', [.78, .62, .5, .16, 1], { c: col, o: [0, .22, 0] });
      b.p('head', 'b', [.66, .6, .6, .2, 1], { c: '#c84a3a', o: [0, .26, 0] }); eyes(b, 'head', .32, .31, .15, '#ff0', .06);
      for (const s of [1, -1]) { horn(b, 'head', s * .22, .5, 0, .09, .42, '#f4f0e0', -s * 18); horn(b, 'head', s * .3, .42, 0, .06, .26, '#f4f0e0', -s * 50); }
      b.p('head', 'b', [.3, .06, .06, .02, 1], { c: '#400', o: [0, .06, .31] });
      for (const [nm, sg] of [['wingL', 1], ['wingR', -1]]) b.p(nm, 'pr', [[[0, 0], [sg * .35, .75], [sg * .95, .9], [sg * 1.25, .1], [sg * .8, .25], [sg * .6, -.2], [sg * .25, -.35]], .04], { c: '#7a1a1a', o: [0, 0, 0], dbl: true });
      for (const s of ['L', 'R']) {
        b.p('leg' + s, 'b', [.26, .44, .26, .08, 1], { c: shade(col, .85), o: [0, -.2, 0] }); b.p('knee' + s, 'b', [.24, .4, .24, .08, 1], { c: shade(col, .8), o: [0, -.18, 0] }); b.p('knee' + s, 'b', [.28, .14, .36, .05, 1], { c: '#2a1010', o: [0, -.4, .05] });
        b.p('arm' + s, 'b', [.24, .38, .24, .08, 1], { c: col, o: [0, -.17, 0] }); b.p('elbow' + s, 'b', [.22, .36, .22, .07, 1], { c: shade(col, .9), o: [0, -.16, 0] }); b.p('elbow' + s, 'cn', [.07, .2, 4], { c: '#f4f0e0', o: [0, -.38, 0], ro: [180, 0, 0] });
      }
      b.p('tail1', 'c', [.05, .07, .5, 5], { c: '#a22', o: [0, 0, -.2], ro: [90, 0, 0] }); b.p('tail2', 'c', [.03, .05, .5, 5], { c: '#a22', o: [0, 0, -.22], ro: [90, 0, 0] }); b.p('tail2', 'cn', [.1, .22, 4], { c: '#a22', o: [0, 0, -.48], ro: [-90, 0, 0] });
      b.rig.def = { h: 2.6 }; return b.rig;
    }
  };
  function buildMonster(k, col, boss) {
    const rig = MONSTER[k](col); if (boss) { const hd = rig.N.head || rig.N.body; const b = { rig, N: rig.N, p: (n, kind, d, o) => rig.add(typeof n === 'string' ? rig.N[n] : n, mesh(kind, d), o) }; crown(b, hd, .6, .26); }
    rig.kind = k; rig.boss = !!boss; return rig;
  }
  // pose do monstro: S {t, walk (0..1.6), phase, atk (0..1 ou undefined), hit (0..1), yaw, pos, scale}
  function monPose(rig, S) {
    rig.resetPose(); const N = rig.N, t = S.t || 0, w = Math.min(1.6, S.walk || 0), ph = S.phase || 0, sn = Math.sin(ph), cs = Math.cos(ph), df = rig.def, k = rig.kind;
    N.root.rot[1] = S.yaw || 0; if (S.pos) { N.root.off[0] = S.pos[0]; N.root.off[1] = S.pos[1]; N.root.off[2] = S.pos[2]; } const sc = S.scale || 1; N.root.scl[0] = N.root.scl[1] = N.root.scl[2] = sc;
    const bob = Math.sin(t * 3.2) * .03, a = S.atk, ap = a === undefined ? 0 : Math.sin(Math.min(1, a) * Math.PI);
    const body = N.body; if (body) { body.off[1] += bob + (df.float ? .08 * Math.sin(t * 2.4) : 0) - .03 * Math.abs(cs) * w; body.off[2] += ap * .35; body.rot[0] += ap * 18 + 5 * w; }
    for (const s of ['L', 'R']) {
      const sg = s == 'L' ? 1 : -1;
      if (N['leg' + s]) { N['leg' + s].rot[0] = (s == 'L' ? -1 : 1) * 34 * w * sn; if (N['knee' + s]) N['knee' + s].rot[0] = 40 * Math.max(0, (s == 'L' ? cs : -cs)) * w; }
      if (N['arm' + s]) { N['arm' + s].rot[0] = (s == 'L' ? 1 : -1) * 30 * w * sn - ap * 70 * (s == 'R' ? 1 : .5); N['arm' + s].rot[2] = sg * 6; if (N['elbow' + s]) N['elbow' + s].rot[0] = -20 - ap * 40; }
      if (N['legF' + s]) { N['legF' + s].rot[0] = 40 * w * sn; N['legB' + s].rot[0] = -40 * w * sn; }
      if (N['wing' + s]) N['wing' + s].rot[2] = sg * (k == 1 ? Math.sin(t * 16 + (s == 'L' ? 0 : 0)) * 48 : 8 + Math.sin(t * 3) * 14);
    }
    if (N.tail1) { N.tail1.rot[1] = Math.sin(t * 4) * 22 + 10 * w * sn; if (N.tail2) N.tail2.rot[1] = Math.sin(t * 4 + .9) * 30; }
    if (N.head) N.head.rot[1] = Math.sin(t * 1.3) * 6; if (N.chest && k != 0) N.chest.rot[0] = 3 * Math.sin(t * 2.4) + ap * 14;
    if (S.hit > 0) { const h = Math.min(1, S.hit); if (body) { body.rot[0] -= 14 * h; body.off[2] -= .12 * h; } }
    if (df.fly) N.body.off[1] += .1 * Math.sin(t * 5);
    rig.update();
  }

  const World = { Batch, Scene, buildCity, buildDungeon, buildLeisure, buildArena, setCam, drawScene, buildMonster, monPose, hash };
  R3.World = World;
})(typeof window !== 'undefined' ? window : globalThis);

const T = 32, W = 21, H = 15, cv = document.getElementById('c'), g = cv.getContext('2d');
// Personagens originais (arquétipos). Para usar sprites de anime, troque o desenho por imagens (ver drawChar).
const TC = { fisico: '#e8e8e8', magico: '#c88cff', fogo: '#ff7a2e', gelo: '#7ad8ff', raio: '#ffe94a', ki: '#5cf0a0', sombrio: '#c23a7a' };
// resistência/fraqueza por monstro (índice = tipo em KD): multiplicador de dano por tipo
const RS = [{}, { raio: 1.3 }, { fisico: .6, magico: 1.2, fogo: 1.3 }, { fisico: .9 }, { fisico: .2, magico: 1.4, ki: 1.3, fogo: .8 }, { fisico: .8, fogo: 1.3, gelo: 1.3, magico: .8 }, { fogo: .2, gelo: 1.5, magico: .9, ki: 1.1 }];
// SK(nome,tipo,dano,recarga,alcance,golpes,área,evoluções,+golpe/evolução,+área/evolução,especial)
const SK = (n, t, dmg, cd, range, h, a, ev, eh, ea, esp, drain) => ({ n, t, dmg, cd, range, h, a, ev, eh, ea, esp: !!esp, drain: drain || 0, st: 0, use: 0 });
const val = (s, t) => s.dmg * (s.h || 1) * (1 + .3 * (s.a || 0)) * ((t.res && t.res[s.t]) || 1) * (s.esp ? 3 : 1);
const pick = (e, t, d) => e.sk.filter(s => s.cdl == 0 && s.range >= d).sort((a, b) => val(b, t) - val(a, t))[0];
const chars = [
  {
    name: 'Espadachim', pref: 1, body: '#7a1f2b', hair: '#1c1a22', accent: '#c9a04a', shadow: '#541420', spk: 3, sk: [
      SK('Corte de Uma Espada', 'fisico', 12, 40, 1, 1, 0, ['Corte de Duas Espadas', 'Corte de Três Espadas'], 1, 0),
      SK('Onda Cortante', 'fisico', 10, 70, 5, 1, 0, ['Tornado de Lâminas', 'Ciclone Demoníaco'], 0, 1),
      SK('Investida das Três Lâminas', 'fisico', 8, 90, 2, 3, 0, ['Fúria do Dragão Triplo', 'Fúria Sem Limites'], 1, 0),
      SK('Investida do Leão', 'fisico', 22, 120, 3, 1, 0, ['Rugido do Leão', 'Mil Leões'], 0, 1),
      SK('Lâmina Espiritual', 'ki', 16, 100, 4, 1, 0, ['Lâmina do Rei Guerreiro', 'Lâmina Transcendente'], 0, 1),
      SK('Fúria das Nove Lâminas', 'fisico', 9, 110, 2, 9, 0, ['Avatar da Fúria: Nove Lâminas', 'Avatar da Guerra: Nove Lâminas'], 1, 0, 1)]
  },
  {
    name: 'Mago', pref: 4, body: '#3d2a66', hair: '#6b2a8a', accent: '#e0c45a', shadow: '#241a44', spk: 5, sk: [
      SK('Bola de Fogo', 'fogo', 10, 50, 5, 1, 0, ['Dragão de Fogo', 'Fênix Flamejante'], 0, 1),
      SK('Lança de Gelo', 'gelo', 11, 60, 5, 1, 0, ['Chuva de Gelo', 'Túmulo Glacial'], 0, 1),
      SK('Relâmpago', 'raio', 12, 55, 5, 1, 0, ['Corrente Elétrica', 'Trovão Divino'], 1, 0),
      SK('Lança de Luz', 'magico', 14, 70, 6, 1, 0, ['Chuva de Luz', 'Julgamento Celestial'], 1, 0),
      SK('Explosão Arcana', 'magico', 20, 130, 4, 1, 1, ['Explosão Suprema', 'Nova Arcana'], 0, 1),
      SK('Meteoro', 'fogo', 40, 110, 6, 1, 2, ['Meteoro Ardente', 'Apocalipse'], 0, 1, 1)]
  },
  {
    name: 'Ninja', pref: 2, body: '#1f2b3d', hair: '#273344', accent: '#3ac1b0', shadow: '#121a26', spk: 4, sk: [
      SK('Chuva de Kunais', 'fisico', 6, 30, 5, 2, 0, ['Mil Kunais', 'Tempestade de Aço'], 1, 0),
      SK('Lâmina Sombria', 'fisico', 8, 32, 1, 2, 0, ['Dança das Sombras', 'Corte Fantasma'], 1, 0),
      SK('Bola de Fogo Ninja', 'fogo', 16, 90, 4, 1, 1, ['Grande Bola de Fogo', 'Dragão de Chamas'], 0, 1),
      SK('Garra do Trovão', 'raio', 20, 100, 2, 1, 0, ['Lâmina de Raio', 'Corte Trovão'], 1, 0),
      SK('Duplicação Sombria', 'fisico', 7, 110, 3, 5, 0, ['Clones Explosivos', 'Exército de Clones'], 1, 0),
      SK('Ritual Proibido', 'magico', 45, 115, 3, 1, 1, ['Selo do Demônio', 'Selo Final'], 0, 1, 1)]
  },
  {
    name: 'Lutador', pref: 1, body: '#6b4a2e', hair: '#1a1510', accent: '#c0392b', shadow: '#43301d', spk: 6, sk: [
      SK('Soco Rápido', 'fisico', 9, 30, 1, 2, 0, ['Rajada de Socos', 'Mil Socos'], 1, 0),
      SK('Rajada de Ki', 'ki', 12, 45, 5, 1, 0, ['Rajada Dupla', 'Metralhadora de Ki'], 1, 0),
      SK('Onda de Energia', 'ki', 24, 110, 6, 1, 0, ['Onda Dupla', 'Onda Suprema'], 1, 0),
      SK('Chute Voador', 'fisico', 18, 70, 2, 1, 0, ['Chute Giratório', 'Chute Meteoro'], 0, 1),
      SK('Explosão de Ki', 'ki', 22, 130, 3, 1, 2, ['Explosão Suprema', 'Supernova'], 0, 1),
      SK('Punho do Dragão', 'ki', 22, 100, 4, 3, 0, ['Punho do Dragão Duplo', 'Punho do Dragão Supremo'], 1, 0, 1)]
  },
  {
    name: 'Vampiro', pref: 1, body: '#241820', hair: '#2d2a2b', accent: '#8a1620', shadow: '#140b10', spk: 4, sk: [
      SK('Garra Sanguinária', 'fisico', 11, 45, 1, 1, 0, ['Garras Duplas', 'Garras Carmesim'], 1, 0, 0, .4),
      SK('Névoa de Morcegos', 'sombrio', 9, 70, 5, 1, 0, ['Enxame de Morcegos', 'Nuvem Negra'], 0, 1, 0, .15),
      SK('Toque Drenante', 'sombrio', 15, 95, 1, 1, 0, ['Abraço Sombrio', 'Sugadouro Final'], 0, 0, 0, .6),
      SK('Olhar Hipnótico', 'sombrio', 12, 115, 4, 1, 0, ['Olhar do Abismo', 'Fascínio Mortal'], 0, 0, 0, .2),
      SK('Investida Carmesim', 'fisico', 24, 150, 2, 2, 0, ['Investida Dupla', 'Investida do Conde'], 1, 0, 0, .35),
      SK('Lua de Sangue', 'sombrio', 34, 110, 3, 2, 0, ['Lua de Sangue Cheia', 'Noite Eterna'], 1, 0, 1, .7)]
  }
];

const sa = document.getElementById('sa'), sb = document.getElementById('sb'), rc = document.getElementById('rc'), logEl = document.getElementById('log');
chars.forEach((c, i) => { sa.add(new Option(c.name, i)); sb.add(new Option(c.name, i)); rc.add(new Option(c.name, i)); document.getElementById('shopChar').add(new Option(c.name, i)) }); sb.value = 1;
const base = JSON.parse(JSON.stringify(chars));
try {
  const s = JSON.parse(localStorage.getItem('arena-anime-v2')); if (s) s.forEach((c, i) => {
    chars[i].sk = c.sk; chars[i].lvl = c.lvl; chars[i].level = c.level; chars[i].xp = c.xp; chars[i].strat = c.strat; chars[i].focus = c.focus; chars[i].deaths = c.deaths; chars[i].fear = c.fear; chars[i].best = c.best;
    chars[i].gold = c.gold || 0; chars[i].skinOwned = c.skinOwned || [0]; chars[i].skinIdx = c.skinIdx || 0
  })
} catch (e) { }
chars.forEach(c => { c.lvl = c.lvl || 0; c.level = c.level || 1; c.xp = c.xp || 0; c.strat = c.strat || { rest: .4, alvo: 'qualquer', dist: 0 }; c.focus = c.focus || 'equilibrado'; c.deaths = c.deaths || 0; c.fear = c.fear || 0; c.best = c.best || 1; c.sayT = 0; c.say = c.say || '' });
const save = () => { try { localStorage.setItem('arena-anime-v2', JSON.stringify(chars.map(c => ({ sk: c.sk, lvl: c.lvl, level: c.level, xp: c.xp, strat: c.strat, focus: c.focus, deaths: c.deaths, fear: c.fear, best: c.best, gold: c.gold, skinOwned: c.skinOwned, skinIdx: c.skinIdx })))) } catch (e) { } };
// ---- Lojinha de roupas (skins) ----
const RARITY = { comum: '#8a8a8a', raro: '#4a90e2', epico: '#a24ae2', lendario: '#e2a24a', mitico: '#e24a5a' };
const SKINS = {
  'Espadachim': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#7a1f2b', hair: '#1c1a22', accent: '#c9a04a', shadow: '#541420' },
  { name: 'Lâmina Negra', cost: 80, rar: 'raro', body: '#1c1c24', hair: '#0d0d12', accent: '#8a8f9a', shadow: '#0a0a0e' },
  { name: 'Fênix Carmesim', cost: 160, rar: 'epico', body: '#b8381f', hair: '#3a0d0d', accent: '#ffcf5a', shadow: '#6e1a0d' },
  { name: 'Guardião Esmeralda', cost: 240, rar: 'epico', body: '#1f6b4a', hair: '#122a1f', accent: '#bfe6a0', shadow: '#0d3322' },
  { name: 'Samurai do Crepúsculo', cost: 320, rar: 'lendario', body: '#1a1a2e', hair: '#0d0d18', accent: '#c9d4e8', shadow: '#0a0a16', glow: '#6a7fd0' },
  { name: 'Cavaleiro Amaldiçoado', cost: 420, rar: 'lendario', body: '#14140f', hair: '#0a0a08', accent: '#7aff6a', shadow: '#080805', glow: '#4aff3a' },
  { name: 'Demônio de Aço', cost: 520, rar: 'mitico', body: '#17090b', hair: '#0b0405', accent: '#ff3a3a', shadow: '#0a0405', glow: '#ff2020' },
  { name: 'Manto da Serpente Verde', cost: 460, rar: 'lendario', body: '#0d100e', hair: '#d8c878', accent: '#6bff7a', shadow: '#070907', glow: '#4bff5a', coat: true }],
  'Mago': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#3d2a66', hair: '#6b2a8a', accent: '#e0c45a', shadow: '#241a44' },
  { name: 'Arcano Gélido', cost: 80, rar: 'raro', body: '#1e4a66', hair: '#2a7a9a', accent: '#cdeeff', shadow: '#0d2838' },
  { name: 'Chama Ancestral', cost: 160, rar: 'epico', body: '#6b2318', hair: '#9a3a1a', accent: '#ffcf5a', shadow: '#3a0f0a' },
  { name: 'Sombra Espectral', cost: 240, rar: 'epico', body: '#241b33', hair: '#1a1222', accent: '#a98cff', shadow: '#120d1c' },
  { name: 'Necromante', cost: 320, rar: 'lendario', body: '#17151f', hair: '#e8e4d8', accent: '#9a4ae2', shadow: '#0a0910', glow: '#8a2ad0' },
  { name: 'Olho do Vazio', cost: 420, rar: 'lendario', body: '#0d0a18', hair: '#07050d', accent: '#ff4ad0', shadow: '#050310', glow: '#ff2ac0' },
  { name: 'Arauto do Eclipse', cost: 520, rar: 'mitico', body: '#120e08', hair: '#070502', accent: '#e8c24a', shadow: '#080502', glow: '#ffb020' }],
  'Ninja': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#1f2b3d', hair: '#273344', accent: '#3ac1b0', shadow: '#121a26' },
  { name: 'Névoa Prateada', cost: 80, rar: 'raro', body: '#3a3f4a', hair: '#4a5160', accent: '#d8dde6', shadow: '#1e2228' },
  { name: 'Víbora Carmesim', cost: 160, rar: 'epico', body: '#2a1620', hair: '#1a0f16', accent: '#c0293d', shadow: '#160b10' },
  { name: 'Vento Dourado', cost: 240, rar: 'epico', body: '#2e2a1a', hair: '#3a3320', accent: '#e0c45a', shadow: '#181509' },
  { name: 'Lâmina da Meia-Noite', cost: 320, rar: 'lendario', body: '#0c0e14', hair: '#05060a', accent: '#c9d4e8', shadow: '#05060a', glow: '#8aa0ff' },
  { name: 'Yokai das Sombras', cost: 420, rar: 'lendario', body: '#19101f', hair: '#0d0810', accent: '#e8e03a', shadow: '#0a0710', glow: '#d8d020' },
  { name: 'Caçador Noturno', cost: 520, rar: 'mitico', body: '#120909', hair: '#090404', accent: '#d61f2e', shadow: '#070303', glow: '#ff2a3a' }],
  'Lutador': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#6b4a2e', hair: '#1a1510', accent: '#c0392b', shadow: '#43301d' },
  { name: 'Punho de Ferro', cost: 80, rar: 'raro', body: '#4a4a52', hair: '#1a1a1e', accent: '#8fa0b0', shadow: '#282830' },
  { name: 'Tigre Selvagem', cost: 160, rar: 'epico', body: '#8a5a1f', hair: '#1a1510', accent: '#e07a1f', shadow: '#4a3010' },
  { name: 'Monge Celeste', cost: 240, rar: 'epico', body: '#2e5a6b', hair: '#e8dcc0', accent: '#bfe6e0', shadow: '#163038' },
  { name: 'Fera Negra', cost: 320, rar: 'lendario', body: '#15110d', hair: '#0a0806', accent: '#e0923c', shadow: '#080605', glow: '#ff8a2a' },
  { name: 'Monge Caído', cost: 420, rar: 'lendario', body: '#2a2420', hair: '#0d0b09', accent: '#d6303c', shadow: '#120f0d', glow: '#ff3a3a' },
  { name: 'Titã Sombrio', cost: 520, rar: 'mitico', body: '#0c0a0d', hair: '#060507', accent: '#ff7a1f', shadow: '#050405', glow: '#ff5a10' }],
  'Vampiro': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#241820', hair: '#2d2a2b', accent: '#8a1620', shadow: '#140b10' },
  { name: 'Nobre Sombrio', cost: 160, rar: 'epico', body: '#1a1216', hair: '#1e1a1c', accent: '#c23a7a', shadow: '#0d0810' },
  { name: 'Conde Carmesim', cost: 320, rar: 'lendario', body: '#17090f', hair: '#120910', accent: '#ff2a4a', shadow: '#0a0407', glow: '#ff2a4a' },
  { name: 'Senhor da Noite Eterna', cost: 520, rar: 'mitico', body: '#0a0710', hair: '#07050c', accent: '#8a2ad0', shadow: '#050308', glow: '#9a2ad0' }]
};
function applySkin(c, idx) { const sk = (SKINS[c.name] || [])[idx] || SKINS[c.name][0]; c.body = sk.body; c.hair = sk.hair; c.accent = sk.accent; c.shadow = sk.shadow; c.glow = sk.glow || null; c.coatLong = !!sk.coat }
chars.forEach(c => { c.gold = c.gold || 0; c.skinOwned = c.skinOwned || [0]; c.skinIdx = c.skinIdx || 0; applySkin(c, c.skinIdx) });
function buySkin(ci, si) {
  const c = chars[ci], sk = SKINS[c.name][si]; if (c.skinOwned.includes(si)) { applySkin(c, si); c.skinIdx = si; save(); renderShop(); log(`${c.name} equipou ${sk.name}.`); return }
  if (c.gold < sk.cost) { log(`${c.name} não tem ouro suficiente para ${sk.name} (precisa de ${sk.cost}, tem ${c.gold}).`); return }
  c.gold -= sk.cost; c.skinOwned.push(si); c.skinIdx = si; applySkin(c, si); save(); renderShop(); log(`${c.name} comprou e equipou ${sk.name}!`)
}
const RNAME = { comum: 'Comum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário', mitico: 'Mítico' };
function renderShop() {
  const ci = +document.getElementById('shopChar').value, c = chars[ci];
  document.getElementById('shopBody').innerHTML =
    `<div style="display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#2a2015,#1b1712);border:1px solid #6b5530;border-radius:10px;padding:8px 14px;margin-bottom:10px;width:fit-content">
   <span style="font-size:22px">🪙</span><span style="font-size:18px;font-weight:bold;color:#e6c229">${c.gold || 0}</span><span style="color:#aaa;font-size:12px">ouro de ${c.name}</span></div>
 <div style="display:flex;flex-wrap:wrap;gap:10px">`+ SKINS[c.name].map((sk, i) => {
      const owned = c.skinOwned.includes(i), eq = c.skinIdx === i, rc = RARITY[sk.rar] || '#888', afford = owned || (c.gold || 0) >= sk.cost;
      return `<div style="width:128px;border-radius:10px;padding:8px;text-align:center;background:#1b1712;border:2px solid ${eq ? '#e6c229' : rc};box-shadow:0 0 ${eq ? '10px #e6c229' : sk.glow ? '8px ' + sk.glow + 'aa' : '0px'};position:relative">
   <div style="font-size:9px;color:${rc};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${RNAME[sk.rar] || ''}</div>
   ${shopThumb(ci, i, sk)}
   <div style="font-size:12px;margin-top:6px;min-height:28px;display:flex;align-items:center;justify-content:center">${sk.name}</div>
   <div style="font-size:12px;color:${owned ? '#8fd18f' : '#e6c229'};margin:2px 0">${owned ? (eq ? '✓ equipado' : '✓ possuído') : '🪙 ' + sk.cost}</div>
   <button style="margin-top:2px;font-size:11px;padding:3px 8px;width:100%;${!afford && !owned ? 'opacity:.5' : ''}" onclick="buySkin(${ci},${i})">${eq ? 'Equipado' : owned ? 'Equipar' : 'Comprar'}</button></div>`
    }).join('') + '</div>'; paintShop()
}
const log = t => { logEl.textContent += '\n' + t; const q = logEl.textContent.split('\n'); if (q.length > 120) logEl.textContent = q.slice(-80).join('\n'); logEl.scrollTop = 1e9 };
function resetAll() { chars.forEach((c, i) => { c.sk = JSON.parse(JSON.stringify(base[i].sk)); c.lvl = 0; c.level = 1; c.xp = 0; c.strat = { rest: .4, alvo: 'qualquer', dist: 0 }; c.focus = 'equilibrado'; c.deaths = 0; c.fear = 0; c.best = 1 }); save(); logEl.textContent = 'Treino zerado.' }

// ---- Agente de treino: hill-climbing com orçamento de poder ----
const power = s => s.dmg * (s.h || 1) * (1 + .3 * (s.a || 0)) * (60 / s.cd) + s.range * 4;
function evalSkill(s, fo) { const lo = fo == 'alcance' ? 3 : 1, hi = fo == 'corpo' ? 2 : 7; let tot = 0; for (let k = 0; k < 20; k++) { let d = lo + Math.random() * (hi - lo + 1) | 0, cd = 0; for (let t = 0; t < 400; t++) { if (t % 15 == 0) d = Math.min(hi, Math.max(lo, d + (Math.random() < .5 ? -1 : 1))); if (cd > 0) cd--; else if (d <= s.range) { tot += s.dmg * (s.h || 1) * (1 + .3 * (s.a || 0)); cd = s.cd } } } return tot }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function train(ci) {
  const c = chars[ci]; c.lvl++; log(`— Agente treinando ${c.name} (nível ${c.lvl}) —`);
  c.sk.forEach((s, i) => {
    const budget = power(s) * 1.06; let best = { ...s }, bs = evalSkill(best, c.focus);
    for (let it = 0; it < (TC[c.focus] && s.t !== c.focus ? 120 : 400); it++) {
      const m = { ...best }; m.dmg = clamp(m.dmg + (Math.random() * 6 - 3) | 0, 3, 90); m.cd = clamp(m.cd + (Math.random() * 30 - 15) | 0, 20, 240); m.range = clamp(m.range + (Math.random() < .2 ? (Math.random() < .5 ? -1 : 1) : 0), 1, 8);
      if (power(m) > budget) continue; const sc = evalSkill(m, c.focus); if (sc > bs) { best = m; bs = sc }
    }
    log(`${s.n}: dano ${s.dmg}→${best.dmg}, recarga ${s.cd}→${best.cd}, alcance ${s.range}→${best.range}`); c.sk[i] = best
  }); save()
}

// ---- Luta ----
let ents = [], state = 'idle', fx = [], msg = '', keys = {}, banner = null, shakeT = 0, parts = [], hitstop = 0, zoomT = 0, zoomPt = null, trainMode = false;
// ---- Ataque final (finisher): etapas em frames — preparação, investida+impacto+golpe, recuperação ----
const WINDUP = 20, DASH_DUR = 12, SWING_DUR = 40, RECOVER_DUR = 16;
function spawnParts(x, y, col, n, spd, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, sp = spd * (.4 + Math.random() * .9);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life * (.7 + Math.random() * .6), max: life, col, size: size * (.6 + Math.random() * .8) })
  }
}
function tickParts() { parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= .92; p.vy *= .92; p.life-- }); parts = parts.filter(p => p.life > 0) }
function drawParts() { parts.forEach(p => { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, Math.max(.4, p.size * (p.life / p.max)), 0, 7); g.fill() }); g.globalAlpha = 1 }
function decayHit(o) { if (o.kt > 0) { o.kt--; o.kx *= .82; o.ky *= .82 } if (o.hitT > 0) o.hitT-- }
function startFinisher(e, t, s) {
  e.fin = { phase: 'windup', t: 0, target: t, skill: s, f: t.x >= e.x ? 1 : -1 }; e.f = e.fin.f; e.finvx = 0;
  const acx = e.x * T + 16, acy = e.y * T + 16; spawnParts(acx, acy, TC[s.t] || '#fff', 10, .6, 22, 2)
}
function advanceFinisher(e) {
  const fi = e.fin, s = fi.skill;
  if (fi.phase == 'windup') {
    fi.t++; const p = fi.t / WINDUP; e.finvx = -fi.f * 8 * Math.sin(p * Math.PI / 2);
    if (fi.t % 5 == 0) { const acx = e.x * T + 16 - fi.f * 6, acy = e.y * T + 16; spawnParts(acx, acy, TC[s.t] || '#fff', 4, .5, 16, 1.8) }
    if (fi.t >= WINDUP) { fi.phase = 'swing'; fi.t = 0; fi.hit = false; fi.trail = []; e.swing = SWING_DUR; e.swingMax = SWING_DUR; e.swingSkill = s; e.finvx = 0 }
    return
  }
  if (fi.phase == 'swing') {
    fi.t++; e.swing = Math.max(0, SWING_DUR - fi.t);
    const pr = Math.min(1, fi.t / DASH_DUR), fade = fi.t < DASH_DUR + 6 ? 1 : Math.max(0, 1 - (fi.t - DASH_DUR - 6) / (SWING_DUR - DASH_DUR - 6));
    e.finvx = fi.f * pr * 14 * fade; fi.trail.push({ ox: e.finvx }); if (fi.trail.length > 5) fi.trail.shift();
    if (!fi.hit && fi.t >= DASH_DUR) { fi.hit = true; resolveFinisherHit(e, fi) }
    if (fi.t >= SWING_DUR) { fi.phase = 'recover'; fi.t = 0; e.swing = 0; e.swingSkill = null }
    return
  }
  if (fi.phase == 'recover') { fi.t++; e.finvx *= .82; if (fi.t >= RECOVER_DUR) { e.fin = null; e.finvx = 0 } }
}
function resolveFinisherHit(e, fi) {
  const s = fi.skill, t = fi.target;
  const visible = state != 'world' || wents[cam] === e;
  hitstop = visible ? 6 : 0; if (visible) { shakeT = Math.max(shakeT, 10); zoomT = 8; zoomPt = { x: t.x * T + 16, y: t.y * T + 16 } }
  banner = { text: s.n, col: TC[s.t] || '#fff', t: 50 };
  const hits = s.h || 1, ar = s.a || 0, col = TC[s.t] || '#fff', tg = [t];
  if (ar > 0 && state == 'world') mons.forEach(o => { if (o !== t && o.hp > 0 && o.fl === t.fl && dist(o, t) <= ar) tg.push(o) });
  tg.forEach(o => {
    const d = Math.round(s.dmg * hits * (.85 + Math.random() * .3) * ((o.res && o.res[s.t]) || 1) * 1.6); o.hp -= d; fx.push({ a: o, num: d, col, t: 30 });
    if (s.drain) { e.hp = Math.min(e.max, e.hp + Math.round(d * s.drain)); fx.push({ a: e, num: '+' + Math.round(d * s.drain), col: '#5cf05c', t: 30 }) }
    o.hitT = 16; o.kx = (o.x > e.x ? 1 : o.x < e.x ? -1 : fi.f) * 8; o.ky = 0; o.kt = 18;
    spawnParts(o.x * T + 16, o.y * T + 16, col, 22, 2.2, 26, 2.6)
  });
  fx.push({ a: t, b: t, t: 22, t0: 22, ring: 1, col, rad: 1.8 * T });
  if (ar > 0) fx.push({ a: t, b: t, t: 18, t0: 18, ring: 1, col, rad: (ar + .5) * T });
  if (s.range > 2) fx.push({ a: e, b: t, t: 22, t0: 22, r: s.range, col, w: 4, typ: s.t, wpn: e.c.name });
  s.use = (s.use || 0) + 1; const i = e.sk.indexOf(s);
  if (s.ev && (s.st || 0) < s.ev.length && s.use >= [40, 120][s.st || 0]) {
    s.st = (s.st || 0) + 1; s.n = s.ev[s.st - 1]; s.dmg = Math.round(s.dmg * 1.2); if (s.eh) s.h = (s.h || 1) + 1; if (s.ea) s.a = (s.a || 0) + 1; s.cd = Math.max(20, Math.round(s.cd * .95));
    log(`${e.c.name} evoluiu: ${s.n}!`); if (e.c.sk[i]) Object.assign(e.c.sk[i], { n: s.n, st: s.st, dmg: s.dmg, h: s.h, a: s.a, cd: s.cd, use: s.use }); save()
  }
  else if (e.c.sk[i]) e.c.sk[i].use = s.use;
  if (state == 'world') { for (const o of tg) { if (o.hp <= 0 && !o.dead) { o.dead = 1; gain(e, o); if (o.boss) { getMap(o.fl).cleared = true; e.c.fear = Math.max(0, e.c.fear - 1); log(`${e.c.name} derrotou o chefe ${o.n} (andar ${o.fl})!`) } } } }
}
const mk = (ci, x, y, h) => ({ c: chars[ci], x, y, hp: 200 + 20 * (chars[ci].level - 1), max: 200 + 20 * (chars[ci].level - 1), sk: chars[ci].sk.map(s => ({ ...s, cdl: 0 })), mcd: 0, human: h });
let auto = false, rounds = 0;
function start(play, a) {
  auto = !!a; if (auto) { const i = Math.random() * chars.length | 0; let j; do { j = Math.random() * chars.length | 0 } while (j == i); sa.value = i; sb.value = j; rounds++; log(`\n=== Rodada ${rounds}: ${chars[i].name} x ${chars[j].name} ===`) }
  ents = [mk(+sa.value, 2, 7, play), mk(+sb.value, 18, 7, false)]; fx = []; msg = ''; state = 'fight'
}
function afterFight(w, l) { log(`${chars[w].name} venceu ${chars[l].name}.`); train(l); train(l); train(w) }
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function step(e, dx, dy, o) { const nx = e.x + dx, ny = e.y + dy; if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2 || (nx == o.x && ny == o.y)) return; e.x = nx; e.y = ny; e.mcd = 10 }
function cast(e, t, s) {
  if (e.fin || s.cdl > 0 || e.gcd > 0 || dist(e, t) > s.range) return; s.cdl = s.cd; e.gcd = 12; e.f = t.x >= e.x ? 1 : -1; e.tgt = t; e.tgtT = 70;
  if (s.esp) { startFinisher(e, t, s); return }
  e.swing = 16; e.swingMax = 16; e.swingSkill = s;
  const hits = s.h || 1, ar = s.a || 0, col = TC[s.t] || '#fff', tg = [t];
  if (ar > 0 && state == 'world') mons.forEach(o => { if (o !== t && o.hp > 0 && o.fl === t.fl && dist(o, t) <= ar) tg.push(o) });
  tg.forEach(o => {
    const d = Math.round(s.dmg * hits * (.85 + Math.random() * .3) * ((o.res && o.res[s.t]) || 1)); o.hp -= d; fx.push({ a: o, num: d, col, t: 30 });
    if (s.drain) { e.hp = Math.min(e.max, e.hp + Math.round(d * s.drain)); fx.push({ a: e, num: '+' + Math.round(d * s.drain), col: '#5cf05c', t: 30 }) }
  });
  if (s.range > 2) fx.push({ a: e, b: t, t: 14, t0: 14, r: s.range, col, w: Math.min(6, 2 + hits / 2), typ: s.t, wpn: e.c.name }); if (ar > 0) fx.push({ a: t, b: t, t: 16, t0: 16, ring: 1, col, rad: (ar + .5) * T });
  s.use = (s.use || 0) + 1; const i = e.sk.indexOf(s);
  if (s.ev && (s.st || 0) < s.ev.length && s.use >= [40, 120][s.st || 0]) {
    s.st = (s.st || 0) + 1; s.n = s.ev[s.st - 1]; s.dmg = Math.round(s.dmg * 1.2); if (s.eh) s.h = (s.h || 1) + 1; if (s.ea) s.a = (s.a || 0) + 1; s.cd = Math.max(20, Math.round(s.cd * .95));
    log(`${e.c.name} evoluiu: ${s.n}!`); if (e.c.sk[i]) Object.assign(e.c.sk[i], { n: s.n, st: s.st, dmg: s.dmg, h: s.h, a: s.a, cd: s.cd, use: s.use }); save()
  }
  else if (e.c.sk[i]) e.c.sk[i].use = s.use
}
function ai(e, t) {
  const d = dist(e, t); const rdy = pick(e, t, d); if (rdy) cast(e, t, rdy);
  if (e.mcd > 0) return; const esp = e.c.sk.find(s => s.esp), want = (esp && esp.cdl == 0) ? esp.range : (e.c.pref || 1); const sx = Math.sign(t.x - e.x), sy = Math.sign(t.y - e.y);
  if (d > want) { Math.abs(t.x - e.x) >= Math.abs(t.y - e.y) ? step(e, sx, 0, t) : step(e, 0, sy, t) }
  else if (d < want - 1) { Math.abs(t.x - e.x) >= Math.abs(t.y - e.y) ? step(e, -sx, 0, t) : step(e, 0, -sy, t) }
}
function tick() {
  if (hitstop > 0) { hitstop--; return } if (banner && banner.t > 0) banner.t--; if (shakeT > 0) shakeT--; if (zoomT > 0) zoomT--; tickParts(); if (state == 'leisure') { leisureTick(); return } if (state == 'world') { wtick(); return } if (state != 'fight') return;
  ents.forEach((e, i) => {
    decayHit(e); const t = ents[1 - i]; e.sk.forEach(s => s.cdl > 0 && s.cdl--); e.mcd > 0 && e.mcd--; e.gcd > 0 && e.gcd--;
    if (e.fin) { advanceFinisher(e); return }
    e.swing > 0 && e.swing--;
    if (e.human) { if (e.mcd == 0) { const dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0); if (dx) step(e, dx, 0, t); else if (dy) step(e, 0, dy, t) } } else ai(e, t)
  });
  fx.forEach(f => f.t--); fx = fx.filter(f => f.t > 0);
  const dead = ents.findIndex(e => e.hp <= 0);
  if (dead >= 0 && trainMode) { ents[dead].hp = ents[dead].max; ents[dead].fin = null; ents[dead].swing = 0; ents[dead].kx = 0; ents[dead].ky = 0; ents[dead].kt = 0; ents[dead].hitT = 0 }
  else if (dead >= 0) {
    state = 'over'; msg = ents[1 - dead].c.name + ' venceu!';
    if (auto) { const w = chars.indexOf(ents[1 - dead].c), l = chars.indexOf(ents[dead].c); setTimeout(() => { if (!auto) return; afterFight(w, l); start(false, true) }, 2500) }
  }
}
addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = 1; if (state == 'fight' && ents[0].human && '123456'.includes(k) && ents[0].sk[k - 1]) cast(ents[0], ents[1], ents[0].sk[k - 1]); if (k.startsWith('arrow')) e.preventDefault() });
addEventListener('keyup', e => delete keys[e.key.toLowerCase()]);

// ---- Desenho ----
const looks = { 'Espadachim': { style: 'helmet', skin: '#f2c9a0', w: '#cfd8e3', eye: '#5ac8e0', acc: 'cape' }, 'Mago': { style: 'long', skin: '#f0cf9e', w: '#e94', eye: '#c99aff', acc: 'hat' }, 'Ninja': { style: 'twin', skin: '#edc49a', w: '#9ab', eye: '#e0e0e0', acc: 'mask' }, 'Lutador': { style: 'spiky', skin: '#d9a06c', w: '#000', eye: '#e0923c', acc: 'band' }, 'Vampiro': { style: 'spiky', skin: '#ddd9d2', w: '#3a1a20', eye: '#e0a23a', acc: 'cape' } };
const VAMP_SPRITE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAkCAYAAADo6zjiAAACZ0lEQVR4nLVXsW7UQBAdR4Tigs97RCBXFIjyaK6guAqkC6EhFUj5DBokhK48ISSafAYSVEkFOYlUKQhKw5WIIjSjoHD2WbkmEqZaZ2zP7s7a4VX2znre253n8TqAFlBhlOvrJEuDJjm8HqKEGnEcAyLW5koFiSZR4jiOnfOpIJcQpwBNLiE2CbGJWPlf5PQ5rnQiAW3Ipc8bBdhUN4Epn7E2Kozytqun4N4UAIBrV8ZgQTfssuOI2F7AdH8XRhtbjUR0wy5fApf7p/u7RiIt5u2bMbx6PSmIFtmiNhcRzQKq5FwNZ9+/GoV8O7qMaSFcDnEJbGQ+qDYlPw+8eHp5vbNXC6sfz8ndS1FKZyNiyZn7MjnAqPfu6gRQ0w0OTq1z7z47ERF7CdDOHhycwvHD21bynx/v1MYR0diI5CXY2SuTVzyQ3PtQIp/Oyx5IsjTgvop+JmSMVxVR4Ej21hh3gG4bIoq6XROwAuh2URH9+w+cQkYbW6Um5IL4TKjCKFdKAQDAk/OLYnx8/AUmg0fF/WG8DgAAJ7/Kb4PpVCQyoe1sQMkptlfXJKnlh1K9ehOqX7shnkG/04HZcgnvL86L8epOOHeg7cmo3+nAJLpV7IgKo5zmlJXAsXoTZsulUYiGtQ/4rH6RLUplOIzXYYhnJTG0FCIBAM1XTzFOfxfXVQ9YD6W+AjgjUnBmtP+YeK6eO3ZRbK+u+XmA4s98Xhu72evV4nTe8PoNY2PScJZA429e9+NKEIjjAHw3FDciE0GSpZsqjD5Z4lYOUR9IsnTTNu6K2+DywGOnOjd0js9cUPo1bCOEJdb4B4oDBMHftEsWAAAAAElFTkSuQmCC';
const imgs = {}; chars.forEach((c, i) => { const im = new Image(); im.onload = () => imgs[i] = im; im.src = c.name == 'Vampiro' ? VAMP_SPRITE : 'sprites/' + i + '.png' });
function rr(x, y, w, h, r, f) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = f; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#1a1010'; g.stroke() }
function tri(a, b, c, d, e2, f, fill) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.lineTo(e2, f); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#1a1010'; g.stroke() }
const BLADES = [{ c: ['#f5f8ff', '#cfd9ec', '#8f9db4', '#5c6478'], curve: 0, jag: 0, hilt: '#d8b34a' },
{ c: ['#eafff2', '#a9e8c5', '#5fae82', '#2e6b4d'], curve: 1, jag: 0, hilt: '#7a3c3c' },
{ c: ['#fff2e0', '#e8c98a', '#b8843e', '#7a5220'], curve: -1, jag: 1, hilt: '#3a3a44' }];
function swordAt(ox, oy, ang, len, vi) {
  const V = BLADES[(vi || 0) % 3]; g.save(); g.translate(ox, oy); g.rotate(ang);
  g.fillStyle = '#00000030'; g.beginPath(); g.ellipse(len * .55, 1.8, len * .5, 2.4, 0, 0, 7); g.fill();
  const gr = g.createLinearGradient(0, -3, 0, 3); gr.addColorStop(0, V.c[0]); gr.addColorStop(.4, V.c[1]); gr.addColorStop(.55, V.c[2]); gr.addColorStop(1, V.c[3]);
  const cv = V.curve * 3; g.beginPath(); g.moveTo(3, -2.6);
  if (V.jag) { for (let i = 1; i <= 4; i++) { const t = i / 4; g.lineTo(3 + (len - 9) * t, -2.6 + cv * t + (i % 2 ? 2.2 : 0)) } }
  else g.quadraticCurveTo(3 + (len - 9) * .5, -2.4 + cv, len - 6, -1.1 + cv);
  g.lineTo(len, cv * .4); g.lineTo(len - 6, 1.1 + cv * .4); g.lineTo(3, 2.6); g.closePath();
  g.fillStyle = gr; g.fill(); g.lineWidth = .8; g.strokeStyle = '#20242c'; g.stroke();
  g.strokeStyle = '#ffffffa0'; g.lineWidth = .6; g.beginPath(); g.moveTo(4, -1.6); g.quadraticCurveTo(3 + (len - 9) * .5, -1.8 + cv, len - 7, -.7 + cv); g.stroke();
  g.fillStyle = V.hilt; g.fillRect(-2.5, -4.5, 3.5, 9);
  g.fillStyle = '#241a10'; g.fillRect(-11, -1.8, 8.5, 3.6); g.fillStyle = '#0006'; g.fillRect(-11, -.3, 8.5, 1);
  g.restore()
}
// ---- Visão 3D: modo 'mapa' (cenário 3D, ver map3d.js), 'sprite' (personagem 3D sobre o mapa 2D) ou '2d' ----
let vmode = 'mapa';
try { const sv = localStorage.getItem('arena-anime-vmode'); if (sv == 'mapa' || sv == 'sprite' || sv == '2d') vmode = sv; else if (localStorage.getItem('arena-anime-3d') == '0') vmode = '2d' } catch (e) { }
let view3d = vmode != '2d';
const rd3 = new R3.Renderer(128, 128);
// prévia 3D das skins na loja: pose parada em 3/4, gira ao passar o mouse
const rdS = new R3.Renderer(96, 96), shopRigs = {};
function shopThumb(ci, i, sk) {
  if (!view3d) return `<div style="width:52px;height:52px;margin:0 auto;border-radius:50%;background:radial-gradient(circle at 35% 30%,${sk.accent},${sk.body} 55%,${sk.shadow || sk.body} 100%);border:2px solid ${sk.glow || sk.accent};box-shadow:${sk.glow ? '0 0 10px ' + sk.glow + 'cc' : 'none'}"></div>`;
  return `<canvas class="p3" data-ci="${ci}" data-si="${i}" width="96" height="96" style="display:block;margin:0 auto;width:96px;height:96px;image-rendering:pixelated;border-radius:10px;background:radial-gradient(circle at 50% 78%,${sk.glow || sk.accent}66,#14110d 74%)"></canvas>`
}
function shopRig(ci, i) {
  const c = chars[ci], sk = SKINS[c.name][i], sw = c.name == 'Espadachim' ? Math.min(3, 1 + ((c.sk[0] && c.sk[0].st) || 0)) : 1;
  const key = c.name + '|' + i + '|' + sw;
  if (!shopRigs[key]) shopRigs[key] = R3.build(c.name, { body: sk.body, hair: sk.hair, accent: sk.accent, shadow: sk.shadow, glow: sk.glow || null, coat: !!sk.coat }, { swords: sw });
  return shopRigs[key]
}
function shopDraw(cv, yaw, t) {
  const ci = +cv.dataset.ci, si = +cv.dataset.si, sk = SKINS[chars[ci].name][si], rg = shopRig(ci, si);
  rg.root.rot[1] = yaw; rg.pose({ t, anim: 'idle' });
  rdS.clear(); rdS.inner = true; rdS.setView({ yaw: 0, pitch: 20, scale: 26 * (rg.def.fit || 1), cx: 48, cy: 84 });
  rdS.drawRig(rg); rdS.finish({ outline: true });
  if (sk.glow) { const p = rdS.project([0, 1.4, 0]); rdS.halo(p[0], p[1], 30, 34, R3.hex(sk.glow), .5, 4) }
  const cx = cv.getContext('2d'); cx.clearRect(0, 0, 96, 96); rdS.blit(cx, 0, 0, 96, 96)
}
function paintShop() {
  if (!view3d) return;
  document.querySelectorAll('#shopBody canvas.p3').forEach(cv => {
    try { shopDraw(cv, 28, .4) } catch (err) { console.error('Prévia 3D da loja falhou:', err); return }
    let raf = 0, t0 = 0;
    const spin = ts => { if (!t0) t0 = ts; const s = (ts - t0) / 1000; shopDraw(cv, 28 + s * 90, .4 + s); raf = requestAnimationFrame(spin) };
    cv.onmouseenter = () => { if (!raf) { t0 = 0; raf = requestAnimationFrame(spin) } };
    cv.onmouseleave = () => { cancelAnimationFrame(raf); raf = 0; shopDraw(cv, 28, .4) }
  })
}
function rig3(c) {
  const sw = c.name == 'Espadachim' ? Math.min(3, 1 + ((c.sk[0] && c.sk[0].st) || 0)) : 1;
  const pal = { body: c.body, hair: c.hair, accent: c.accent, shadow: c.shadow, glow: c.glow || null, coat: !!c.coatLong };
  const key = [c.name, pal.body, pal.hair, pal.accent, pal.glow, pal.coat, sw].join('|');
  if (!c._r3 || c._r3.key != key) c._r3 = { key, rig: R3.build(c.name, pal, { swords: sw }) }; return c._r3.rig
}
function draw3D(e, x, y, f) { // alvo de treino (sem rig próprio) usa o corpo do Lutador
  try {
    const c = SKINS[e.c.name] ? e.c : chars.find(k => k.name == 'Lutador'), rg = rig3(c), px = x + 16 + (e.finvx || 0), py = y + 29;
    if (e._sx === undefined || Math.abs(px - e._sx) > 90 || Math.abs(py - e._sy) > 90) { e._sx = px; e._sy = py; e._yaw = undefined }
    const dx = px - e._sx, dy = py - e._sy, d = Math.hypot(dx, dy); e._sx += dx * .28; e._sy += dy * .28;
    e._ph = (e._ph || 0) + Math.min(d, 6) * .34; e._mv = d > .9 ? 10 : Math.max(0, (e._mv || 0) - 1);
    let tgt = f * 55;
    if (state != 'fight' && e._mv > 0 && d > .9) { tgt = Math.abs(dx) >= Math.abs(dy) * .8 ? Math.sign(dx) * 55 : (dy > 0 ? 0 : 180) }
    else if (state != 'fight' && e._yaw !== undefined) tgt = e._yaw > 90 || e._yaw < -90 ? 180 : e._yaw;
    if (e._yaw === undefined) e._yaw = tgt;
    let dd = ((tgt - e._yaw + 540) % 360) - 180; e._yaw += dd * .25;
    const S = { t: (e._t3 = (e._t3 || 0) + 1 / 60), anim: 'idle' };
    if (e.hp <= 0) { e._dt = (e._dt || 0) + 1; S.anim = 'die'; S.p = Math.min(1, e._dt / 69) }
    else {
      e._dt = 0;
      if (e.fin) { const fi = e.fin; S.anim = 'spec'; S.p = fi.phase == 'windup' ? .26 * fi.t / WINDUP : fi.phase == 'swing' ? .26 + .56 * fi.t / SWING_DUR : .82 + .18 * fi.t / RECOVER_DUR }
      else if (e.swing > 0 && e.swingSkill) { S.anim = e.swingSkill.range > 2 ? 'cast' : 'atk'; S.p = 1 - e.swing / e.swingMax }
      else if (e._mv > 0) { S.anim = 'walk'; S.phase = e._ph; S.speed = 1 }
      if (e.hitT > 0) S.hit = e.hitT / 16
    }
    rg.root.rot[1] = e._yaw; rg.pose(S); R3.trailSample(rg);
    rd3.clear(); rd3.inner = true; rd3.setView({ yaw: 0, pitch: 26, scale: 21 * (rg.def.fit || 1), cx: 64, cy: 100 });
    rd3.drawRig(rg); rd3.finish({ outline: true }); R3.drawTrails(rd3, rg);
    if (c.glow) { const p = rd3.project([0, 1.4, 0]); rd3.halo(p[0], p[1], 34, 38, R3.hex(c.glow), .5, 4) }
    rd3.blit(g, Math.round(e._sx - 64), Math.round(e._sy - 100), 128, 128);
    return true
  }
  catch (err) { if (!draw3D.err) { draw3D.err = 1; console.error('Visão 3D desativada:', err) } setVMode('2d'); return false }
}

// ---- Mapa 3D: lazer, cidade, masmorra e arena em 3D com câmera orbital; os agentes andam e o corpo gira para onde vão ----
const WD = R3.World, K3 = .5; // K3: escala dos personagens (1 = tamanho do rig; .5 ≈ 1,45 casa de altura)
const M3 = { fz: 1, slow: 0, yaw: 28, pitch: 50, zoom: 1.2, ps: 2, rd: null, sc: new WeakMap(), leis: null, arena: null, tx: null, tz: null, manual: false, dp: { x: 0, z: 0 }, cam: null, list: [], drag: null, pts: new Map(), moved: false, pinch: 0 };
try { const q = +localStorage.getItem('arena-anime-vq'); if (q == 1 || q == 2 || q == 3) { M3.ps = q; M3.userVQ = true } const z = +localStorage.getItem('arena-anime-zoom'); if (z >= .6 && z <= 2.6) M3.zoom = z; const y = +localStorage.getItem('arena-anime-yaw'); if (!isNaN(y) && localStorage.getItem('arena-anime-yaw') !== null) M3.yaw = y } catch (e) { }
function map3d() { return vmode == 'mapa' }
// obstáculos do local de lazer (móveis), para os agentes contornarem
let _lmap = null;
function lmap() {
  if (_lmap) return _lmap; const solid = Array.from({ length: LH }, (_, j) => Array.from({ length: LW }, (_, i) => i == 0 || j == 0 || i == LW - 1 || j == LH - 1));
  const R = (x0, y0, x1, y1) => { for (let j = y0; j <= y1; j++)for (let i = x0; i <= x1; i++)solid[j][i] = true };
  R(3, 2, 5, 2); R(15, 2, 17, 2); R(9, 5, 12, 5); R(14, 7, 17, 8); R(3, 7, 4, 8); R(10, 11, 10, 12); R(1, 6, 1, 6); R(18, 6, 18, 6); R(1, 1, 1, 1); R(18, 1, 18, 1); R(1, 11, 1, 11); R(18, 11, 18, 11);
  return _lmap = { W: LW, H: LH, solid }
}
function setVQ(v) { M3.ps = +v == 1 ? 1 : +v == 3 ? 3 : 2; M3.userVQ = true; M3.rd = null; try { localStorage.setItem('arena-anime-vq', M3.ps) } catch (e) { } }
function camSave() { try { localStorage.setItem('arena-anime-zoom', M3.zoom.toFixed(2)); localStorage.setItem('arena-anime-yaw', Math.round(M3.yaw)) } catch (e) { } }
function camRot(d) { M3.yaw = ((M3.yaw + d) % 360 + 360) % 360; camSave() }
function camZoom(f) { M3.zoom = clamp(M3.zoom * f, .6, 2.6); camSave() }
function rdM() { const w = 672 / M3.ps, h = 480 / M3.ps; if (!M3.rd || M3.rd.w !== w) M3.rd = new R3.Renderer(w, h); return M3.rd }
// rig de baixo detalhe (personagens pequenos) por personagem
function rig3m(c0) {
  const c = SKINS[c0.name] ? c0 : (chars.find(k => k.name == 'Lutador') || chars[0]); // alvo de treino usa o corpo do Lutador
  const sw = c.name == 'Espadachim' ? Math.min(3, 1 + ((c.sk[0] && c.sk[0].st) || 0)) : 1;
  const pal = { body: c.body, hair: c.hair, accent: c.accent, shadow: c.shadow, glow: c.glow || null, coat: !!c.coatLong };
  const key = [c.name, pal.body, pal.hair, pal.accent, pal.glow, pal.coat, sw].join('|');
  if (!c0._r3m || c0._r3m.key != key) { R3.lod = 1; try { c0._r3m = { key, rig: R3.build(c.name, pal, { swords: sw }) } } finally { R3.lod = 0 } } return c0._r3m.rig
}
const wrapA = a => ((a + 540) % 360) - 180;
// suaviza a posição (velocidade constante, sem "deslizar"), calcula velocidade e giro do corpo
function track3(e, wx, wz, tgt) {
  if (e._px === undefined || Math.hypot(wx - e._px, wz - e._pz) > 3.5) { e._px = wx; e._pz = wz; e._sp = 0; e._yw = undefined; e._st = 0 }
  const dx = wx - e._px, dz = wz - e._pz, d = Math.hypot(dx, dz), st = Math.min(d, .12);
  if (d > 1e-4) { e._px += dx / d * st; e._pz += dz / d * st }
  e._st = st; e._sp += (st * 60 - e._sp) * .25; e._ph = (e._ph || 0) + st * 4.6;
  let a = null;
  if (tgt && Math.hypot(tgt.x - e._px, tgt.z - e._pz) > .05) a = Math.atan2(tgt.x - e._px, tgt.z - e._pz) * 180 / Math.PI;
  else if (st > .02) a = Math.atan2(dx, dz) * 180 / Math.PI;
  if (e._yw === undefined) e._yw = a === null ? 0 : a; else if (a !== null) e._yw += wrapA(a - e._yw) * .22;
}
function heroDesc(e) {
  const c = e.c, rg = rig3m(c), wx = e.x + .5 + ((e.kx || 0) + (e.finvx || 0)) / T, wz = e.y + .5 + (e.ky || 0) / T;
  let tg = null;
  if (state == 'fight' || state == 'over' || state == 'idle') { const o = ents[0] === e ? ents[1] : ents[0]; if (o) tg = { x: o.x + .5, z: o.y + .5 } }
  else if (e.fin && e.fin.target) tg = { x: e.fin.target.x + .5, z: e.fin.target.y + .5 };
  else if (e.tgt && e.tgtT > 0 && e.tgt.hp > 0) { e.tgtT--; tg = { x: e.tgt.x + .5, z: e.tgt.y + .5 } }
  track3(e, wx, wz, tg);
  const S = { t: (e._t3 = (e._t3 || 0) + 1 / 60), anim: 'idle', yaw: e._yw, pos: [e._px, 0, e._pz], scale: K3 };
  if (e.hp <= 0 && state != 'world' && state != 'leisure') { e._dt = (e._dt || 0) + 1; S.anim = 'die'; S.p = Math.min(1, e._dt / 69) }
  else {
    e._dt = 0;
    if (e.fin) { const fi = e.fin; S.anim = 'spec'; S.p = fi.phase == 'windup' ? .26 * fi.t / WINDUP : fi.phase == 'swing' ? .26 + .56 * fi.t / SWING_DUR : .82 + .18 * fi.t / RECOVER_DUR }
    else if (e.swing > 0 && e.swingSkill) { S.anim = e.swingSkill.range > 2 ? 'cast' : 'atk'; S.p = 1 - e.swing / e.swingMax }
    else if (e._sp > .7) { S.anim = 'walk'; S.speed = Math.min(1.7, e._sp / 3.2); S.phase = e._ph }
    else if (state == 'leisure' && (e.act == '🎮' || e.act == '🎱' || e.act == '💻')) { S.anim = 'win'; const d = R3.ACT[c.name].win.dur; S.p = (S.t / d) % 1 }
    if (e.hitT > 0) S.hit = e.hitT / 16
  }
  rg.pose(S); R3.trailSample(rg);
  return { rig: rg, x: e._px, z: e._pz, shadow: true, shadowR: .3, trails: true, e, hero: true, top: 2.9 * K3 + .18 };
}
const MSC = [.9, .9, 1, 1, 1, 1, 1];
function monDesc(m) {
  const rg = m._r3 || (m._r3 = WD.buildMonster(m.k, m.col, m.boss)), wx = m.x + .5 + (m.kx || 0) / T, wz = m.y + .5 + (m.ky || 0) / T;
  let tg = null, bd = 9; wents.forEach(e => { if (e.fl != m.fl || e.hp <= 0) return; const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < bd) { bd = d; tg = { x: e.x + .5, z: e.y + .5 } } });
  track3(m, wx, wz, bd <= 3 ? tg : null);
  const sc = K3 * (m.boss ? 1.6 : 1) * MSC[m.k], atk = m.cdl > 0 && m.cd - m.cdl < 14 ? (m.cd - m.cdl) / 14 : undefined;
  WD.monPose(rg, { t: (m._t3 = (m._t3 || 0) + 1 / 60), walk: Math.min(1.6, m._sp / 3), phase: m._ph, atk, hit: m.hitT > 0 ? m.hitT / 16 : 0, yaw: m._yw, pos: [m._px, 0, m._pz], scale: sc });
  return { rig: rg, x: m._px, z: m._pz, shadow: !rg.def.fly, shadowR: .2 + .07 * (rg.def.h || 1) * (m.boss ? 1.6 : 1), m, top: (rg.def.h || 2) * sc + .25, boss: m.boss };
}
function scene3() {
  if (state == 'leisure') return { sc: M3.leis || (M3.leis = WD.buildLeisure(LW, LH, LSPOTS)), W: LW, H: LH };
  if (state == 'world') { const F = wents[cam], mp = getMap(F.fl); let sc = M3.sc.get(mp); if (!sc) { sc = mp.city ? WD.buildCity(mp, blds, CW, CH) : WD.buildDungeon(mp, TINT[(mp.n - 1) % 7], DW, DH); M3.sc.set(mp, sc) } return { sc, mp, W: mp.W, H: mp.H } }
  return { sc: M3.arena || (M3.arena = WD.buildArena(W, H, ARENA_PIL, ARENA_TR)), W, H };
}
// desenha cena 3D + entidades na área 672x480; devolve helpers de projeção para as sobreposições 2D
function render3D() {
  if (M3.pend) { M3.pend = false; if (M3.ps < 3) { M3.ps++; M3.rd = null; const q = document.getElementById('vq'); if (q) q.value = M3.ps } }
  const T0 = performance.now(), rd = rdM(), info = scene3(), sc = info.sc, ps = M3.ps; let ftx, ftz, F = null;
  if (state == 'world') F = wents[cam]; else if (state == 'leisure') F = lents[cam % lents.length];
  if (F) { ftx = (F._px !== undefined ? F._px : F.x + .5); ftz = (F._pz !== undefined ? F._pz : F.y + .5) }
  else if (ents.length == 2) { ftx = (ents[0].x + ents[1].x) / 2 + .5; ftz = (ents[0].y + ents[1].y) / 2 + .5 } else { ftx = info.W / 2; ftz = info.H / 2 }
  if (M3.tx === null || Math.hypot(ftx - M3.tx, ftz - M3.tz) > 10 || M3.last !== sc) { M3.tx = ftx; M3.tz = ftz; M3.last = sc }
  M3.tx += (ftx - M3.tx) * .14; M3.tz += (ftz - M3.tz) * .14;
  const fin = state == 'fight' && ents.some(e => e.fin && e.fin.phase != 'recover'); M3.fz += ((fin ? 1.7 : 1) - M3.fz) * (fin ? .12 : .06);
  const S = 32 / ps * M3.zoom * (state == 'world' || state == 'leisure' ? 1 : .95 * M3.fz) * (1 + (zoomT > 0 ? zoomT * .006 : 0)), amp = shakeT * .22, ox = shakeT > 0 ? Math.sin(shakeT * 2.1) * amp / ps : 0, oy = shakeT > 0 ? Math.cos(shakeT * 1.7) * amp * .6 / ps : 0;
  const tx = clamp(M3.tx, Math.min(info.W / 2, 5), Math.max(info.W / 2, info.W - 5)), tz = clamp(M3.tz, Math.min(info.H / 2, 4), Math.max(info.H / 2, info.H - 4));
  const cam3 = { tx, tz, yaw: M3.yaw, pitch: M3.pitch, S, ox, oy }; WD.setCam(rd, cam3);
  const list = [];
  if (state == 'leisure') lents.forEach(e => list.push(heroDesc(e)));
  else if (state == 'world') { const fl = F.fl; mons.forEach(m => { if (m.fl == fl) list.push(monDesc(m)) }); wents.forEach(e => { if (e.fl == fl) list.push(heroDesc(e)) }) }
  else ents.forEach(e => list.push(heroDesc(e)));
  WD.drawScene(rd, sc, list, { time: Date.now(), mp: info.mp, depthStep: .045 });
  g.fillStyle = '#0b0908'; g.fillRect(0, 0, 672, 480); rd.blit(g, 0, 0, 672, 480);
  M3.cam = cam3; M3.list = list; M3.info = info;
  // se o aparelho for lento, aumenta o pixel sozinho (só enquanto a pessoa não escolheu a qualidade)
  const dt = performance.now() - T0; M3.ema = M3.ema === undefined ? dt : M3.ema * .95 + dt * .05;
  if (!M3.userVQ && M3.ema > 26 && M3.ps < 3) { if (++M3.slow > 90) { M3.pend = true; M3.slow = 0; M3.ema = 0 } } else M3.slow = 0;
  return list;
}
const pj3 = (x, y, z) => { const q = M3.rd.project([x, y, z]); return [q[0] * M3.ps, q[1] * M3.ps] };
// matriz que leva coordenadas de mapa em px (casa*T) para o canvas, num plano à altura h
function gm3(h) { const rd = M3.rd, P0 = rd.project([0, h, 0]), Px = rd.project([1, h, 0]), Pz = rd.project([0, h, 1]), ps = M3.ps; return [(Px[0] - P0[0]) * ps / T, (Px[1] - P0[1]) * ps / T, (Pz[0] - P0[0]) * ps / T, (Pz[1] - P0[1]) * ps / T, P0[0] * ps, P0[1] * ps] }
function labels3(list, showAct) {
  const info = M3.info, sc = info.sc; g.textAlign = 'center';
  (sc.labels || []).forEach(l => { const q = pj3(l.x, l.h, l.z); if (q[0] < -40 || q[0] > 712 || q[1] < 0 || q[1] > 500) return; g.font = 'bold 11px sans-serif'; g.fillStyle = '#000'; g.fillText(l.text, q[0] + 1, q[1] + 1); g.fillStyle = l.col || '#8fd18f'; g.fillText(l.text, q[0], q[1]) });
  if (state == 'leisure') { g.font = '16px sans-serif'; LSPOTS.forEach(s => { const q = pj3(s.x + .5, 0, s.y + .5); g.fillText(s.act, q[0], q[1] + 6) }) }
  list.slice().sort((a, b) => a.z - b.z).forEach(d => {
    const q = pj3(d.x, d.top, d.z), x = q[0], y = q[1]; if (x < -30 || x > 702 || y < -10 || y > 500) return;
    if (d.hero) {
      const e = d.e, c = e.c; let Y = y;
      g.fillStyle = '#000'; g.fillRect(x - 15, Y - 10, 30, 7); g.fillStyle = '#3a3a3a'; g.fillRect(x - 14, Y - 9, 28, 5);
      const hp = Math.max(0, e.hp); g.fillStyle = hp > 100 ? '#3ecf3e' : hp > 50 ? '#dcd23c' : '#d9393c'; g.fillRect(x - 13, Y - 8, 26 * hp / e.max, 3); g.fillStyle = '#ffffff55'; g.fillRect(x - 13, Y - 8, 26 * hp / e.max, 1);
      g.fillStyle = '#fff'; g.font = '10px sans-serif'; g.fillText(c.name + ' Nv' + (c.level || 1), x, Y - 12);
      if (c.sayT > 0) { const t = c.say, w = g.measureText(t).width + 10; g.fillStyle = '#fffe'; g.fillRect(x - w / 2, Y - 30, w, 14); g.fillStyle = '#111'; g.fillText(t, x, Y - 19) }
      if (showAct && e.act) { g.font = '14px sans-serif'; g.fillStyle = '#fffb'; g.beginPath(); g.arc(x, Y - 36, 9, 0, 7); g.fill(); g.fillStyle = '#000'; g.fillText(e.act, x, Y - 31) }
    }
    else {
      const m = d.m, s = m.boss ? 1.6 : 1, w = 26 * s; g.fillStyle = '#000'; g.fillRect(x - w / 2, y - 4, w, 4); g.fillStyle = m.boss ? '#e33' : '#c33'; g.fillRect(x - w / 2 + 1, y - 3, (w - 2) * m.hp / m.max, 2);
      if (m.boss) { g.font = 'bold 11px sans-serif'; g.fillStyle = '#000'; g.fillText(m.n, x + 1, y - 7); g.fillStyle = '#f66'; g.fillText(m.n, x, y - 8) }
    }
  })
  if (M3.manual) { const F = state == 'world' ? wents[cam] : state == 'leisure' ? lents[cam % lents.length] : null; if (F && F._px !== undefined) { const q = pj3(F._px, 0, F._pz); g.strokeStyle = '#e6c229'; g.lineWidth = 2; g.beginPath(); g.ellipse(q[0], q[1], 16, 8, 0, 0, 7); g.stroke() } }
}
function fx3(world) {
  fx.forEach(f => {
    if (world && f.a.fl !== wents[cam].fl) return;
    if (f.num) { if (!world) return; const q = pj3(f.a.x + .5, K3 * 3 + .2, f.a.y + .5), yy = q[1] - (30 - f.t) * .8; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(f.num, q[0] + 1, yy + 1); g.fillStyle = f.col; g.fillText(f.num, q[0], yy); return }
    g.save();
    if (f.ring) { if (!world) { g.restore(); return } const m = gm3(.06); g.transform(m[0], m[1], m[2], m[3], m[4], m[5]); const px = f.a.x * T + 16, py = f.a.y * T + 16; g.strokeStyle = f.col || '#f55'; g.lineWidth = 3; g.globalAlpha = Math.min(1, f.t / 8); g.beginPath(); g.arc(px, py, f.rad ? f.rad * (1.2 - f.t / f.t0 * .6) : (20 - f.t) * 5, 0, 7); g.stroke(); g.globalAlpha = 1 }
    else { const m = gm3(K3 * 1.7); g.transform(m[0], m[1], m[2], m[3], m[4], m[5]); g.strokeStyle = f.col || '#fff'; g.lineWidth = (f.w || 2) * f.t / 14 + 1; drawBeam(f) }
    g.restore()
  })
}
function parts3() { parts.forEach(p => { const q = pj3(p.x / T, K3 * 1.6, p.y / T); g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.col; g.beginPath(); g.arc(q[0], q[1], Math.max(.4, p.size * (p.life / p.max)) * M3.zoom, 0, 7); g.fill() }); g.globalAlpha = 1 }
function draw3DWorld(F, fl, mp) { const L = render3D(); fx3(true); parts3(); labels3(L, false); }
function draw3DArena() { const L = render3D(); fx3(false); parts3(); labels3(L, false) }
function draw3DLeisure() {
  try {
    const L = render3D(); parts3(); labels3(L, true);
    g.fillStyle = '#120f0b'; g.fillRect(0, 480, cv.width, 60); g.font = '12px sans-serif'; g.fillStyle = '#e8dcc0'; g.textAlign = 'left';
    g.fillText('Lazer — clique num agente para seguir · arraste gira a câmera · roda dá zoom', 8, 500);
    const F = lents[cam % lents.length]; if (F) { g.fillStyle = '#aaa'; g.fillText(`Seguindo ${F.c.name}`, 8, 520) } return true
  }
  catch (err) { console.error('Mapa 3D falhou:', err); setVMode('sprite'); return false }
}
// ----- seleção por clique -----
function click3D(ev) {
  if (M3.moved) { M3.moved = false; return true }
  const r = cv.getBoundingClientRect(), sx = (ev.clientX - r.left) * cv.width / r.width, sy = (ev.clientY - r.top) * cv.height / r.height;
  if (sy > 480) return false;
  let best = null, bd = 34; M3.list.forEach(d => { if (!d.hero) return; const q = pj3(d.x, d.top * .5, d.z), dd = Math.hypot(q[0] - sx, q[1] - sy); if (dd < bd) { bd = dd; best = d } });
  if (best) { const arr = state == 'world' ? wents : state == 'leisure' ? lents : null; if (arr) { const i = arr.indexOf(best.e); if (i >= 0) { cam = i; renderSkills(); return true } } }
  return false;
}
// ----- câmera: arrastar gira/inclina, roda/pinça dá zoom, Q/E giram -----
cv.addEventListener('pointerdown', ev => { if (!map3d()) return; M3.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); M3.moved = false; if (M3.pts.size == 2) { const [a, b] = [...M3.pts.values()]; M3.pinch = Math.hypot(a.x - b.x, a.y - b.y) } });
cv.addEventListener('pointermove', ev => {
  if (!map3d() || !M3.pts.has(ev.pointerId)) return; const p = M3.pts.get(ev.pointerId), dx = ev.clientX - p.x, dy = ev.clientY - p.y;
  if (M3.pts.size == 1) { if (Math.abs(dx) + Math.abs(dy) > 0) { if (M3.moved || Math.hypot(dx, dy) > 3) { M3.moved = true; M3.yaw = ((M3.yaw - dx * .4) % 360 + 360) % 360; M3.pitch = clamp(M3.pitch + dy * .25, 32, 72); p.x = ev.clientX; p.y = ev.clientY } } }
  else if (M3.pts.size == 2) { p.x = ev.clientX; p.y = ev.clientY; const [a, b] = [...M3.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (M3.pinch > 0) { M3.zoom = clamp(M3.zoom * d / M3.pinch, .6, 2.6) } M3.pinch = d; M3.moved = true }
});
const pUp = ev => { M3.pts.delete(ev.pointerId); if (M3.pts.size < 2) M3.pinch = 0; if (M3.moved) camSave() };
cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
cv.addEventListener('wheel', ev => { if (!map3d()) return; ev.preventDefault(); camZoom(ev.deltaY < 0 ? 1.1 : 1 / 1.1) }, { passive: false });
addEventListener('keydown', ev => {
  if (!map3d() || /INPUT|SELECT|TEXTAREA/.test((ev.target.tagName || ''))) return; const k = ev.key.toLowerCase();
  if (k == 'q') camRot(-15); else if (k == 'e') camRot(15); else if (k == '+' || k == '=') camZoom(1.12); else if (k == '-' || k == '_') camZoom(1 / 1.12)
});
// ----- controle manual do personagem seguido (movimento relativo à câmera) -----
function dir3() {
  let ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + M3.dp.x, iz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + M3.dp.z;
  if (!ix && !iz || !M3.rd) return null; const V = M3.rd.V;
  let wx = ix * V[0] + iz * V[2], wz = ix * V[8] + iz * V[10]; const k = Math.round(Math.atan2(wz, wx) / (Math.PI / 4)); return [Math.round(Math.cos(k * Math.PI / 4)), Math.round(Math.sin(k * Math.PI / 4))]
}
function manualWorld(e) {
  const c = e.c, f = e.fl, mp = getMap(f); if (c.sayT > 0) c.sayT--; e.sk.forEach(s => s.cdl > 0 && s.cdl--); e.mcd > 0 && e.mcd--; e.gcd > 0 && e.gcd--;
  if (e.fin) { advanceFinisher(e); if (e.hp <= 0) { e.fin = null; die(e) } return }
  e.swing > 0 && e.swing--; if (e.hp <= 0) { die(e); return }
  let m = null, bs = 99; mons.forEach(o => { if (o.fl != f || o.hp <= 0) return; const d = dist(e, o); if (d < bs) { bs = d; m = o } });
  if (m && bs <= 7) { const rdy = pick(e, m, bs); if (rdy) { cast(e, m, rdy); for (const o of mons.filter(q => q.fl == f && q.hp <= 0 && !q.dead)) { o.dead = 1; gain(e, o); if (o.boss) { mp.cleared = true; c.fear = Math.max(0, c.fear - 1); log(`${c.name} derrotou o chefe ${o.n} (andar ${f})!`) } } } }
  if (f == 0 && e.hp < e.max) { const [tx, ty] = L.Templo; if (dist(e, { x: tx, y: ty }) <= 1) e.hp = Math.min(e.max, e.hp + 1) }
  if (e.mcd == 0) {
    const d = dir3(); if (d) {
      let [dx, dz] = d;
      if (dx && dz && (mp.solid[e.y][e.x + dx] || mp.solid[e.y + dz][e.x])) { if (!mp.solid[e.y][e.x + dx]) dz = 0; else if (!mp.solid[e.y + dz][e.x]) dx = 0 }
      if (wmove(e, dx, dz)) {
        if (f == 0) { const [gx, gy] = L.gate; if (e.x == gx && e.y == gy) { e.fl = c.best; const m2 = getMap(e.fl); e.x = m2.entry.x; e.y = m2.entry.y; e.dest = null; log(`${c.name} entrou no andar ${e.fl}.`) } }
        else if (mp.cleared && e.x == mp.stairs.x && e.y == mp.stairs.y && c.level >= 2 * f + 1) { e.fl = f + 1; c.best = Math.max(c.best, e.fl); const m2 = getMap(e.fl); e.x = m2.entry.x; e.y = m2.entry.y; e.dest = null; log(`${c.name} desceu para o andar ${e.fl}.`) }
      }
    }
  }
}
function manualLeisure(e) {
  const c = e.c; if (c.sayT > 0) c.sayT--; e.act = null; e.dest = null; if ((e.mc3 = (e.mc3 || 0) - 1) > 0) return;
  const d = dir3(); if (!d) return; let [dx, dz] = d; const occ = (x, y) => lents.some(o => o !== e && o.x === x && o.y === y), nx = clamp(e.x + dx, 1, LW - 2), ny = clamp(e.y + dz, 1, LH - 2);
  if (!occ(nx, ny) && (nx != e.x || ny != e.y)) { e.x = nx; e.y = ny; e.mc3 = 18; if (dx) e.f = dx }
  const sp = LSPOTS.find(s => s.x == e.x && s.y == e.y); if (sp) e.act = sp.act;
}
const isManual = e => M3.manual && map3d() && ((state == 'world' && wents[cam] === e) || (state == 'leisure' && lents[cam % lents.length] === e));
// ----- seleção do modo de visão -----
function setVMode(v) {
  vmode = v; view3d = v != '2d'; try { localStorage.setItem('arena-anime-vmode', v) } catch (e) { } const s = document.getElementById('vm'); if (s) s.value = v; cv.style.touchAction = v == 'mapa' ? 'none' : 'manipulation';
  const b = document.getElementById('cam3'); if (b) b.style.display = v == 'mapa' ? 'flex' : 'none'; const sh = document.getElementById('shop'); if (sh && getComputedStyle(sh).display != 'none') renderShop()
}

function drawChar(e) {
  const x = e.x * T + (e.kx || 0), y = e.y * T + (e.ky || 0), c = e.c, ci = chars.indexOf(c), L = looks[c.name] || looks.Lutador, f = e.f || (ents[0] === e ? 1 : -1), Y = y - (view3d ? 18 : 0);
  if (e.fin && e.fin.phase == 'windup') {
    const p = e.fin.t / WINDUP, col = TC[e.fin.skill.t] || '#fff';
    g.globalAlpha = p * .55; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x + 16, y + 16, 10 + p * 16, 0, 7); g.stroke(); g.globalAlpha = 1
  }
  if (e.fin && e.fin.trail && e.fin.trail.length) {
    const col = TC[e.fin.skill.t] || c.body;
    e.fin.trail.forEach((tr, idx) => { g.globalAlpha = .11 * (idx + 1) / e.fin.trail.length; g.fillStyle = col; g.beginPath(); g.ellipse(x + 16 + tr.ox, y + 16, 13, 15, 0, 0, 7); g.fill() }); g.globalAlpha = 1
  }
  if (e.swingSkill && e.swingSkill.esp && e.swing > 0) {
    const p = 1 - e.swing / e.swingMax, col = TC[e.swingSkill.t] || '#fff', acx = x + 16, acy = y + 16;
    g.globalAlpha = p < .4 ? p * 1.4 : Math.max(0, 1 - (p - .4) * 1.6); const gr = g.createRadialGradient(acx, acy, 2, acx, acy, 42); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(acx, acy, 42, 0, 7); g.fill(); g.globalAlpha = 1;
    if (p > .32 && p < .62) {
      g.strokeStyle = col; g.lineWidth = 1.6; g.globalAlpha = (1 - Math.abs(p - .47) * 3.2) * .85;
      for (let i = 0; i < 10; i++) { const ang = i / 10 * 6.283 + p; g.beginPath(); g.moveTo(acx + Math.cos(ang) * 28, acy + Math.sin(ang) * 28); g.lineTo(acx + Math.cos(ang) * 66, acy + Math.sin(ang) * 66); g.stroke() } g.globalAlpha = 1
    }
  }
  g.fillStyle = '#0005'; g.beginPath(); g.ellipse(x + 16, y + 29, 11, 3.5, 0, 0, 7); g.fill();
  if (view3d && draw3D(e, x, y, f)) { } else if (imgs[ci]) {
    const im = imgs[ci], dh = 46, dw = dh * (im.width / im.height), dx = x + 16 - dw / 2, dy = y + 30 - dh;
    g.imageSmoothingEnabled = false; g.drawImage(im, dx, dy, dw, dh); g.imageSmoothingEnabled = true
  } else {
    const cx = x + 16 + (e.finvx || 0), y0 = y + Math.round(Math.sin(Date.now() / 160 + e.x) * 1);
    const auraCol = c.glow || c.accent || '#ffffff', auraG = g.createRadialGradient(cx, y0 + 12, 2, cx, y0 + 12, 24); auraG.addColorStop(0, auraCol + (c.glow ? '70' : '55')); auraG.addColorStop(1, auraCol + '00');
    g.fillStyle = auraG; g.beginPath(); g.arc(cx, y0 + 12, 24, 0, 7); g.fill();
    rr(cx - 7, y0 + 22, 6, 8, 2, '#241a14'); rr(cx + 1, y0 + 22, 6, 8, 2, '#241a14');
    g.fillStyle = (c.accent || '#888') + 'aa'; g.fillRect(cx - 7, y0 + 22, 6, 2); g.fillRect(cx + 1, y0 + 22, 6, 2);
    if (c.name == 'Espadachim') {
      const n = Math.min(3, 1 + (c.sk[0] && c.sk[0].st || 0)), isE = e.swingSkill && e.swingSkill.esp, bo = isE ? 1.7 : 1;
      if (e.swing > 0) {
        const p = 1 - e.swing / e.swingMax, ang = -.95 + p * 1.9, lunge = Math.sin(p * Math.PI) * 5 * bo;
        g.save(); g.translate(cx + f * lunge, y0 + 22); g.scale(f, 1); for (let k = 0; k < n; k++)swordAt(9, (k - (n - 1) / 2) * 3, ang, (26 + k * 2) * bo, k); g.restore();
        if (isE && p > .2 && p < .8) { g.globalAlpha = (1 - Math.abs(p - .5) * 2) * .5; g.fillStyle = '#ffd76b'; g.beginPath(); g.arc(cx + f * 14, y0 + 16, 34, 0, 7); g.fill(); g.globalAlpha = 1 }
        if (p > .3 && p < .7) { g.globalAlpha = 1 - Math.abs(p - .5) * 4; g.strokeStyle = '#fff'; g.lineWidth = isE ? 5 : 3; g.beginPath(); g.arc(cx + f * 14, y0 + 18, 20 * bo, -2.4, -.7); g.stroke(); g.globalAlpha = 1 }
      }
      else { const sway = Math.sin(Date.now() / 260 + e.x) * .06; g.save(); g.translate(cx, y0 + 22); g.scale(f, 1); for (let k = 0; k < n; k++)swordAt(9, 0, -.36 * (n - 1) / 2 + k * .36 + sway, 25 + k * 3, k); g.restore() }
    }
    else if (c.name == 'Mago') {
      const p = e.swing > 0 ? 1 - e.swing / e.swingMax : 0, isE = e.swingSkill && e.swingSkill.esp, bo = isE ? 1.9 : 1, col = e.swingSkill ? (TC[e.swingSkill.t] || '#c88cff') : '#c88cff', rad = e.swing > 0 ? (3 + p * 6) * bo : 3 + Math.sin(Date.now() / 200) * 1;
      g.strokeStyle = '#6b4a2a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx + f * 10, y0 + 26); g.lineTo(cx + f * 10, y0 + 4); g.stroke();
      g.globalAlpha = e.swing > 0 ? .5 + p * .5 : .6; g.fillStyle = col; g.beginPath(); g.arc(cx + f * 10, y0 + 2, rad, 0, 7); g.fill(); g.globalAlpha = 1;
      if (e.swing > 0 && p > .55) { g.strokeStyle = col; g.lineWidth = isE ? 2 : 1; for (let i = 0; i < (isE ? 5 : 3); i++) { g.globalAlpha = Math.max(0, (1 - p) * .7); g.beginPath(); g.arc(cx + f * 10, y0 + 2, rad + 4 + i * 4, 0, 7); g.stroke() } g.globalAlpha = 1 }
    }
    else if (c.name == 'Ninja') {
      const p = e.swing > 0 ? 1 - e.swing / e.swingMax : 0, isE = e.swingSkill && e.swingSkill.esp, lunge = e.swing > 0 ? Math.sin(p * Math.PI) * (isE ? 12 : 7) : 0;
      g.save(); g.translate(cx + f * lunge, y0 + 18); g.scale(f, 1); g.fillStyle = isE ? '#e8c94a' : '#3a3a44';
      g.beginPath(); g.moveTo(6, -2); g.lineTo(18, 0); g.lineTo(6, 2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(6, 4); g.lineTo(16, 7); g.lineTo(6, 8); g.closePath(); g.fill(); g.restore()
      if (isE && e.swing > 0 && p > .2 && p < .8) { g.globalAlpha = (1 - Math.abs(p - .5) * 2) * .4; g.fillStyle = '#9ab'; g.beginPath(); g.arc(cx + f * lunge + 16, y0 + 18, 26, 0, 7); g.fill(); g.globalAlpha = 1 }
    }
    else if (c.name == 'Lutador') {
      const p = e.swing > 0 ? 1 - e.swing / e.swingMax : 0, isE = e.swingSkill && e.swingSkill.esp, bo = isE ? 1.5 : 1, ext = e.swing > 0 ? Math.sin(p * Math.PI) * 14 * bo : 0, col = e.swingSkill ? (TC[e.swingSkill.t] || '#5cf0a0') : '#5cf0a0';
      g.strokeStyle = '#e8b88c'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx + f * 4, y0 + 18); g.lineTo(cx + f * (10 + ext), y0 + 18); g.stroke();
      if (ext > 4) {
        g.strokeStyle = col; g.lineWidth = 1.5; for (let i = 0; i < (isE ? 5 : 3); i++) { g.globalAlpha = .5; g.beginPath(); g.moveTo(cx + f * (2 + i * 2), y0 + 14 + i * 3); g.lineTo(cx + f * (8 + i * 2), y0 + 14 + i * 3); g.stroke() } g.globalAlpha = 1;
        g.fillStyle = col; g.globalAlpha = .7; g.beginPath(); g.arc(cx + f * (10 + ext), y0 + 18, (5 + ext * .3) * bo, 0, 7); g.fill(); g.globalAlpha = 1
      }
    }
    else tri(cx + f * 12, y0 + 9, cx + f * 16, y0 + 9, cx + f * 14, y0 + 2, L.w);
    if (L.style == 'long' || L.style == 'twin') { rr(cx - 12, y0 + 6, 6, 16, 3, c.hair); rr(cx + 6, y0 + 6, 6, 16, 3, c.hair) }
    rr(cx - 8, y0 + 14, 16, 12, 4, c.body); g.fillStyle = (c.shadow || '#0003') + (c.shadow ? 'cc' : ''); g.fillRect(cx + 2, y0 + 14, 6, 12); g.fillStyle = '#0003'; g.fillRect(cx - 7, y0 + 22, 14, 2);
    g.fillStyle = '#ffffff26'; g.fillRect(cx - 7, y0 + 15, 3, 8);
    rr(cx - 10, y0 + 13, 7, 4, 2, (c.accent || '#888') + 'dd'); rr(cx + 3, y0 + 13, 7, 4, 2, (c.accent || '#888') + 'dd');
    g.fillStyle = '#241a14'; g.fillRect(cx - 7, y0 + 21, 14, 3);
    rr(cx - 3, y0 + 20.5, 6, 4, 1, (c.accent || '#e6c229')); g.strokeStyle = '#1a1010'; g.lineWidth = .8; g.strokeRect(cx - 3, y0 + 20.5, 6, 4);
    if (c.glow) {
      const pq = .5 + Math.sin(Date.now() / 260 + e.x) * .5; g.globalAlpha = .4 + pq * .5; g.strokeStyle = c.glow; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(cx - 4, y0 + 16); g.lineTo(cx - 1, y0 + 20); g.lineTo(cx - 3, y0 + 23); g.stroke();
      g.beginPath(); g.moveTo(cx + 3, y0 + 15); g.lineTo(cx + 5, y0 + 19); g.lineTo(cx + 3, y0 + 22); g.stroke(); g.globalAlpha = 1
    }
    rr(cx - 10, y0 + 16, 4, 7, 2, L.skin); rr(cx + 6, y0 + 16, 4, 7, 2, L.skin);
    rr(cx - 9, y0 + 2, 18, 15, 7, L.skin); g.fillStyle = '#0000001a'; g.beginPath(); g.ellipse(cx + 5, y0 + 9, 5, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff22'; g.beginPath(); g.ellipse(cx - 4, y0 + 7, 3, 5, 0, 0, 7); g.fill();
    if (L.style == 'helmet') { rr(cx - 10, y0 - 1, 20, 9, 6, '#8a94a3'); tri(cx - 3, y0 - 1, cx + 3, y0 - 1, cx, y0 - 6, '#b33') }
    else if (L.style == 'spiky') { for (let i = 0; i < 5; i++)tri(cx - 10 + i * 4.5, y0 + 5, cx - 6 + i * 4.5, y0 + 5, cx - 8 + i * 4.5, y0 - 5 - (i % 2) * 3, c.hair); rr(cx - 9, y0 + 2, 18, 5, 3, c.hair) }
    else { rr(cx - 10, y0 - 1, 20, 8, 5, c.hair); if (L.style == 'twin') { rr(cx - 16, y0 + 3, 5, 5, 2, c.hair); rr(cx + 11, y0 + 3, 5, 5, 2, c.hair) } }
    g.fillStyle = L.eye || '#fff'; g.fillRect(cx - 5, y0 + 10, 3, 3); g.fillRect(cx + 2, y0 + 10, 3, 3);
    if (L.acc == 'cape' && c.coatLong) {
      const sw = Math.sin(Date.now() / 220 + e.x) * 4; g.fillStyle = c.body; g.globalAlpha = .96;
      g.beginPath(); g.moveTo(cx - 7 - f * 2, y0 + 14); g.lineTo(cx - 13 - f * 9 + sw, y0 + 40); g.lineTo(cx + 4 - f * 3 + sw * .7, y0 + 38); g.lineTo(cx + 6 - f * 2, y0 + 14); g.closePath(); g.fill();
      g.strokeStyle = c.glow || c.accent; g.lineWidth = 1.3; g.globalAlpha = .9;
      g.beginPath(); g.moveTo(cx - 7 - f * 2, y0 + 14); g.lineTo(cx - 13 - f * 9 + sw, y0 + 40); g.stroke();
      g.beginPath(); g.moveTo(cx + 6 - f * 2, y0 + 14); g.lineTo(cx + 4 - f * 3 + sw * .7, y0 + 38); g.stroke(); g.globalAlpha = 1
    }
    else if (L.acc == 'cape') {
      g.fillStyle = c.accent || '#a22'; g.globalAlpha = .9; const sw = Math.sin(Date.now() / 240 + e.x) * 3;
      g.beginPath(); g.moveTo(cx - 6 - f * 2, y0 + 15); g.lineTo(cx - 10 - f * 6 + sw, y0 + 32); g.lineTo(cx + 2 - f * 2 + sw * .6, y0 + 30); g.lineTo(cx + 5 - f * 2, y0 + 15); g.closePath(); g.fill(); g.globalAlpha = 1
    }
    else if (L.acc == 'hat') {
      g.fillStyle = c.hair; g.beginPath(); g.moveTo(cx - 10, y0 + 1); g.lineTo(cx + 10, y0 + 1); g.lineTo(cx, y0 - 14); g.closePath(); g.fill(); g.strokeStyle = '#1a1010'; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = c.accent || '#e0c45a'; g.beginPath(); g.arc(cx, y0 - 10, 2.6, 0, 7); g.fill()
    }
    else if (L.acc == 'mask') { g.fillStyle = c.accent || '#3ac1b0'; g.fillRect(cx - 9, y0 + 13, 18, 5) }
    else if (L.acc == 'band') { g.fillStyle = c.accent || '#c0392b'; g.fillRect(cx - 10, y0 + 5, 20, 4); g.fillRect(cx + 8, y0 + 6, 6, 10) }
  }
  g.fillStyle = '#000'; g.fillRect(x + 1, Y - 10, 30, 7); g.fillStyle = '#3a3a3a'; g.fillRect(x + 2, Y - 9, 28, 5);
  g.fillStyle = e.hp > 100 ? '#3ecf3e' : e.hp > 50 ? '#dcd23c' : '#d9393c'; g.fillRect(x + 3, Y - 8, 26 * Math.max(0, e.hp) / e.max, 3);
  g.fillStyle = '#ffffff55'; g.fillRect(x + 3, Y - 8, 26 * Math.max(0, e.hp) / e.max, 1);
  g.fillStyle = '#fff'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(c.name + ' Nv' + (c.level || 1), x + 16, Y - 12); if (c.sayT > 0) { const t = c.say, w = g.measureText(t).width + 10; g.fillStyle = '#fffe'; g.fillRect(x + 16 - w / 2, Y - 30, w, 14); g.fillStyle = '#111'; g.fillText(t, x + 16, Y - 19) }
  if (e.hitT > 0 && e.hitT % 4 < 2 && !view3d) { g.globalAlpha = .5; g.fillStyle = '#fff'; g.fillRect(x - 2, y - 14, 36, 46); g.globalAlpha = 1 }
}
function drawBeam(f) {
  const ax = f.a.x * T + 16, ay = f.a.y * T + 16, bx = f.b.x * T + 16, by = f.b.y * T + 16, col = f.col || '#fff', t0 = f.t0 || 14;
  if (f.typ == 'raio') {
    g.globalAlpha = Math.min(1, f.t / 10); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay);
    for (let i = 1; i < 4; i++)g.lineTo(ax + (bx - ax) * i / 4 + (Math.random() - .5) * 9, ay + (by - ay) * i / 4 + (Math.random() - .5) * 9);
    g.lineTo(bx, by); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = .8; g.stroke(); g.globalAlpha = 1; return
  }
  const p = Math.min(1, 1 - f.t / t0), px = ax + (bx - ax) * p, py = ay + (by - ay) * p, ang = Math.atan2(by - ay, bx - ax);
  g.globalAlpha = .4; g.strokeStyle = col; g.lineWidth = (f.w || 3) * .5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(px, py); g.stroke(); g.globalAlpha = 1;
  if (f.typ == 'fogo') {
    g.fillStyle = col; g.beginPath(); g.arc(px, py, 5, 0, 7); g.fill(); g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(px, py, 2.2, 0, 7); g.fill();
    for (let i = 0; i < 3; i++) { g.globalAlpha = .5; g.fillStyle = i % 2 ? '#ffcf5a' : col; g.beginPath(); g.arc(px - Math.cos(ang) * i * 4, py - Math.sin(ang) * i * 4, 3 - i * .7, 0, 7); g.fill() } g.globalAlpha = 1
  }
  else if (f.typ == 'gelo') {
    g.save(); g.translate(px, py); g.rotate(ang); g.fillStyle = col; g.beginPath(); g.moveTo(9, 0); g.lineTo(-4, -4); g.lineTo(-1, 0); g.lineTo(-4, 4); g.closePath(); g.fill();
    g.strokeStyle = '#ffffffa0'; g.lineWidth = .6; g.beginPath(); g.moveTo(9, 0); g.lineTo(-1, 0); g.stroke(); g.restore()
  }
  else if (f.typ == 'magico') {
    g.save(); g.translate(px, py); g.rotate(p * 9); g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.stroke();
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(Math.cos(k * 1.571) * 6, Math.sin(k * 1.571) * 6); g.lineTo(Math.cos(k * 1.571) * 9, Math.sin(k * 1.571) * 9); g.stroke() }
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fill(); g.restore()
  }
  else if (f.wpn == 'Ninja') {
    g.save(); g.translate(px, py); g.rotate(p * 20); g.fillStyle = '#cfd3da';
    for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * 1.5708); g.beginPath(); g.moveTo(0, 0); g.lineTo(7, -2.2); g.lineTo(9, 0); g.lineTo(7, 2.2); g.closePath(); g.fill(); g.restore() }
    g.fillStyle = '#333'; g.beginPath(); g.arc(0, 0, 2, 0, 7); g.fill(); g.restore()
  }
  else if (f.wpn == 'Espadachim') {
    g.save(); g.translate(px, py); g.rotate(ang); g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 10, -1.1, 1.1); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 10, -1.1, 1.1); g.stroke(); g.restore()
  }
  else if (f.typ == 'sombrio') {
    for (let k = 0; k < 3; k++) {
      const bx2 = px - Math.cos(ang) * k * 7, by2 = py - Math.sin(ang) * k * 7 + Math.sin(p * 14 + k) * 3;
      g.save(); g.translate(bx2, by2); g.rotate(Math.sin(p * 14 + k) * .5); g.fillStyle = '#1a1016';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-6, -4); g.lineTo(-3, 0); g.lineTo(-6, 4); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(6, -4); g.lineTo(3, 0); g.lineTo(6, 4); g.closePath(); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(0, 0, 1.4, 0, 7); g.fill(); g.restore()
    }
  }
  else { g.fillStyle = col; g.globalAlpha = .85; g.beginPath(); g.arc(px, py, (f.w || 3) + 2, 0, 7); g.fill(); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(px, py, (f.w || 3) + 2, 0, 7); g.stroke() }
}
const ARENA_TR = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];
const ARENA_PIL = [[0, 0], [0, H - 2], [W - 1, 0], [W - 1, H - 2], [(W / 2 | 0) - 6, 0], [(W / 2 | 0) + 5, 0]];
function drawArenaFloor() {
  for (let j = 0; j < H; j++)for (let i = 0; i < W; i++) {
    const wall = i == 0 || j == 0 || i == W - 1 || j == H - 1, lavaEdge = j >= H - 2;
    g.fillStyle = wall ? ((i + j) % 2 ? '#17100f' : '#120d0c') : ((i + j) % 2 ? '#2a211c' : '#302520'); g.fillRect(i * T, j * T, T, T);
    if (wall) { g.fillStyle = '#00000055'; g.fillRect(i * T, j * T, T, 3) }
    else if (lavaEdge && (i % 3 == 0)) { g.fillStyle = '#ff6a1a'; g.globalAlpha = .55 + Math.sin(Date.now() / 260 + i) * .25; g.fillRect(i * T + 3, j * T + T - 5, T - 6, 3); g.globalAlpha = 1 }
    else if ((i * 7 + j * 13) % 7 == 0) { g.fillStyle = '#00000040'; g.fillRect(i * T + 6, j * T + 12, 12, 3) }
  }
  ARENA_PIL.forEach(([i, j]) => { g.fillStyle = '#0c0a09'; g.fillRect(i * T + 8, j * T, 16, H * T); g.fillStyle = '#1c1512'; g.fillRect(i * T + 10, j * T, 4, H * T) });
  const vg = g.createRadialGradient(W * T / 2, H * T * .35, 20, W * T / 2, H * T * .6, W * T * .75);
  vg.addColorStop(0, 'rgba(10,4,4,0)'); vg.addColorStop(1, 'rgba(120,10,10,.5)'); g.fillStyle = vg; g.fillRect(0, 0, W * T, H * T);
  g.fillStyle = 'rgba(4,2,3,.4)'; g.fillRect(0, 0, W * T, H * T);
  torches(ARENA_TR); glows(ARENA_TR)
}
function draw() {
  if (state == 'leisure') { drawLeisure(); return } if (state == 'world') { drawWorld(); return } g.clearRect(0, 0, cv.width, cv.height); if (map3d()) { try { draw3DArena() } catch (err) { console.error('Mapa 3D falhou:', err); setVMode('sprite') } } else {
    g.save();
    if (shakeT > 0) { const amp = shakeT * .22; g.translate(Math.sin(shakeT * 2.1) * amp, Math.cos(shakeT * 1.7) * amp * .6) }
    if (zoomT > 0) { const z = 1 + zoomT * .006, px = zoomPt ? zoomPt.x : 336, py = zoomPt ? zoomPt.y : 240; g.translate(px, py); g.scale(z, z); g.translate(-px, -py) }
    drawArenaFloor();
    fx.forEach(f => { if (f.num || f.ring) return; drawBeam(f) });
    ents.forEach(drawChar);
    drawParts(); g.restore()
  } g.fillStyle = '#120f0b'; g.fillRect(0, H * T, cv.width, 60);
  if (ents[0]) { g.textAlign = 'left'; g.font = '12px sans-serif'; ents[0].sk.forEach((s, i) => { const x = 6 + (i % 3) * 222, y = H * T + 12 + (i / 3 | 0) * 26; g.fillStyle = TC[s.t] || '#e8dcc0'; g.fillText(s.n, x, y); g.fillStyle = '#333'; g.fillRect(x, y + 4, 210, 6); g.fillStyle = TC[s.t] || '#48c'; g.fillRect(x, y + 4, 210 * (1 - s.cdl / s.cd), 6) }) }
  if (banner && banner.t > 0) { g.globalAlpha = Math.min(1, banner.t / 20); g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(banner.text, cv.width / 2 + 2, 68); g.fillStyle = banner.col; g.fillText(banner.text, cv.width / 2, 66); g.globalAlpha = 1 }
  if (msg) { g.fillStyle = '#000a'; g.fillRect(0, 200, cv.width, 70); g.fillStyle = '#ffd'; g.font = '28px sans-serif'; g.textAlign = 'center'; g.fillText(msg, cv.width / 2, 246) }
}
// ---- Cérebro Ollama (opcional): consultado só em momentos-chave ----
const AI = { on: false, url: 'http://localhost:11434', q: Promise.resolve() };
const modelo = () => document.getElementById('mod').value.trim() || 'llama3.2';
const dicaIA = 'Se for erro de rede/CORS: defina OLLAMA_ORIGINS=* e reinicie o Ollama, ou abra o jogo por http://localhost (ex.: python -m http.server).';
async function testIA() {
  try {
    const r = await fetch(AI.url + '/api/tags'), j = await r.json(), n = j.models.map(m => m.name);
    log('Ollama conectado. Modelos instalados: ' + (n.join(', ') || 'nenhum (rode: ollama pull llama3.2)'));
    if (!n.some(x => x.startsWith(modelo()))) log(`Atenção: modelo "${modelo()}" não encontrado. Ajuste o nome no campo ao lado.`)
  }
  catch (e) { AI.on = false; document.getElementById('ia').checked = false; log('Não consegui falar com o Ollama (' + e.message + '). ' + dicaIA) }
}
const askAI = (e, r) => { if (AI.on) AI.q = AI.q.then(() => think(e, r)) };
async function think(e, motivo) {
  if (!AI.on) return; const c = e.c, ac = new AbortController(), to = setTimeout(() => ac.abort(), 90000);
  const p = `Você é ${c.name}, um agente autônomo de RPG 2D que caça monstros numa cidade. Nível ${c.level}, vida máxima ${e.max}, mortes até agora: ${c.deaths || 0}, andar atual: ${e.fl || 'cidade'}. Motivo desta decisão: ${motivo}. Habilidades: ${c.sk.map(s => `${s.n} (${s.t}, dano ${s.dmg}${s.h > 1 ? '×' + s.h : ''}, recarga ${s.cd}, alcance ${s.range})`).join('; ')}. Monstros: Rato, Morcego, Esqueleto, Orc, Fantasma, Troll, Demônio (mais fortes a cada andar; cada andar tem um chefe). Fantasma quase imune a dano físico; Esqueleto fraco a fogo e mágico; Demônio resiste a fogo. Se morreu, aprenda com a causa da morte e ajuste a estratégia. Estratégia atual: ${JSON.stringify(c.strat)}. Decida sua estratégia. Responda APENAS com JSON: {"rest":número de 0.2 a 0.7 (fração de vida para voltar ao templo),"alvo":"nome de um monstro"|"qualquer","dist":número de 1 a 5 (distância preferida do inimigo),"foco":"alcance"|"corpo"|"equilibrado"|"fisico"|"magico"|"fogo"|"gelo"|"raio"|"ki" (o que evoluir no treino: alcance, corpo a corpo ou um tipo de dano),"fala":"frase curta em português, até 50 letras"}`;
  try {
    const r = await fetch(AI.url + '/api/chat', { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelo(), stream: false, format: 'json', messages: [{ role: 'user', content: p }] }) });
    const j = JSON.parse((await r.json()).message.content), alvos = ['Rato', 'Morcego', 'Esqueleto', 'Orc', 'Fantasma', 'Troll', 'Demônio', 'qualquer'], focos = ['alcance', 'corpo', 'equilibrado', 'fisico', 'magico', 'fogo', 'gelo', 'raio', 'ki'];
    c.strat = { rest: clamp(+j.rest || .4, .2, .7), alvo: alvos.includes(j.alvo) ? j.alvo : 'qualquer', dist: clamp(Math.round(+j.dist) || 0, 0, 5) };
    c.focus = focos.includes(j.foco) ? j.foco : 'equilibrado'; c.say = String(j.fala || '').slice(0, 50); c.sayT = 420; save();
    log(`${c.name} (IA): "${c.say}" | vida p/ recuar ${Math.round(c.strat.rest * 100)}%, alvo ${c.strat.alvo}, distância ${c.strat.dist || 'auto'}, foco ${c.focus}`)
  }
  catch (err) { log(`IA falhou para ${c.name} (${err.message}). Mantendo a estratégia atual. ${dicaIA}`) } finally { clearTimeout(to) }
}
// ---- Local de lazer: os agentes passeiam, fazem atividades e conversam (loop social) ----
const CHAT_LINES = ['Que dia tranquilo por aqui.', 'Preciso treinar mais amanhã.', 'Alguém quer jogar?', 'Essa comida cheira muito bem.', 'Bom descansar um pouco.', 'A próxima caçada vai ser longa.', 'Gosto desse lugar.', 'Vamos conversar um pouco?'];
async function chatAI(e, near) {
  const c = e.c;
  if (!AI.on) { c.say = CHAT_LINES[Math.random() * CHAT_LINES.length | 0]; c.sayT = 260; return }
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
  const p = `Você é ${c.name}, nível ${c.level}, personagem de RPG 2D descansando num local de lazer entre caçadas${near ? `, perto de ${near.c.name}` : ''}. Diga uma frase curta e casual em português (até 45 letras) sobre descansar, comida, treino, amizade ou o dia — nada de combate. Responda APENAS com a frase, sem aspas.`;
  try {
    const r = await fetch(AI.url + '/api/chat', { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelo(), stream: false, messages: [{ role: 'user', content: p }] }) });
    const t = (await r.json()).message.content.trim().replace(/^"|"$/g, '').slice(0, 50); c.say = t || CHAT_LINES[0]; c.sayT = 260
  }
  catch (err) { c.say = CHAT_LINES[Math.random() * CHAT_LINES.length | 0]; c.sayT = 260 } finally { clearTimeout(to) }
}
const askChat = (e, near) => { AI.q = AI.q.then(() => chatAI(e, near)) };
const LW = 20, LH = 13, LSPOTS = [{ x: 4, y: 3, act: '📖' }, { x: 16, y: 3, act: '💻' }, { x: 4, y: 9, act: '🎮' }, { x: 16, y: 9, act: '🎱' }, { x: 10, y: 6, act: '🛋️' }, { x: 10, y: 10, act: '🍕' }];
let lents = [];
function startLeisure() {
  state = 'leisure'; auto = false; msg = ''; fx = [];
  lents = chars.map((c, i) => ({ c, ci: i, x: 6 + i * 2, y: 6, f: 1, dest: null, wait: 20 + i * 15, act: null }));
  log('\nLocal de lazer aberto: os agentes passeiam, jogam e conversam entre si.')
}
function leisureTick() {
  lents.forEach(e => {
    const c = e.c; if (isManual(e)) { manualLeisure(e); return } if (c.sayT > 0) c.sayT--; e.act = null;
    if (e.wait > 0) { e.wait--; if (e.wait < 20) e.act = e._act; return }
    if (!e.dest) { e.dest = LSPOTS[Math.random() * LSPOTS.length | 0]; return }
    if (e.x === e.dest.x && e.y === e.dest.y) {
      e._act = e.dest.act; e.act = e.dest.act; e.wait = 60 + Math.random() * 180 | 0; e.dest = null;
      if (c.sayT <= 0 && Math.random() < .5) { const near = lents.find(o => o !== e && Math.abs(o.x - e.x) + Math.abs(o.y - e.y) <= 3); askChat(e, near) }
      return
    }
    if ((e.mc3 = (e.mc3 || 0) - 1) > 0) return; e.mc3 = 18; const occ = (x, y) => lents.some(o => o !== e && o.x === x && o.y === y), s = bfs(lmap(), e.x, e.y, e.dest.x, e.dest.y); if (s && !occ(e.x + s.dx, e.y + s.dy)) { e.x += s.dx; e.y += s.dy; if (s.dx) e.f = s.dx } else e.wait = 20
  })
}
function drawLeisure() {
  if (map3d() && draw3DLeisure()) return; g.fillStyle = '#4a3524'; g.fillRect(0, 0, LW * T, LH * T);
  for (let j = 0; j < LH; j++)for (let i = 0; i < LW; i++) { g.fillStyle = (i + j) % 2 == 0 ? '#5a4230' : '#543d2b'; g.fillRect(i * T, j * T, T, T) }
  g.strokeStyle = '#00000022'; g.lineWidth = 1; for (let i = 0; i < LW; i++) { g.beginPath(); g.moveTo(i * T, 0); g.lineTo(i * T, LH * T); g.stroke() }
  g.fillStyle = '#2a1f16'; g.fillRect(0, 0, LW * T, T * .4); g.fillRect(0, LH * T - T * .4, LW * T, T * .4); g.fillRect(0, 0, T * .4, LH * T); g.fillRect(LW * T - T * .4, 0, T * .4, LH * T);
  g.fillStyle = '#6b3a3a'; g.beginPath(); g.ellipse(10 * T + 16, 7 * T + 16, 5.6 * T, 3.6 * T, 0, 0, 7); g.fill(); g.strokeStyle = '#4a2626'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#1a1a1e'; g.fillRect(15 * T + 6, 2 * T + 6, 2.4 * T, 1.7 * T); g.fillStyle = '#4a90e2'; g.fillRect(15 * T + 14, 2 * T + 14, 2.4 * T - 16, 1.7 * T - 16);
  g.fillStyle = '#2a2a30'; g.fillRect(15 * T + 2, 3 * T + 23, 2.8 * T, 6);
  g.fillStyle = '#3a2a1a'; g.fillRect(3 * T, 2 * T + 4, 2.6 * T, 2.4 * T); for (let r = 0; r < 3; r++) {
    g.fillStyle = '#1a120a'; g.fillRect(3 * T + 4, 2 * T + 10 + r * 18, 2.6 * T - 8, 3);
    for (let b = 0; b < 5; b++) { g.fillStyle = ['#8a3a3a', '#3a6a8a', '#6a8a3a', '#8a6a3a', '#5a3a8a'][b]; g.fillRect(3 * T + 6 + b * 14, 2 * T + 13 + r * 18, 10, 13) }
  }
  g.fillStyle = '#2e2e36'; g.fillRect(14.5 * T, 8 * T + 6, 3.3 * T, 2.2 * T); g.strokeStyle = '#1a1a20'; g.lineWidth = 3; g.strokeRect(14.5 * T, 8 * T + 6, 3.3 * T, 2.2 * T);
  g.fillStyle = '#4a7a3a'; g.fillRect(14.5 * T + 8, 8 * T + 14, 3.3 * T - 16, 2.2 * T - 16);
  g.fillStyle = '#5a3a2a'; g.fillRect(8.5 * T, 5 * T + 10, 3 * T, 1.6 * T); g.fillStyle = '#3a2418'; g.fillRect(8.5 * T, 5 * T + 6, 3 * T, 6);
  LSPOTS.forEach(s => { g.font = '16px sans-serif'; g.textAlign = 'center'; g.fillText(s.act, s.x * T + 16, s.y * T + 22) });
  lents.forEach(drawChar);
  lents.forEach(e => { if (e.act) { g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fffb'; g.beginPath(); g.arc(e.x * T + 16, e.y * T - 2, 9, 0, 7); g.fill(); g.fillText(e.act, e.x * T + 16, e.y * T + 3) } });
  g.fillStyle = '#120f0b'; g.fillRect(0, LH * T, cv.width, 540 - LH * T); g.font = '12px sans-serif'; g.fillStyle = '#e8dcc0'; g.textAlign = 'left';
  g.fillText('Local de lazer — os agentes passeiam, jogam e conversam. Clique para trocar quem seguir.', 8, LH * T + 20);
  const F = lents[cam % lents.length]; if (F) { g.fillStyle = '#aaa'; g.fillText(`Seguindo ${F.c.name}`, 8, LH * T + 38) }
}
const CW = 48, CH = 34, DW = 44, DH = 30, VW = 21, VH = 15;
let mons = [], wents = [], wt = 0, cam = 0, maps = {};
const rand = a => () => (a = (a * 16807) % 2147483647) / 2147483647;
const blds = [[3, 3, 6, 5, 'loja', 'Armaria Sombria', '#5a3040'], [10, 3, 4, 4, 'casa', '', '#3d3a50'], [15, 3, 4, 4, 'casa', '', '#4a3a2a'], [4, 9, 4, 4, 'casa', '', '#3a4a45'], [10, 9, 5, 4, 'casa', '', '#5a3040'], [16, 9, 4, 4, 'casa', '', '#3d3a50'],
[28, 3, 8, 5, 'loja', 'Mercado Negro', '#2f4a3a'], [37, 3, 4, 4, 'casa', '', '#4a3a2a'], [42, 3, 3, 4, 'casa', '', '#3d3a50'], [28, 9, 4, 4, 'casa', '', '#5a3040'], [33, 8, 7, 5, 'templo', 'Templo Sombrio', '#3a3f5a'], [41, 9, 4, 4, 'casa', '', '#4a3a2a'],
[3, 20, 7, 5, 'loja', 'Taverna do Corvo', '#5a4a2a'], [11, 20, 4, 4, 'casa', '', '#3d3a50'], [16, 20, 4, 4, 'casa', '', '#5a3040'], [4, 27, 4, 4, 'casa', '', '#4a3a2a'], [9, 27, 5, 4, 'casa', '', '#3a4a45'], [15, 27, 4, 4, 'casa', '', '#3d3a50'],
[28, 20, 4, 4, 'casa', '', '#4a3a2a'], [33, 20, 4, 4, 'casa', '', '#5a3040'], [38, 20, 4, 4, 'casa', '', '#3d3a50'], [43, 20, 3, 4, 'casa', '', '#3a4a45'], [30, 25, 15, 6, 'arena', 'Anfiteatro Mortis', '#4a463c']];
const L = { Armaria: [5, 8], Mercado: [31, 8], Taverna: [6, 25], Templo: [36, 13], gate: [37, 24] };
const torchC = [[5, 8], [31, 8], [6, 25], [36, 13], [36, 24], [38, 24], [22, 14], [25, 14], [22, 18], [25, 18], [2, 16], [45, 16], [12, 14], [34, 14]];
const TINT = ['#2b2622', '#232b25', '#2e2226', '#222534', '#2a2a1f', '#2a2032', '#301d1a'];
const KD = [['Rato', 30, 3, 8, 50, 20, '#8a8478'], ['Morcego', 24, 4, 10, 40, 12, '#6a3a8a'], ['Esqueleto', 55, 6, 16, 55, 24, '#e6e0c8'], ['Orc', 90, 9, 26, 60, 22, '#5a8a3a'], ['Fantasma', 70, 11, 34, 50, 18, '#a8d8f0'], ['Troll', 170, 15, 50, 80, 26, '#6a7a8a'], ['Demônio', 130, 20, 70, 55, 16, '#b83a2a']];
const BN = ['Rei dos Ratos', 'Senhor Orc', 'Lorde Ossudo', 'Devorador de Almas', 'Rei Troll', 'Arquidemônio', 'Dragão Ancestral'], BK = [0, 3, 2, 4, 5, 6, 6];
function cityMap() {
  const solid = Array.from({ length: CH }, () => Array(CW).fill(false));
  for (let j = 0; j < CH; j++)for (let i = 0; i < CW; i++)if (i == 0 || j == 0 || i == CW - 1 || j == CH - 1) solid[j][i] = true;
  blds.forEach(([x, y, w, h]) => { for (let j = y; j < y + h; j++)for (let i = x; i < x + w; i++)solid[j][i] = true }); return { W: CW, H: CH, solid, city: true, tr: torchC }
}
function dunMap(n) {
  const r = rand(n * 9973 + 11), solid = Array.from({ length: DH }, () => Array(DW).fill(true)), rooms = [];
  const carve = (x, y, w, h) => { for (let j = y; j < y + h; j++)for (let i = x; i < x + w; i++)if (i > 0 && j > 0 && i < DW - 1 && j < DH - 1) solid[j][i] = false };
  for (let t = 0; t < 80 && rooms.length < 9; t++) {
    const w = 5 + r() * 6 | 0, h = 4 + r() * 5 | 0, x = 2 + r() * (DW - w - 4) | 0, y = 2 + r() * (DH - h - 4) | 0;
    if (rooms.some(o => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue; carve(x, y, w, h); rooms.push({ x, y, w, h, cx: x + w / 2 | 0, cy: y + h / 2 | 0 })
  }
  for (let i = 1; i < rooms.length; i++) { const a = rooms[i - 1], b = rooms[i], x1 = Math.min(a.cx, b.cx), x2 = Math.max(a.cx, b.cx), y1 = Math.min(a.cy, b.cy), y2 = Math.max(a.cy, b.cy); carve(x1, a.cy, x2 - x1 + 2, 2); carve(b.cx, y1, 2, y2 - y1 + 2) }
  const f = rooms[0], d = o => Math.abs(o.cx - f.cx) + Math.abs(o.cy - f.cy), last = rooms.reduce((a, b) => d(b) > d(a) ? b : a), tr = [];
  for (let j = 0; j < DH - 1; j++)for (let i = 0; i < DW; i++)if (solid[j][i] && !solid[j + 1][i] && r() < .07) tr.push([i, j]);
  return { W: DW, H: DH, solid, n, cleared: false, tr, entry: { x: f.cx, y: f.cy }, boss: { x: last.cx, y: last.cy }, stairs: { x: last.cx + 2, y: last.cy } }
}
function getMap(n) { if (!maps[n]) { maps[n] = n ? dunMap(n) : cityMap(); if (n) { const b = maps[n].boss; mons.push(mkMon(BK[(n - 1) % 7], n, b.x - 1, b.y, true)) } } return maps[n] }
function mkMon(k, f, x, y, boss) {
  const [n, hp, dmg, xp, cd, sp, col] = KD[k], sh = 1 + .5 * (f - 1), sd2 = 1 + .3 * (f - 1), sx = 1 + .25 * (f - 1), h = Math.round(hp * 3 * sh * (boss ? 6 : 1));
  return { n: boss ? BN[(f - 1) % 7] : n, k, fl: f, res: RS[k], hp: h, max: h, dmg: Math.round(dmg * sd2 * (boss ? 1.6 : 1)), xp: Math.round(xp * sx * (boss ? 8 : 1)), cd: boss ? cd * .9 | 0 : cd, sp, col, cdl: 0, mcd: 0, x, y, boss: !!boss, sl: 200 }
}
const occ = (f, x, y) => wents.some(e => e.fl == f && e.x == x && e.y == y && e.hp > 0) || mons.some(m => m.fl == f && m.x == x && m.y == y && m.hp > 0);
function bfs(mp, sx, sy, tx, ty) {
  const W2 = mp.W, st = sy * W2 + sx, prev = new Int16Array(W2 * mp.H).fill(-2), q = [st], D = [[1, 0], [-1, 0], [0, 1], [0, -1]]; prev[st] = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi], cx = cur % W2, cy = cur / W2 | 0; if (cx == tx && cy == ty) break;
    for (const [dx, dy] of D) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W2 || ny >= mp.H) continue; const n = ny * W2 + nx; if (prev[n] != -2) continue; if (mp.solid[ny][nx] && !(nx == tx && ny == ty)) continue; prev[n] = cur; q.push(n) }
  }
  let p = ty * W2 + tx; if (p == st || prev[p] == -2) return null; while (prev[p] != st) p = prev[p]; return { dx: p % W2 - sx, dy: (p / W2 | 0) - sy }
}
function spawnNear(e) {
  const f = e.fl, mp = getMap(f); if (mons.filter(m => m.fl == f && m.hp > 0 && !m.boss).length >= 10) return;
  for (let a = 0; a < 20; a++) {
    const an = Math.random() * 6.283, d = 5 + Math.random() * 4, x = Math.round(e.x + Math.cos(an) * d), y = Math.round(e.y + Math.sin(an) * d);
    if (x < 1 || y < 1 || x >= mp.W - 1 || y >= mp.H - 1 || mp.solid[y][x] || occ(f, x, y)) continue; mons.push(mkMon(Math.min(6, Math.random() * (f + 2) | 0), f, x, y, false)); return
  }
}
function wmove(e, dx, dy) {
  const mp = getMap(e.fl), nx = e.x + dx, ny = e.y + dy; if (nx < 0 || ny < 0 || nx >= mp.W || ny >= mp.H || mp.solid[ny][nx] || occ(e.fl, nx, ny)) return false;
  e.x = nx; e.y = ny; e.mcd = 10; if (dx) e.f = dx; if (e.fl > 0 && Math.random() < .05) spawnNear(e); return true
}
function go(e, tx, ty) { const s = bfs(getMap(e.fl), e.x, e.y, tx, ty); if (!s) return; if (!wmove(e, s.dx, s.dy)) { const A = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - .5); for (const [dx, dy] of A) if (wmove(e, dx, dy)) break } }
function randOpen(mp) { for (let a = 0; a < 80; a++) { const x = 1 + Math.random() * (mp.W - 2) | 0, y = 1 + Math.random() * (mp.H - 2) | 0; if (!mp.solid[y][x]) return { x, y } } return mp.entry }
function startWorld() {
  auto = false; state = 'world'; msg = ''; fx = []; mons = []; maps = {}; wt = 0; cam = 0;
  wents = chars.map((c, i) => { const mx = 200 + 20 * (c.level - 1); return { c, ci: i, fl: 0, x: 22 + i, y: 16, hp: mx, max: mx, sk: c.sk.map(s => ({ ...s, cdl: 0 })), mcd: 0, f: 1, rest: false, wait: 0, dest: null, tour: ['Armaria', 'Mercado', 'Taverna'].sort(() => Math.random() - .5).slice(0, 2).concat('gate') } });
  wents.forEach(e => askAI(e, 'início da jornada')); log('\nCidade medieval aberta. Clique no mapa para seguir outro personagem.')
}
function gain(e, m) {
  const c = e.c; c.xp += m.xp; c.gold = (c.gold || 0) + Math.round(m.xp * .4) + (m.boss ? 30 : 0);
  while (c.xp >= c.level * 60) { c.xp -= c.level * 60; c.level++; e.max = 200 + 20 * (c.level - 1); e.hp = e.max; log(`Nível ${c.level}: ${c.name}!`); train(e.ci); e.sk = c.sk.map(s => ({ ...s, cdl: 0 })); askAI(e, 'subiu de nível') } save()
}
function die(e) {
  const c = e.c, f = e.fl; c.deaths++; c.fear = Math.min(6, c.fear + 1); c.strat.rest = Math.min(.7, Math.max(c.strat.rest, .3 + .06 * c.fear));
  log(`${c.name} morreu no andar ${f} (${e.by || '?'}). Aprendeu: recua com ${Math.round(c.strat.rest * 100)}% de vida e só enfrenta o chefe no nível ${2 * f - 1 + c.fear}.`);
  c.xp = Math.floor(c.xp * .9); train(e.ci); e.sk = c.sk.map(s => ({ ...s, cdl: 0 })); e.hp = e.max * .3; e.fl = 0; e.x = 36; e.y = 14; e.tour = ['gate']; e.wait = 0; e.rest = false; e.dest = null;
  e.fin = null; e.swing = 0; e.swingSkill = null; e.finvx = 0; e.kx = 0; e.ky = 0; e.kt = 0; e.hitT = 0; askAI(e, `morreu no andar ${f} para ${e.by || 'um monstro'}`)
}
function agent(e) {
  const c = e.c, f = e.fl, mp = getMap(f); if (c.sayT > 0) c.sayT--; e.sk.forEach(s => s.cdl > 0 && s.cdl--); e.mcd > 0 && e.mcd--; e.gcd > 0 && e.gcd--;
  if (e.fin) { advanceFinisher(e); if (e.hp <= 0) { e.fin = null; die(e) } return }
  e.swing > 0 && e.swing--;
  if (e.hp <= 0) { die(e); return }
  if (f == 0) {
    if (e.hp < e.max) { const [tx, ty] = L.Templo; if (dist(e, { x: tx, y: ty }) <= 1) e.hp = Math.min(e.max, e.hp + 1); else if (e.mcd == 0) go(e, tx, ty); return }
    if (e.wait > 0) { e.wait--; return } const nm = e.tour[0] || 'gate', [tx, ty] = L[nm];
    if (dist(e, { x: tx, y: ty }) <= 1) { if (nm == 'gate') { e.fl = c.best; const m2 = getMap(e.fl); e.x = m2.entry.x; e.y = m2.entry.y; e.tour = []; e.dest = null; log(`${c.name} entrou no andar ${e.fl}.`) } else { e.tour.shift(); e.wait = 90 } }
    else if (e.mcd == 0) go(e, tx, ty); return
  }
  let m = null, bs = 99; mons.forEach(o => { if (o.fl != f || o.hp <= 0) return; const d = dist(e, o) + (c.strat.alvo != 'qualquer' && o.n != c.strat.alvo && !o.boss ? 8 : 0); if (d < bs) { bs = d; m = o } }); const bd = m ? dist(e, m) : 99;
  if (m && bd <= 7) {
    const rdy = pick(e, m, bd);
    if (rdy) { cast(e, m, rdy); for (const o of mons.filter(q => q.fl == f && q.hp <= 0 && !q.dead)) { o.dead = 1; gain(e, o); if (o.boss) { mp.cleared = true; c.fear = Math.max(0, c.fear - 1); log(`${c.name} derrotou o chefe ${o.n} (andar ${f})!`) } } }
    const maxR = Math.max(...e.sk.map(s => s.range)), esp = c.sk.find(s => s.esp), want = (esp && esp.cdl == 0) ? Math.min(esp.range, maxR) : (c.strat.dist ? Math.min(c.strat.dist, maxR) : (c.pref || 1)); if (bd > want && e.mcd == 0) go(e, m.x, m.y); return
  }
  if (e.hp < e.max * c.strat.rest) e.rest = true; if (e.rest) { e.hp += .3; if (e.hp >= e.max * .95) e.rest = false; return }
  if (e.mcd > 0) return; const bossAlive = mons.some(o => o.fl == f && o.boss && o.hp > 0);
  if (!mp.cleared && bossAlive && c.level >= 2 * f - 1 + c.fear) { go(e, mp.boss.x, mp.boss.y); return }
  if (mp.cleared && c.level >= 2 * f + 1 + c.fear) { const s = mp.stairs; if (dist(e, s) <= 0) { e.fl = f + 1; c.best = Math.max(c.best, e.fl); const m2 = getMap(e.fl); e.x = m2.entry.x; e.y = m2.entry.y; e.dest = null; log(`${c.name} desceu para o andar ${e.fl}.`) } else go(e, s.x, s.y); return }
  if (!e.dest || dist(e, e.dest) <= 1) e.dest = randOpen(mp); go(e, e.dest.x, e.dest.y)
}
function monAI(m) {
  m.cdl > 0 && m.cdl--; m.mcd > 0 && m.mcd--; m.sl > 0 && m.sl--; let t = null, bd = 99;
  wents.forEach(e => { if (e.fl != m.fl || e.hp <= 0) return; const d = dist(m, e); if (d < bd) { bd = d; t = e } }); if (!t) return;
  if (m.boss && m.sl == 0 && bd <= 3) { m.sl = 240; wents.forEach(e => { if (e.fl == m.fl && e.hp > 0 && dist(m, e) <= 2) { e.hp -= Math.round(m.dmg * 1.2); e.by = m.n } }); fx.push({ a: m, b: m, t: 20, r: 9, ring: 1 }); return }
  if (bd <= 1) { if (m.cdl == 0) { t.hp -= Math.round(m.dmg * (.8 + Math.random() * .4)); t.by = m.n; m.cdl = m.cd; fx.push({ a: m, b: t, t: 8, r: 1 }) } }
  else if (bd <= 9 && m.mcd == 0) { const mp = getMap(m.fl), s = bfs(mp, m.x, m.y, t.x, t.y); if (s) { const nx = m.x + s.dx, ny = m.y + s.dy; if (!mp.solid[ny][nx] && !occ(m.fl, nx, ny)) { m.x = nx; m.y = ny; m.mcd = m.sp } } }
}
function wtick() { wt++; wents.forEach(decayHit); mons.forEach(decayHit); wents.forEach(e => isManual(e) ? manualWorld(e) : agent(e)); mons = mons.filter(m => m.hp > 0); mons.forEach(monAI); fx.forEach(f => f.t--); fx = fx.filter(f => f.t > 0) }
cv.onclick = ev => { if (map3d() && click3D(ev)) return; if (state == 'world' && wents.length) cam = (cam + 1) % wents.length; else if (state == 'leisure' && lents.length) cam = (cam + 1) % lents.length; renderSkills() };
// ---- desenho do mundo ----
function drawBld([bx, by, w, h, tp, lb, rc]) {
  const x = bx * T, y = by * T, W2 = w * T, H2 = h * T;
  if (tp == 'arena') {
    g.fillStyle = '#57534a'; g.beginPath(); g.roundRect(x, y, W2, H2, 26); g.fill(); g.strokeStyle = '#2c2a25'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#2e2620'; g.beginPath(); g.ellipse(x + W2 / 2, y + H2 / 2 + 6, W2 / 2 - 26, H2 / 2 - 22, 0, 0, 7); g.fill();
    g.fillStyle = '#8a8474'; for (let k = 0; k < 12; k++)g.fillRect(x + 16 + k * (W2 - 40) / 11, y + 4, 14, 6);
    g.fillStyle = '#e6e0c8'; for (let k = 0; k < 9; k++)g.fillRect(x + 70 + (k * 53) % (W2 - 140), y + 50 + (k * 29) % (H2 - 100), 6, 3);
    g.fillStyle = '#0a0808'; g.beginPath(); g.roundRect(37 * T + 2, y, T - 4, T + 6, [10, 10, 0, 0]); g.fill(); g.strokeStyle = '#777'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(37 * T + 7 + k * 6, y + 4); g.lineTo(37 * T + 7 + k * 6, y + T); g.stroke() }
  }
  else {
    g.fillStyle = '#3b2c1e'; g.fillRect(x, y, W2, H2); g.fillStyle = rc; g.fillRect(x + 2, y + 2, W2 - 4, H2 - T - 2); g.fillStyle = '#0004'; for (let k = y + 10; k < y + H2 - T; k += 8)g.fillRect(x + 2, k, W2 - 4, 1);
    g.fillStyle = '#0006'; g.fillRect(x + W2 / 2 - 1, y + 2, 2, H2 - T - 2); g.fillStyle = '#5b4632'; for (let k = 0; k <= w; k++)g.fillRect(x + k * T - 1, y + H2 - T, 3, T);
    for (let k = 0; k < w; k++) { const wx = x + k * T; if (k == (w / 2 | 0)) { g.fillStyle = '#1c120a'; g.fillRect(wx + 8, y + H2 - 22, 16, 22) } else { g.fillStyle = '#f2b84b'; g.fillRect(wx + 10, y + H2 - 24, 12, 10); g.fillStyle = '#000'; g.fillRect(wx + 15, y + H2 - 24, 2, 10) } }
    g.strokeStyle = '#1a120b'; g.lineWidth = 2; g.strokeRect(x, y, W2, H2)
  }
  if (lb) { g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(lb, x + W2 / 2 + 1, y - 4); g.fillStyle = '#8fd18f'; g.fillText(lb, x + W2 / 2, y - 5) }
}
function drawCity(mp, i0, j0, i1, j1) {
  g.lineWidth = 1;
  for (let j = j0; j <= j1; j++)for (let i = i0; i <= i1; i++) {
    const x = i * T, y = j * T, road = (j >= 15 && j <= 17) || (i >= 22 && i <= 25);
    g.fillStyle = road ? ((i + j) % 2 ? '#3b362f' : '#413b33') : ((i + j) % 2 ? '#4c463d' : '#544d43'); g.fillRect(x, y, T, T);
    if ((i * 7 + j * 13) % 5 == 0) { g.fillStyle = '#0003'; g.fillRect(x + 6, y + 8, 8, 5); g.fillRect(x + 18, y + 20, 7, 4) }
    if (i == 0 || j == 0 || i == CW - 1 || j == CH - 1) { g.fillStyle = '#6b665a'; g.fillRect(x, y, T, T); g.strokeStyle = '#3c382f'; g.strokeRect(x + .5, y + .5, T - 1, T - 1); g.fillStyle = '#8a8474'; g.fillRect(x + 2, y + 2, T - 4, 5) }
  }
  blds.forEach(drawBld)
}
function drawDun(mp, i0, j0, i1, j1) {
  const fc = TINT[(mp.n - 1) % 7]; g.lineWidth = 1;
  for (let j = j0; j <= j1; j++)for (let i = i0; i <= i1; i++) {
    const x = i * T, y = j * T;
    if (!mp.solid[j][i]) { g.fillStyle = fc; g.fillRect(x, y, T, T); g.fillStyle = (i + j) % 2 ? '#ffffff08' : '#00000014'; g.fillRect(x, y, T, T); g.fillStyle = '#0003'; g.fillRect(x, y + T - 1, T, 1); g.fillRect(x + T - 1, y, 1, T); if ((i * 5 + j * 11) % 7 == 0) { g.fillStyle = '#0004'; g.fillRect(x + 8, y + 10, 9, 5) } }
    else { const face = j + 1 < DH && !mp.solid[j + 1][i]; g.fillStyle = face ? '#5a5044' : '#12100e'; g.fillRect(x, y, T, T); if (face) { g.fillStyle = '#0005'; for (let k = 8; k < T; k += 8)g.fillRect(x, y + k, T, 1); g.fillRect(x + ((j % 2) ? 8 : 20), y, 1, T); g.fillStyle = '#ffffff18'; g.fillRect(x, y, T, 3) } }
  }
  g.fillStyle = '#a01e1e26'; g.beginPath(); g.ellipse(mp.boss.x * T + 16, mp.boss.y * T + 16, T * 3, T * 2.2, 0, 0, 7); g.fill();
  const s = mp.stairs, sx = s.x * T, sy = s.y * T; g.fillStyle = mp.cleared ? '#c8b070' : '#4a4038'; for (let k = 0; k < 4; k++)g.fillRect(sx + 3 + k * 2, sy + 3 + k * 7, 26 - k * 4, 5);
  if (!mp.cleared) { g.strokeStyle = '#a33'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx + 4, sy + 4); g.lineTo(sx + 28, sy + 28); g.moveTo(sx + 28, sy + 4); g.lineTo(sx + 4, sy + 28); g.stroke() }
}
function torches(l) { const t = Date.now() / 90; l.forEach(([i, j], k) => { const x = i * T + 16, y = j * T + 18, q = 1 + Math.sin(t + k * 2) * .15; g.fillStyle = '#4a3020'; g.fillRect(x - 2, y, 4, 12); g.fillStyle = '#ffb02e'; g.beginPath(); g.ellipse(x, y - 2, 4 * q, 7 * q, 0, 0, 7); g.fill(); g.fillStyle = '#fff2a0'; g.beginPath(); g.ellipse(x, y, 2, 4, 0, 0, 7); g.fill() }) }
function glows(l) { g.globalCompositeOperation = 'lighter'; l.forEach(([i, j]) => { const x = i * T + 16, y = j * T + 14, gr = g.createRadialGradient(x, y, 2, x, y, 90); gr.addColorStop(0, 'rgba(255,150,50,.38)'); gr.addColorStop(1, 'rgba(255,150,50,0)'); g.fillStyle = gr; g.fillRect(x - 90, y - 90, 180, 180) }); g.globalCompositeOperation = 'source-over' }
function drawMon(m) {
  const x = m.x * T + 16 + (m.kx || 0), y = m.y * T + 30 + (m.ky || 0), s = m.boss ? 1.7 : 1, b = Math.sin(Date.now() / 200 + m.x * 3) * 1.5, c = m.col;
  g.fillStyle = '#0006'; g.beginPath(); g.ellipse(x, y, 11 * s, 3.5 * s, 0, 0, 7); g.fill();
  if (m.boss) { const gr = g.createRadialGradient(x, y - 20, 4, x, y - 20, 40); gr.addColorStop(0, 'rgba(255,40,40,.35)'); gr.addColorStop(1, 'rgba(255,40,40,0)'); g.fillStyle = gr; g.fillRect(x - 40, y - 60, 80, 80) }
  g.save(); g.translate(x, y + b); g.scale(s, s);
  switch (m.k) {
    case 0: g.strokeStyle = '#c88'; g.lineWidth = 2; g.beginPath(); g.moveTo(-9, -7); g.quadraticCurveTo(-18, -14, -14, -20); g.stroke(); rr(-9, -13, 18, 10, 5, c); rr(5, -14, 9, 8, 3, c); rr(6, -19, 4, 5, 2, '#c88'); rr(11, -11, 3, 3, 1, '#e99'); g.fillStyle = '#d22'; g.fillRect(9, -12, 2, 2); break;
    case 1: { g.translate(0, -6); const w = Math.sin(Date.now() / 70) * 6; tri(-3, -22, -20, -28 + w, -12, -12, '#4a2a66'); tri(3, -22, 20, -28 + w, 12, -12, '#4a2a66'); rr(-5, -24, 10, 12, 5, c); tri(-4, -24, -6, -30, -1, -25, c); tri(4, -24, 6, -30, 1, -25, c); g.fillStyle = '#ff4'; g.fillRect(-3, -20, 2, 2); g.fillRect(1, -20, 2, 2); g.fillStyle = '#fff'; g.fillRect(-2, -14, 1, 2); g.fillRect(1, -14, 1, 2); break }
    case 2: g.strokeStyle = '#d8d2ba'; g.lineWidth = 2; g.beginPath(); g.moveTo(-3, -6); g.lineTo(-3, 0); g.moveTo(3, -6); g.lineTo(3, 0); g.stroke(); rr(-6, -17, 12, 11, 3, c); g.fillStyle = '#0006'; for (let k = 0; k < 3; k++)g.fillRect(-5, -15 + k * 3, 10, 1); rr(-7, -29, 14, 12, 5, c); g.fillStyle = '#160a0a'; g.fillRect(-5, -25, 4, 4); g.fillRect(1, -25, 4, 4); g.fillStyle = '#f33'; g.fillRect(-4, -24, 2, 2); g.fillRect(2, -24, 2, 2); g.fillRect(-3, -19, 6, 2); g.strokeStyle = '#aab'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, -8); g.lineTo(10, -26); g.stroke(); break;
    case 3: rr(-9, -17, 18, 14, 4, '#5a3a20'); rr(-10, -10, 20, 3, 1, '#2a1a10'); rr(-8, -29, 16, 13, 5, c); tri(-5, -17, -3, -17, -4, -21, '#eee'); tri(3, -17, 5, -17, 4, -21, '#eee'); g.fillStyle = '#ee3'; g.fillRect(-5, -24, 3, 3); g.fillRect(2, -24, 3, 3); g.strokeStyle = '#6b4a2a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(12, -6); g.lineTo(12, -30); g.stroke(); tri(12, -30, 20, -28, 12, -22, '#9aa'); break;
    case 4: g.globalAlpha = .75; g.fillStyle = c; g.beginPath(); g.moveTo(-10, -2); g.lineTo(-10, -20); g.quadraticCurveTo(0, -38, 10, -20); g.lineTo(10, -2); g.lineTo(5, -6); g.lineTo(0, -1); g.lineTo(-5, -6); g.closePath(); g.fill(); g.strokeStyle = '#e8f6ff'; g.lineWidth = 1; g.stroke(); g.fillStyle = '#0a1a2a'; g.fillRect(-5, -22, 3, 5); g.fillRect(2, -22, 3, 5); g.fillRect(-2, -14, 4, 4); g.globalAlpha = 1; break;
    case 5: rr(-13, -21, 26, 19, 7, c); rr(-9, -33, 18, 13, 5, '#7f9070'); g.fillStyle = '#ee3'; g.fillRect(-5, -28, 3, 3); g.fillRect(2, -28, 3, 3); tri(-5, -22, -3, -22, -4, -26, '#eee'); tri(3, -22, 5, -22, 4, -26, '#eee'); rr(13, -32, 6, 22, 3, '#6b4a2a'); rr(11, -36, 10, 8, 4, '#5a3a20'); rr(-16, -19, 5, 10, 2, '#7f9070'); break;
    default: tri(-8, -20, -22, -30, -8, -8, '#7a1a1a'); tri(8, -20, 22, -30, 8, -8, '#7a1a1a'); rr(-8, -18, 16, 15, 4, c); rr(-7, -30, 14, 13, 5, '#c84a3a'); tri(-7, -28, -10, -38, -3, -30, '#eee'); tri(7, -28, 10, -38, 3, -30, '#eee'); g.fillStyle = '#ff0'; g.fillRect(-4, -25, 3, 3); g.fillRect(1, -25, 3, 3); g.strokeStyle = '#a22'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, -6); g.quadraticCurveTo(16, -4, 14, -14); g.stroke()
  }
  if (m.boss) rr(-7, -40, 14, 5, 2, '#e6c229'); g.restore();
  const w = 26 * s, ty = y - 34 * s - 8; g.fillStyle = '#000'; g.fillRect(x - w / 2, ty, w, 4); g.fillStyle = m.boss ? '#e33' : '#c33'; g.fillRect(x - w / 2 + 1, ty + 1, (w - 2) * m.hp / m.max, 2);
  if (m.boss) { g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(m.n, x + 1, ty - 3); g.fillStyle = '#f66'; g.fillText(m.n, x, ty - 4) }
  if (m.hitT > 0 && m.hitT % 4 < 2) { g.globalAlpha = .5; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y - 16 * s, 20 * s, 26 * s, 0, 0, 7); g.fill(); g.globalAlpha = 1 }
}
function drawWorld() {
  const F = wents[cam], fl = F.fl, mp = getMap(fl);
  const x0 = Math.round(clamp(F.x * T + 16 - 336, 0, mp.W * T - 672)), y0 = Math.round(clamp(F.y * T + 16 - 240, 0, mp.H * T - 480));
  g.fillStyle = '#0b0908'; g.fillRect(0, 0, cv.width, cv.height); if (map3d()) { try { draw3DWorld(F, fl, mp) } catch (err) { console.error('Mapa 3D falhou:', err); setVMode('sprite') } } else {
    g.save(); g.beginPath(); g.rect(0, 0, 672, 480); g.clip();
    const amp = shakeT * .22, shx = shakeT > 0 ? Math.sin(shakeT * 2.1) * amp : 0, shy = shakeT > 0 ? Math.cos(shakeT * 1.7) * amp * .6 : 0; g.translate(-x0 + shx, -y0 + shy);
    if (zoomT > 0) { const z = 1 + zoomT * .006, px = zoomPt ? zoomPt.x : x0 + 336, py = zoomPt ? zoomPt.y : y0 + 240; g.translate(px, py); g.scale(z, z); g.translate(-px, -py) }
    const i0 = x0 / T | 0, j0 = y0 / T | 0, i1 = Math.min(mp.W - 1, i0 + VW + 1), j1 = Math.min(mp.H - 1, j0 + VH + 1);
    mp.city ? drawCity(mp, i0, j0, i1, j1) : drawDun(mp, i0, j0, i1, j1); torches(mp.tr);
    g.fillStyle = mp.city ? 'rgba(8,8,32,.34)' : 'rgba(4,2,6,.5)'; g.fillRect(x0, y0, 672, 480); glows(mp.tr);
    mons.forEach(m => { if (m.fl == fl) drawMon(m) }); wents.forEach(e => { if (e.fl == fl) drawChar(e) });
    fx.forEach(f => {
      if (f.a.fl !== fl) return; const px = f.a.x * T + 16, py = f.a.y * T + 16;
      if (f.num) { g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; const yy = py - 24 - (30 - f.t) * .8; g.fillStyle = '#000'; g.fillText(f.num, px + 1, yy + 1); g.fillStyle = f.col; g.fillText(f.num, px, yy); return }
      if (f.ring) { g.strokeStyle = f.col || '#f55'; g.lineWidth = 3; g.globalAlpha = Math.min(1, f.t / 8); g.beginPath(); g.arc(px, py, f.rad ? f.rad * (1.2 - f.t / f.t0 * .6) : (20 - f.t) * 5, 0, 7); g.stroke(); g.globalAlpha = 1; return }
      g.strokeStyle = f.col || '#fff'; g.lineWidth = (f.w || 2) * f.t / 14 + 1; drawBeam(f)
    });
    drawParts(); g.restore()
  } g.fillStyle = '#120f0b'; g.fillRect(0, 480, 672, 60); g.textAlign = 'left'; g.font = '11px sans-serif';
  wents.forEach((e, i) => {
    const c = e.c, x = 6 + i * 167, y = 480; if (i == cam) { g.strokeStyle = '#e6c229'; g.lineWidth = 1; g.strokeRect(x - 3, y + 2, 163, 56) }
    g.fillStyle = '#e8dcc0'; g.fillText(`${c.name} Nv${c.level} · ${e.fl ? 'Andar ' + e.fl : 'Cidade'}`, x, y + 14);
    g.fillStyle = '#333'; g.fillRect(x, y + 19, 150, 6); g.fillStyle = '#e6c229'; g.fillRect(x, y + 19, 150 * c.xp / (c.level * 60), 6);
    g.fillStyle = '#333'; g.fillRect(x, y + 29, 150, 6); g.fillStyle = '#3c3'; g.fillRect(x, y + 29, 150 * Math.max(0, e.hp) / e.max, 6);
    g.fillStyle = '#aaa'; g.fillText(`mortes ${c.deaths} · medo ${c.fear} · recorde ${c.best}`, x, y + 48)
  });
  g.fillStyle = '#000a'; g.fillRect(4, 4, 290, 18); g.fillStyle = '#fff'; g.fillText(`Seguindo ${F.c.name} — clique no mapa para trocar`, 10, 17);
  if (banner && banner.t > 0) { g.globalAlpha = Math.min(1, banner.t / 20); g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(banner.text, cv.width / 2 + 2, 68); g.fillStyle = banner.col; g.fillText(banner.text, cv.width / 2, 66); g.globalAlpha = 1 }
}
function renderSkills() {
  const ci = state == 'world' && wents[cam] ? wents[cam].ci : +sa.value, c = chars[ci];
  document.getElementById('skp').innerHTML = `<b>${c.name}</b> Nv${c.level} — tipos de dano: ` + Object.keys(TC).map(k => `<span style="color:${TC[k]}">■ ${k}</span>`).join(' ') + '<br>'
    + c.sk.map((s, i) => `<span style="color:${TC[s.t]}">■ ${i + 1}. ${s.n}</span>${s.esp ? ' <b style="color:#ffd76b">★ ESPECIAL (+60% dano)</b>' : ''} [${s.t}] dano ${s.dmg}${s.h > 1 ? '×' + s.h : ''}${s.a ? ' · área ' + s.a : ''} · recarga ${(s.cd / 60).toFixed(1)}s · alcance ${s.range} · evolução ${s.st || 0}/${s.ev ? s.ev.length : 0} (${s.use || 0} usos)`).join('<br>')
    + '<br><small>Fraquezas: Esqueleto (fogo, mágico) · Fantasma (quase imune a físico; fraco a mágico e ki) · Troll (fogo, gelo) · Demônio (resiste a fogo; fraco a gelo)</small>'
}
sa.onchange = renderSkills; setInterval(renderSkills, 800);
// ---- Gravação de vídeo do golpe especial (roda local no navegador, sem servidor) ----
function recordSpecial(ci) {
  if (!cv.captureStream || !window.MediaRecorder) { log('Este navegador não suporta gravar vídeo direto da tela. Tente no Chrome ou Firefox mais recentes.'); return }
  const c = chars[ci]; auto = false; state = 'fight'; msg = ''; fx = []; banner = null;
  const dummy = { c: { name: 'Alvo de Treino', level: 1, sk: [], xp: 0, sk_: 0 }, x: 10, y: 7, hp: 99999, max: 99999, sk: [], mcd: 0, gcd: 0, human: true, f: -1, swing: 0 };
  const atk = { c, x: 8, y: 7, hp: 99999, max: 99999, sk: c.sk.map(s => ({ ...s, cdl: 0 })), mcd: 0, gcd: 0, human: true, f: 1, swing: 0 };
  ents = [atk, dummy];
  let stream; try { stream = cv.captureStream(30) } catch (err) { log('Falha ao capturar a tela: ' + err.message); return }
  let rec; try { rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' }) } catch (err) { try { rec = new MediaRecorder(stream) } catch (e2) { log('Falha ao iniciar gravação: ' + e2.message); return } }
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `golpe-especial-${c.name}.webm`; a.textContent = `⬇ Baixar vídeo: golpe especial de ${c.name}`; a.style.cssText = 'display:block;color:#8fd18f;margin-top:6px;font:13px sans-serif';
    document.getElementById('vid').innerHTML = ''; document.getElementById('vid').appendChild(a); log(`Vídeo pronto: golpe especial de ${c.name}.`); state = 'idle'
  };
  rec.start(); log(`Gravando o golpe especial de ${c.name}...`);
  setTimeout(() => { const esp = atk.sk.find(s => s.esp); if (esp) { esp.cdl = 0; atk.mcd = 0; atk.gcd = 0; cast(atk, dummy, esp) } }, 500);
  setTimeout(() => rec.stop(), 5200);
}
setVMode(vmode); document.getElementById('vq').value = M3.ps;
document.querySelectorAll('#dpad button').forEach(b => { const [x, z] = b.dataset.d.split(',').map(Number); b.onpointerdown = ev => { ev.preventDefault(); M3.dp.x = x; M3.dp.z = z }; const up = () => { M3.dp.x = 0; M3.dp.z = 0 }; b.onpointerup = up; b.onpointerleave = up; b.onpointercancel = up });
startLeisure();
(function loop() { tick(); draw(); requestAnimationFrame(loop) })();