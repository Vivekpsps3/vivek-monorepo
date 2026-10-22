const { createRequire } = require("module");
const path = require("path");

const requireFromFinance = createRequire(
  path.join(__dirname, "../apps/finance/frontend/package.json"),
);
const eslint = requireFromFinance("@eslint/js");
const tseslint = requireFromFinance("typescript-eslint");
const angular = requireFromFinance("angular-eslint");

const typeScript = [eslint.configs.recommended, ...tseslint.configs.recommended];
const typeScriptRules = {
  "no-undef": "off",
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
  ],
};

module.exports = tseslint.config(
  {
    files: ["browser/src/**/*.ts", "auth/src/**/*.ts"],
    extends: typeScript,
    rules: typeScriptRules,
  },
  {
    files: ["ui/src/**/*.ts"],
    extends: [...typeScript, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      ...typeScriptRules,
      "@angular-eslint/directive-selector": [
        "error",
        { type: "attribute", prefix: "ui", style: "camelCase" },
      ],
      "@angular-eslint/component-selector": [
        "error",
        { type: "element", prefix: "ui", style: "kebab-case" },
      ],
    },
  },
  {
    files: ["ui/src/**/*.html"],
    extends: [...angular.configs.templateRecommended],
  },
);
