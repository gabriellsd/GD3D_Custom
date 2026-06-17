import fs from 'fs';
import { readBambu3mfZip, parseObjectModelPath, parseAssemblyComponents, parseBuildItems, resolverMontagem } from '../src/viewer/bambu3mfParse.js';

const files = [
  'public/products/Charizard Pokémon Figura Esqueleto Fóssil de Dragão.3mf',
  'c:/Users/Gabriel/Downloads/Charizard_Skeleton_OnePiece.3mf',
];

for (const fp of files) {
  if (!fs.existsSync(fp)) {
    console.log('MISSING', fp);
    continue;
  }
  console.log('\n===', fp.split(/[/\\]/).pop(), '===');
  const zip = readBambu3mfZip(fs.readFileSync(fp));
  const main = new TextDecoder().decode(zip['3D/3dmodel.model']);
  const objectPath = parseObjectModelPath(main);
  const objectXml = new TextDecoder().decode(zip[objectPath.replace(/^\//, '')]);
  console.log('buildItems', parseBuildItems(main, objectPath).length);
  console.log('componentesObjeto', parseAssemblyComponents(objectXml, objectPath).length);

  const ms = new TextDecoder().decode(zip['Metadata/model_settings.config']);
  const parts = [...ms.matchAll(/<part id="(\d+)"[\s\S]*?<\/part>/gi)];
  console.log('model_settings parts', parts.length);
  for (const p of parts.slice(0, 15)) {
    const id = p[1];
    const name = p[0].match(/key="name"\s+value="([^"]*)"/i)?.[1];
    const obj = p[0].match(/key="object_id"\s+value="([^"]*)"/i)?.[1];
    console.log('  part', id, 'name', name, 'object_id', obj);
  }

  for (const layout of ['mesa', 'montado']) {
    const comps = resolverMontagem(main, objectPath, objectXml, zip, { layout });
    console.log('layout', layout, 'components', comps.length);
  }
}
