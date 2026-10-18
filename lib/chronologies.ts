import fs from 'node:fs';
import path from 'node:path';
import { validateChronology } from './chronology-schema.cjs';
import { auditChronologyLanguage } from './chronology-language.cjs';
import type { Chronology } from './chronology-types';

export function getChronologies(): Chronology[] {
  const folder = path.join(process.cwd(), 'content/chronologies');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(file => /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file)).map(file => {
    const data = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
    const errors = validateChronology(data);
    if (data.id === 'genesis') errors.push(...auditChronologyLanguage(data));
    if (data.id !== file.slice(0, -5)) errors.push('文件名必须与年表 ID 一致');
    if (errors.length) throw new Error(`${file}: ${errors.join('; ')}`);
    return data as Chronology;
  });
}
