import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "public/**",
      "*.config.*",
      "scripts/**"
    ]
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': {
        rules: {
          'exhaustive-deps': { create: () => ({}) },
          'rules-of-hooks': { create: () => ({}) }
        }
      },
      '@next/next': {
        rules: {
          'no-img-element': { create: () => ({}) }
        }
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off"
    },
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "prefer-const": "off"
    }
  }
);
