#!/usr/bin/env node
import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');
const repoRoot = resolve(pkgRoot, '..', '..');
const watch = process.argv.includes('--watch');

const distDir = resolve(pkgRoot, 'dist');
if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const buildOptions = {
  entryPoints: [resolve(pkgRoot, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: resolve(distDir, 'index.js'),
  banner: { js: '#!/usr/bin/env node' },
  packages: 'external',
  logLevel: 'info',
};

const templatesSrc = resolve(pkgRoot, 'templates');
const skillsSrc = resolve(repoRoot, 'skills');
const referencesSrc = resolve(repoRoot, 'references');

function syncTemplates() {
  const templatesDist = resolve(pkgRoot, 'templates');
  // Wipe templates/ before each build so files deleted from source skills/ or
  // references/ do not persist as zombies in the published npm tarball. cpSync
  // is non-deleting, so without this step every prior file ever copied would
  // accumulate forever and ship to consumers.
  if (existsSync(templatesDist)) rmSync(templatesDist, { recursive: true, force: true });
  mkdirSync(templatesDist, { recursive: true });

  if (existsSync(skillsSrc)) {
    cpSync(skillsSrc, resolve(templatesDist, 'skills'), { recursive: true });
  }
  if (existsSync(referencesSrc)) {
    cpSync(referencesSrc, resolve(templatesDist, 'references'), { recursive: true });
  }
}

if (watch) {
  syncTemplates();
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('watching for changes...');
} else {
  syncTemplates();
  await build(buildOptions);
  if (existsSync(resolve(distDir, 'index.js'))) {
    const { chmodSync } = await import('node:fs');
    chmodSync(resolve(distDir, 'index.js'), 0o755);
  }
  console.log('build complete');
}
