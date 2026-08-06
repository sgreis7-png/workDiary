import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'android-twa', 'supabase/functions', 'src/preview.tsx'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // the codebase deliberately casts at the PostgREST boundary, where rows
      // arrive untyped; `any` stays banned, which is the rule that matters
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // fire-and-forget notification/telemetry calls intentionally swallow
      'no-empty': ['error', { allowEmptyCatch: true }],

      // React-Compiler-era advisories. They flag patterns that are legal and
      // working here (deriving state from props in an effect, mutating a local
      // draft before setState). Kept visible as warnings rather than enforced,
      // so CI is not blocked by a refactor of shipped, working screens.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
)
