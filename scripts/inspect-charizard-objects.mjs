import fs from 'fs';
import { readBambu3mfZip, parseObjectModelPath, extractInnerObjectXml } from '../src/viewer/bambu3mfParse.js';

function inspect(fp) {
  console.log('\n===', fp.split(/[/\\]/).pop(), '===');
  const zip = readBambu3mfZip(fs.readFileSync(fp));
  const main = new TextDecoder().decode(zip['3D/3dmodel.model']);
  const objectPath = parseObjectModelPath(main);
  const objectXml = new TextDecoder().decode(zip[objectPath.replace(/^\//, '')]);

  console.log('objectPath', objectPath);
  for (const oid of [1, 2, 3, 4, 5]) {
    const inner = extractInnerObjectXml(objectXml, oid);
    if (!inner) continue;
    const tris = (inner.match(/<triangle/g) || []).length;
    const comps = (inner.match(/<component/g) || []).length;
    const hasMesh = /<mesh/.test(inner);
    console.log(`object ${oid}: tris=${tris} components=${comps} hasMesh=${hasMesh}`);
    if (comps > 0) {
      const compTags = [...inner.matchAll(/<component[^>]*>/gi)];
      for (const c of compTags) console.log(' ', c[0].slice(0, 200));
    }
  }

  const buildMatch = main.match(/<build[\s\S]*?<\/build>/i);
  if (buildMatch) {
    console.log('build section:', buildMatch[0].replace(/\s+/g, ' ').slice(0, 400));
  }
}

inspect('public/products/Charizard Pokémon Figura Esqueleto Fóssil de Dragão.3mf');
inspect('c:/Users/Gabriel/Downloads/Charizard_Skeleton_OnePiece.3mf');
