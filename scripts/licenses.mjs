// Identity and integrity come from the actual lockfile; licence metadata comes from installed package.json files.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const lock = await readFile('pnpm-lock.yaml', 'utf8');
// pnpm12 has a leading manager-environment document and an application document.
// Read both without serializing, normalizing or rewriting any lockfile bytes.
const documents = lock.split(/^---[ \t]*\r?$/m).filter(part => part.trim());
const wanted = documents.flatMap((document, documentIndex) => {
  const section = document.split(/^packages:[ \t]*\r?$/m)[1]?.split(/^snapshots:[ \t]*\r?$/m)[0];
  if (!section) throw new Error('Cannot read lockfile packages; no licence report written');
  const scope = /packageManagerDependencies:/.test(document) ? 'manager_environment' : 'application';
  return [...section.matchAll(/^  ['"]?((?:@[^/]+\/)?[^@\s]+)@([^:'"\s]+)['"]?:[ \t]*\r?\n    resolution: \{integrity: ([^}]+)\}/gm)].map(m => ({ scope, documentIndex, name: m[1], version: m[2], integrity: m[3] }));
});
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
const packages = wanted.map(p => ({ ...p, license: metadata.get(`${p.name}@${p.version}`) ?? null, metadataSource: metadata.has(`${p.name}@${p.version}`) ? 'installed_package_json' : 'not_installed_metadata_pending' })).sort((a, b) => a.scope.localeCompare(b.scope) || `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const report = { status: 'lockfile-derived-partial-license-metadata', lockfileSha256: createHash('sha256').update(lock).digest('hex'), documentCount: documents.length, packages };
await writeFile('docs/licenses.json', JSON.stringify(report, null, 2) + '\n');
await writeFile('docs/licenses.md', '# Dependency licences\n\nLockfile SHA-256: `' + report.lockfileSha256 + '`\n\n| Package | Version | Scope | Licence metadata |\n|---|---|---|---|\n' + packages.map(p => `| ${p.name} | ${p.version} | ${p.scope} | ${p.license === null ? 'METADATA PENDING (not installed)' : typeof p.license === 'string' ? p.license : JSON.stringify(p.license)} |`).join('\n') + '\n\nsharp is Apache-2.0. Its prebuilt libvips (@img/sharp-libvips-darwin-x64 1.3.4) is dynamically linked and LGPL-3.0-or-later; retain the distributed licence notices. Both raw lockfile documents are inventoried. Packages without installed metadata, including the manager graph and platform optional packages, remain pending; absence is not a licence or compatibility verdict. No dependency payload or publisher attestation is claimed. Retain and review distributed licence notices before distribution.\n');
