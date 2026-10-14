#!/usr/bin/env node
// Signs an update for the Android app (web/update/manifest.json + manifest.sig, published by GitHub Pages).
//
//   node tools/release.mjs                      after changing web/: Android picks up the new screens by itself
//   node tools/release.mjs --apk <file> --code 21 --name 1.11 --url <release asset url>
//                                               announce a new APK: the app shows "Update available"
//   --min-native <versionCode>                  the screens need at least this APK (new bridge features)
//
// The app only accepts a manifest signed with the key in ~/.config/orbit/update-key.pem (its public half is
// built into android/src/me/ali/orbit/WebUpdate.java), and every file must match the hash listed here.
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';

const root = new URL('..', import.meta.url).pathname;
const web = join(root, 'web');
const out = join(web, 'update');
const KEY = process.env.ORBIT_UPDATE_KEY || join(homedir(), '.config/orbit/update-key.pem');
// the same files android/build.sh puts in the APK
const SKIP = [/^sw\.js$/, /^manifest\.webmanifest$/, /^icon-.*\.png$/, /^admin\//, /^update\//];

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const sha = buf => createHash('sha256').update(buf).digest('hex');

function walk(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [relative(web, p)];
  });
}

const prev = existsSync(join(out, 'manifest.json')) ? JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) : { build: 0, minNative: 0 };
const files = {};
for (const f of walk(web).sort()) if (!SKIP.some(rx => rx.test(f))) files[f] = sha(readFileSync(join(web, f)));
const version = /const APP_VERSION = '([^']+)'/.exec(readFileSync(join(web, 'app.js'), 'utf8'))[1];

const manifest = { build: prev.build + 1, version, minNative: Number(args['min-native'] || prev.minNative || 0), files };
if (args.apk) {
  if (!args.code || !args.name || !args.url) throw new Error('--apk needs --code, --name and --url');
  manifest.native = { code: Number(args.code), name: String(args.name), url: String(args.url), sha256: sha(readFileSync(args.apk)), size: statSync(args.apk).size };
} else if (prev.native) manifest.native = prev.native;

const body = Buffer.from(JSON.stringify(manifest, null, 1) + '\n');
const sig = sign('sha256', body, createPrivateKey(readFileSync(KEY))).toString('base64'); // DER ECDSA, what Java's SHA256withECDSA expects
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'manifest.json'), body);
writeFileSync(join(out, 'manifest.sig'), sig + '\n');
console.log(`Signed build ${manifest.build} (web ${version}, ${Object.keys(files).length} files, needs APK ≥ ${manifest.minNative})` +
  (manifest.native ? `; latest APK ${manifest.native.name} (${manifest.native.code})` : ''));
