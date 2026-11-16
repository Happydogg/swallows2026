// Prepared staging target only. Never provision a bucket or deploy automatically.
import { bindings, defineConfig } from 'cf/config';
export default defineConfig({
  accountId: '702be60427145f59fa040e5250602bd7',
  worker: {
    name: 'sdl-r2-staging-gate',
    entrypoint: './index.mjs',
    compatibilityDate: '2026-11-16',
    env: {
      MEDIA_BUCKET: bindings.r2({ name: 'sdl-media-staging' }),
      SUPABASE_URL: bindings.json('https://wvurolqbjhuckkkjiiiv.supabase.co'),
      SUPABASE_PUBLISHABLE_KEY: bindings.secret(),
      SUPABASE_SECRET_KEY: bindings.secret(),
      SUBMISSIONS_ENABLED: bindings.json('false')
    },
    observability: { enabled: true, traces: { enabled: true } }
  }
});
