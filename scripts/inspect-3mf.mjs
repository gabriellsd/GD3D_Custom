import fs from 'fs';
import path from 'path';
import { readBambu3mfZip, parseAssemblyComponents, parseBuildItems, parseObjectModelPath, resolverMontagem } from '../src/viewer/bambu3mfParse.js';

const candidates = [
  'c:/Users/Gabriel/Desktop/Downloads/Charizard Pokémon Figura Esqueleto Fóssil de Dragão.3mf',
  'c:/Users/Gabriel/Downloads/Charizard Pokémon Figura Esqueleto Fóssil de Dragão.3mf',
];

let filePath = candidates.find((p) => fs.existsSync(p));
if (!filePath) {
  const { globSync } = await import('glob');
  const found = globSync('c:/Users/Gabriel/**/Charizard*.3mf', { nocase: true });
  filePath = found[0];
}
if (!filePath) {
  console.error('3MF not found');
  process.exit(1);
}
console.log('FILE', filePath);

const buf = fs.readFileSync(filePath);
const files = readBambu3mfZip(buf);
const main = new TextDecoder().decode(files['3D/3dmodel.model']);
const objectPath = parseObjectModelPath(main);
const objectXml = new TextDecoder().decode(files[objectPath.replace(/^\//, '')]);

console.log('objectPath', objectPath);
console.log('buildItems', parseBuildItems(main, objectPath));
console.log('componentesObjeto', parseAssemblyComponents(objectXml, objectPath));
console.log('componentesMain', parseAssemblyComponents(main, objectPath));

for (const layout of ['mesa', 'assembly', 'montado']) {
  const comps = resolverMontagem(main, objectPath, objectXml, files, { layout });
  console.log(`\nlayout=${layout} count=${comps.length}`);
  for (const c of comps) {
    const tr = c.transform ? c.transform.slice(9).map((n) => n.toFixed(2)).join(',') : 'null';
    const inner = c.innerXml?.match(/<vertices>/) ? 'mesh' : (c.innerXml?.match(/<components>/) ? 'assembly' : '?');
    const tri = (c.innerXml?.match(/<triangle/g) || []).length;
    console.log(`  id=${c.objectId} path=${c.path} t=[${tr}] ${inner} tris=${tri}`);
  }
}

const ms = new TextDecoder().decode(files['Metadata/model_settings.config']);
const parts = [...ms.matchAll(/<part id="(\d+)"[\s\S]*?<\/part>/gi)];
for (const p of parts) {
  const id = p[1];
  const name = p[0].match(/key="name"\s+value="([^"]*)"/i)?.[1];
  const obj = p[0].match(/key="object_id"\s+value="([^"]*)"/i)?.[1];
  console.log('part', id, 'name', name, 'object_id', obj);
}

for (const oid of ['1', '2', '3']) {
  for (const [label, xml] of [['object', objectXml], ['main', main]]) {
    const re = new RegExp(`<object\\s+id="${oid}"[\\s\\S]*?<\\/object>`, 'i');
    const m = xml.match(re);
    if (!m) continue;
    const chunk = m[0];
    const tris = (chunk.match(/<triangle/g) || []).length;
    const comps = (chunk.match(/<component/g) || []).length;
    console.log(`\n${label} object ${oid}: tris=${tris} components=${comps}`, chunk.slice(0, 350).replace(/\s+/g, ' '));
  }
}
