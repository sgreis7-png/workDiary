import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    // src/lib/supabase.ts builds its client at import time and throws without a URL, so any
    // test whose import graph reaches it needs one. These are deliberately fixed values rather
    // than whatever a developer happens to have in .env: every test drives the fake client, so
    // real credentials would be both useless and a way for a test to hit production by accident.
    // Without this the suite passed locally (where .env exists) and failed in CI, where it does not.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
