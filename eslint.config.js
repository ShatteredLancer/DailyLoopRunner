import globals from 'globals';

export default [
  {
    ignores: [
      'artifacts/**',
      'dist/**',
      'FSU_mod/**',
      'node_modules/**',
      'reports/**',
      'DailyLoopRunner.user.js',
    ],
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        AbortController: 'readonly',
        cancelAnimationFrame: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        queueMicrotask: 'readonly',
        requestAnimationFrame: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        structuredClone: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'no-undef': ['error', { typeof: true }],
    },
  },
  {
    files: ['src/userscript-entry.js', 'DailyLoopRunnerHotReload.user.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        GM_deleteValue: 'readonly',
        GM_getValue: 'readonly',
        GM_notification: 'readonly',
        GM_setValue: 'readonly',
        GM_xmlhttpRequest: 'readonly',
        unsafeWindow: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.js', 'eslint.config.js', 'vitest.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-undef': ['error', { typeof: true }],
    },
  },
];
