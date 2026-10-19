// Identity and integrity come from the actual lockfile; licence metadata comes from installed package.json files.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const lock = await readFile('pnpm-lock.yaml', 'utf8');
const section = lock.split(/^packages:\s*$/m)[1]?.split(/^snapshots:\s*$/m)[0];
if (!section) throw new Error('Cannot read lockfile packages; no licence report written');
const wanted = [...section.matchAll(/^  ['"]?((?:@[^/]+\/)?[^@\s]+)@([^:'"\s]+)['"]?:\s*$/gm)].map(m => ({ name: m[1], version: m[2] }));
if (!wanted.length) throw new Error('No lockfile identities; no licence report written');
const metadata = new Map();
for (const folder of await readdir('node_modules/.pnpm', { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  const root = `node_modules/.pnpm/${folder.name}/node_modules`;
  let names; try { names = await readdir(root); } catch { continue; }
  const candidates = [];
  for (const name of names) {
    if (name.startsWith('@')) { for (const child of await readdir(`${root}/${name}`)) candidates.push(`${name}/${child}`); }
    else candidates.push(name);
  }
  for (const name of candidates) {
    try { const p = JSON.parse(await readFile(`${root}/${name}/package.json`, 'utf8')); metadata.set(`${p.name}@${p.version}`, p.license ?? 'UNKNOWN'); } catch { /* bin entries or optional packages not on this platform */ }
  }
}
const packages = wanted.map(p => ({ ...p, license: metadata.get(`${p.name}@${p.version}`) ?? 'NOT_INSTALLED_ON_THIS_PLATFORM' })).sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const report = { status: 'lockfile-derived', lockfileSha256: createHash('sha256').update(lock).digest('hex'), packages };
await writeFile('docs/licenses.json', JSON.stringify(report, null, 2) + '\n');
await writeFile('docs/licenses.md', '# Dependency licences\n\nLockfile SHA-256: `' + report.lockfileSha256 + '`\n\n| Package | Version | Licence metadata |\n|---|---|---|\n' + packages.map(p => `| ${p.name} | ${p.version} | ${typeof p.license === 'string' ? p.license : JSON.stringify(p.license)} |`).join('\n') + '\n\nsharp is Apache-2.0. Its prebuilt libvips (@img/sharp-libvips-darwin-x64 1.3.4) is dynamically linked and LGPL-3.0-or-later; retain the distributed licence notices. Platform-optional packages absent from this Intel Mac are explicitly marked; their metadata still needs review before distribution.\n');
