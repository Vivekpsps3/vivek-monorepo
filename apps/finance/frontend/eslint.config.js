const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

const typeScript = [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
];

// TypeScript already reports undefined names. ESLint's no-undef does not
// understand Angular, Jasmine, or Node globals.
const typeScriptRules = {
  "no-undef": "off",
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
  ],
};

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", ".angular/**"],
  },
  {
    files: ["src/**/*.ts"],
    extends: [...typeScript, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      ...typeScriptRules,
      "@angular-eslint/directive-selector": [
        "error",
        { type: "attribute", prefix: "app", style: "camelCase" },
      ],
      "@angular-eslint/component-selector": [
        "error",
        { type: "element", prefix: "app", style: "kebab-case" },
      ],
    },
  },
  {
    files: ["src/**/*.html"],
    extends: [...angular.configs.templateRecommended],
  },
  {
    files: ["e2e/**/*.ts"],
    extends: typeScript,
    rules: typeScriptRules,
  },
);
