import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      ".react-router/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    // UNTITLED-01 — the VENDORED Untitled UI source
    // (`scripts/vendor-untitled.mjs`). Held to upstream's standards, not
    // DalyHub's, because the whole value of vendoring is that the next
    // re-vendor is a clean diff: rules that would force us to hand-edit these
    // files are turned off HERE rather than by editing them.
    //
    // Accessibility is deliberately NOT waived wholesale. The four a11y rules
    // below are suppressed one at a time, each because it misreads a React Aria
    // composition rather than because it found a defect, and real accessibility
    // is asserted where it can actually be measured — `e2e/accessibility.spec.ts`
    // runs axe over the rendered product, and every migrated surface is added to
    // it. DalyHub's own compositions over these primitives live outside this
    // directory and keep the full rule set.
    files: ["app/shared/ui/untitled/**/*.{ts,tsx}"],
    // Upstream carries its own `eslint-disable` comments for rules this block
    // already turns off; flagging them as redundant would be noise about a file
    // we do not edit.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      // The flagged handlers are `stopPropagation` calls on hint/label text
      // INSIDE a React Aria control (`AriaCheckbox`, `AriaRadio`, `AriaSwitch`),
      // so the user can select that text without toggling. They add no new
      // interaction — the real focusable input is rendered by React Aria and
      // keeps its own keyboard behaviour — so there is nothing to give a key
      // handler to.
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      // `autoFocus` here is focus moving INTO a just-opened overlay (the command
      // menu's search field, the multi-select's filter input), which is the
      // documented behaviour for those patterns rather than a page-load focus
      // steal.
      "jsx-a11y/no-autofocus": "off",
      // The heading takes its content from a prop, which the rule cannot see.
      "jsx-a11y/heading-has-content": "off",
      // Upstream's own typing and code-style choices; none of them affect
      // behaviour, and all of them would mean editing vendored files.
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-useless-assignment": "off",
      "jsx-a11y/img-redundant-alt": "off",
      "jsx-a11y/no-interactive-element-to-noninteractive-role": "off",
    },
  },
  {
    // PWA-02 — the service-worker template runs in the ServiceWorkerGlobalScope,
    // not a window or Node, and carries build-time placeholders that are not
    // valid JavaScript until the Vite plugin substitutes them.
    files: ["vite-plugins/sw-template.js"],
    languageOptions: { globals: globals.serviceworker },
    rules: { "no-undef": "off" },
  },
  prettier,
);
