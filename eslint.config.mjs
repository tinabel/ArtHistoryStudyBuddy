import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['build/**', 'dist/**', 'coverage/**', 'node_modules/**', '.claude/**']),

  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Names should say what they hold: no single letters or two-letter abbreviations.
      // The exceptions are whole words or names fixed by something outside the code (the Met's `q` search parameter).
      'id-length': ['error', { min: 3, exceptions: ['id', 'to', 'go', 'ok', 'fs', 'os', 'q'], properties: 'never' }],
    },
  },
  { files: ['src/renderer/**/*.ts'], languageOptions: { globals: globals.browser } },
  { files: ['src/main/**/*.ts'], languageOptions: { globals: globals.node } },
  {
    // Tests stub globals and poke at internals, so a few strictness rules are relaxed here.
    files: ['test/**/*.ts'],
    languageOptions: { globals: { ...globals.jest, ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Plain JS (config and build scripts): no type information.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
]);
