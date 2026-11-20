// SDL-UX-003: Strict allowlist build for a PUBLIC, synthetic-only UI preview.
// Do not copy the staging app, real config, backend services, family data or media.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ALLOWLIST = Object.freeze([
  ['preview/index.html', 'index.html'],
  ['preview/app.js', 'app.js'],
  ['logo.png', 'logo.png'],
  ['components/AppShell.js', 'components/AppShell.js'],
  ['components/CoachHome.js', 'components/CoachHome.js'],
  ['components/ParentHome.js', 'components/ParentHome.js'],
  ['components/LoginLanding.js', 'components/LoginLanding.js'],
  ['components/InviteOnboarding.js', 'components/InviteOnboarding.js']
]);
const CONFIG_SHIM = [
  '// Synthetic preview; no live configuration.',
  'export const SUBMISSION_FEATURES_ENABLED = false;',
  ''
  ].join(String.fromCharCode(10));
const DENY_TERMS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PRIVATE_MEDIA_WORKER_URL',
  '.supabase.co', 'workers.dev', 'sb_secret_', 'service_role',
  'fetch(', 'XMLHttpRequest', 'WebSocket(', 'EventSource(', '.from(', '.rpc('
];

function branchCommit() {
  const commit = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
  if (commit && /^[a-f0-9]{40}$/i.test(commit)) return commit;
  try {
    const result = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (/^[a-f0-9]{40}$/i.test(result)) return result;
  } catch { /* Offline local checks may run without .git. */ }
  return 'local';
}

export function buildUxPreview(root = ROOT) {
  root = path.resolve(root);
  const out = path.join(root, 'dist-ux-preview');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const manifest = [];

  for (const [sourceRelative, outputRelative] of ALLOWLIST) {
    const source = path.join(root, sourceRelative);
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Preview source must be a regular file: ' + sourceRelative);
    const content = fs.readFileSync(source);
    if (sourceRelative.endsWith('.js') || sourceRelative.endsWith('.html')) {
      const decoded = content.toString('utf8');
      for (const deny of DENY_TERMS) {
        if (decoded.toLowerCase().includes(deny.toLowerCase())) throw Error('Disallowed live API or secret pattern in preview source: ' + sourceRelative);
      }
    }
    const dest = path.join(out, outputRelative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    manifest.push(outputRelative);
  }

  fs.mkdirSync(path.join(out,'js'),{recursive:true});
  fs.writeFileSync(path.join(out,'js/config.js'), CONFIG_SHIM);
  manifest.push('js/config.js');

  const commit = branchCommit();
  const meta = {
    commit, branch: 'feature/SDL-UX-002-login-redesign',
    dataMode: 'synthetic', backendConnected: false
  };
  fs.writeFileSync(path.join(out,'meta.js'), 'window.SDL_UX_META = Object.freeze(' + JSON.stringify(meta) + ');\n');
  manifest.push('meta.js');

  const headers = [
    '/*',
    '  Cache-Control: no-store',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  X-Frame-Options: DENY',
    '  X-Robots-Tag: noindex, nofollow, noarchive',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    "  Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    ''
  ].join(String.fromCharCode(10));
  fs.writeFileSync(path.join(out, '_headers'), headers);
  fs.writeFileSync(path.join(out, '404.html'), '<!doctype html><title>SDL UX Preview</title><p>Page not found.</p>');
  manifest.push('_headers', '404.html');

  const files = fs.readdirSync(out, {recursive:true, withFileTypes:true})
    .filter(entry=>entry.isFile()).map(entry=>entry.name);
  if (manifest.length !== 12 || !files.length) throw Error('Preview package unexpectedly empty.');
  return { directory:out, manifest, commit };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = buildUxPreview();
  console.log('SDL-UX-003: isolated synthetic preview ready. Files: ' + result.manifest.length + '; commit: ' + result.commit.slice(0,8));
}
