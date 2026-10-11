// Проверяет, что src/api/schema.d.ts соответствует docs/contracts/openapi.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'api-schema-'));
const tmp = join(dir, 'schema.d.ts');
try {
  execFileSync('npx', ['openapi-typescript', '../docs/contracts/openapi.yaml', '-o', tmp], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  const fresh = readFileSync(tmp, 'utf8');
  const committed = readFileSync('src/api/schema.d.ts', 'utf8');
  if (fresh !== committed) {
    console.error(
      'src/api/schema.d.ts устарел: выполните `npm run gen:api` и закоммитьте результат.',
    );
    process.exitCode = 1;
  } else {
    console.log('src/api/schema.d.ts актуален.');
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
