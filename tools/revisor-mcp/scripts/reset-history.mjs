// Volta o histórico de reviews ao seed (rode entre ensaios).
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
copyFileSync(path.join(DATA, 'review-history.seed.json'), path.join(DATA, 'review-history.json'));
console.log('review-history.json resetado para o seed (4 reviews).');
