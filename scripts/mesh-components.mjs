import fs from 'fs';
import { readBambu3mfZip } from '../src/viewer/bambu3mfParse.js';

const buf = fs.readFileSync('c:/Users/Gabriel/Downloads/Charizard Pokémon Figura Esqueleto Fóssil de Dragão.3mf');
const files = readBambu3mfZip(buf);
const objectXml = new TextDecoder().decode(files['3D/Objects/object_1.model']);
const vertsPart = objectXml.match(/<vertices>[\s\S]*?<\/vertices>/)[0];
const trisPart = objectXml.match(/<triangles>[\s\S]*?<\/triangles>/)[0];

const verts = [];
for (const m of vertsPart.matchAll(/x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)) {
  verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
}

const triangles = [];
for (const m of trisPart.matchAll(/v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
  triangles.push([parseInt(m[1]), parseInt(m[2]), parseInt(m[3])]);
}
console.log('verts', verts.length, 'tris', triangles.length);

// Union-find connected components via shared vertices
const parent = verts.map((_, i) => i);
function find(a) {
  while (parent[a] !== a) {
    parent[a] = parent[parent[a]];
    a = parent[a];
  }
  return a;
}
function union(a, b) {
  a = find(a); b = find(b);
  if (a !== b) parent[b] = a;
}

for (const [a, b, c] of triangles) {
  union(a, b); union(b, c);
}

const compVerts = new Map();
for (let i = 0; i < verts.length; i++) {
  const r = find(i);
  if (!compVerts.has(r)) compVerts.set(r, 0);
  compVerts.set(r, compVerts.get(r) + 1);
}

const sizes = [...compVerts.values()].sort((a, b) => b - a);
console.log('vertex components', compVerts.size);
console.log('top 10 sizes', sizes.slice(0, 10));

// Cluster by triangle adjacency
const triParent = triangles.map((_, i) => i);
function triFind(a) {
  while (triParent[a] !== a) { triParent[a] = triParent[triParent[a]]; a = triParent[a]; }
  return a;
}
function triUnion(a, b) { a = triFind(a); b = triFind(b); if (a !== b) triParent[b] = a; }

const vertToTris = Array.from({ length: verts.length }, () => []);
triangles.forEach((t, ti) => t.forEach((vi) => vertToTris[vi].push(ti)));
for (let vi = 0; vi < verts.length; vi++) {
  const ts = vertToTris[vi];
  for (let i = 1; i < ts.length; i++) triUnion(ts[0], ts[i]);
}
const triComps = new Map();
for (let i = 0; i < triangles.length; i++) {
  const r = triFind(i);
  triComps.set(r, (triComps.get(r) || 0) + 1);
}
const triSizes = [...triComps.values()].sort((a, b) => b - a);
console.log('triangle components', triComps.size);
console.log('top tri comp sizes', triSizes.slice(0, 10));
