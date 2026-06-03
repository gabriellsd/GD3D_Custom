import fs from 'fs';
import { extractFilamentColorsFrom3mfBuffer } from '../src/viewer/bambu3mfParse.js';

export function readFilamentColorsFrom3mfFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return extractFilamentColorsFrom3mfBuffer(buffer);
  } catch {
    return [];
  }
}
