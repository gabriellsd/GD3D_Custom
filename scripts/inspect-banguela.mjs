import fs from 'fs';
import { parseBambu3mfBuffer } from '../src/viewer/advanced/bambu-3mf.js';
import {
  readBambu3mfZip,
  parseBuildItems,
  parseObjectModelPath,
  buildObjectIdPathMap,
  extractInnerObjectXml,
  resolverMontagem,
} from '../src/viewer/bambu3mfParse.js';
import { detectarBandejas3mf, mapearPartesPorObjectId } from '../src/viewer/advanced/bambu-bandejas.js';

const fp =
  'C:/Users/Gabriel/Downloads/MODELOS 3D/Miniaturas/Urban 3D/Banguela Urbano/Banguela Urbano sem AMS.3mf';
const buf = fs.readFileSync(fp);
const files = readBambu3mfZip(buf);
const main = new TextDecoder().decode(files['3D/3dmodel.model']);
const objectPath = parseObjectModelPath(main);
const buildItems = parseBuildItems(main, objectPath, buildObjectIdPathMap(files));

const ms = new TextDecoder().decode(files['Metadata/model_settings.config']);
const parts = [...ms.matchAll(/<part id="(\d+)"[\s\S]*?<\/part>/gi)];
console.log('parts count', parts.length);
console.log('\n--- sample part block ---\n', parts.find((p) => p[1] === '6')?.[0]?.slice(0, 1500));

for (const p of parts) {
  const id = p[1];
  const block = p[0];
  const name = block.match(/key="name"\s+value="([^"]*)"/i)?.[1];
  const objId = block.match(/key="object_id"\s+value="([^"]*)"/i)?.[1];
  const plate = block.match(/key="plate"\s+value="([^"]*)"/i)?.[1];
  const allKeys = [...block.matchAll(/key="([^"]+)"\s+value="([^"]*)"/gi)].map((m) => m[1]);
  console.log({ partId: id, objectId: objId, plate, name, keys: allKeys.join(',') });
}

console.log('\nbuildItems objectIds:', buildItems.map((b) => b.objectId).join(','));

for (let i = 1; i <= 4; i++) {
  const plate = JSON.parse(new TextDecoder().decode(files[`Metadata/plate_${i}.json`]));
  console.log(`\nPlate ${i}:`, plate.bbox_objects.map((o) => o.name).join(', '));
}

const bandejas = detectarBandejas3mf(files);
console.log('\nBandejas detectadas:', bandejas.length);
for (const b of bandejas) {
  console.log(`  Bandeja ${b.numero}: ${b.pecas.length} peças`, b.pecas.map((p) => p.nome).join(', '));
}

const partes = mapearPartesPorObjectId(files);
console.log('\nPartes por objectId (sample):');
for (const [oid, info] of [...partes.entries()].slice(0, 8)) {
  console.log(' ', oid, info.nome, 'bandeja', info.bandeja);
}

const comps = resolverMontagem(main, objectPath, new TextDecoder().decode(files[objectPath.replace(/^\//, '')]), files, { layout: 'montado' });
console.log('\nComponents montado:', comps.length);
for (const c of comps.slice(0, 6)) {
  const info = partes.get(c.objectId);
  console.log(' comp', c.objectId, info?.nome, 'bandeja', info?.bandeja);
}

for (let plate = 1; plate <= bandejas.length; plate++) {
  const r = parseBambu3mfBuffer(buf, { bandeja: plate, layout: 'montado' });
  console.log(`\nparse bandeja ${plate}: children`, r.object.children.length, r.object.children.map((c) => c.name).join(', '));
}
