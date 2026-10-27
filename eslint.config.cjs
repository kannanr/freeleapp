const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const angular = require("@angular-eslint/eslint-plugin");
const templates = require("@angular-eslint/eslint-plugin-template");
const templateParser = require("@angular-eslint/template-parser");
const prettier = require("eslint-plugin-prettier");
const prettierRules = require("eslint-config-prettier");
const globals = require("globals");

module.exports = [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/gushio/**", "packages/desktop-app/electron/**", "packages/desktop-app/.angular/**", "packages/desktop-app/out-tsc/**", "packages/desktop-app/scripts/windows-sign.js"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, ...globals.jasmine, ...globals.jest },
    },
    plugins: { "@typescript-eslint": tsPlugin, "@angular-eslint": angular, prettier },
    rules: {
      ...js.configs.recommended.rules,
      ...prettierRules.rules,
      "prettier/prettier": ["error", { trailingComma: "es5" }],
      "brace-style": ["error", "1tbs"],
      "no-bitwise": "error",
      "no-control-regex": "error",
      "no-empty": "off",
      "no-underscore-dangle": "off",
      "no-case-declarations": "off",
      "no-dupe-else-if": "warn",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-definitions": "error",
      "@typescript-eslint/naming-convention": "error",
      "@typescript-eslint/explicit-module-boundary-types": ["warn", { allowArgumentsExplicitlyTypedAsAny: true }],
      "@typescript-eslint/explicit-member-accessibility": ["warn", {
        accessibility: "explicit",
        overrides: { accessors: "off", constructors: "no-public", methods: "no-public", properties: "off", parameterProperties: "off" },
      }],
      "@typescript-eslint/no-use-before-define": "error",
      "@angular-eslint/component-selector": ["error", { type: "element", prefix: "app", style: "kebab-case" }],
      "@angular-eslint/directive-selector": ["error", { type: "attribute", prefix: "app", style: "camelCase" }],
    },
  },
  {
    files: ["**/*.html"],
    languageOptions: { parser: templateParser },
    plugins: { "@angular-eslint/template": templates },
    rules: {
      "@angular-eslint/template/banana-in-box": "error",
      "@angular-eslint/template/eqeqeq": "error",
      "@angular-eslint/template/no-negated-async": "error",
    },
  },
];
