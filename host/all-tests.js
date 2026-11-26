// all-tests.js - `node --test host/` loads the folder's "main", this file: every test file under test/.
// (`cd host && node --test` finds the same files by Node's own glob.)
import fs from 'node:fs';

const dir = new URL('./test/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.test.js')).sort()) {
  await import(new URL(f, dir));
}
