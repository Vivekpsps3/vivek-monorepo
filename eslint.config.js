const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const rules = {
  'no-undef': 'off',
  '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_'}],
};
// worldgen-design.md §6.1: the engine is pure. ESLint replaces a rule's array,
// so canonical.ts restates no-restricted-syntax without the Object.keys ban.
const ENGINE_PURITY = 'worldgen-design.md §6.1: engine must be pure';
module.exports = tseslint.config(
  {ignores:['node_modules/**','dist/**','coverage/**','.angular/**','**/vendor/**']},
  {
    files:['apps/**/src/**/*.ts','packages/ui/src/**/*.ts'],
    extends:[eslint.configs.recommended,...tseslint.configs.recommended,...angular.configs.tsRecommended],
    processor:angular.processInlineTemplates,
    rules:{...rules,
      '@angular-eslint/directive-selector':['error',{type:'attribute',prefix:['app','ui'],style:'camelCase'}],
      '@angular-eslint/component-selector':['error',{type:'element',prefix:['app','ui','suite','site','media','travel'],style:'kebab-case'}],
    },
  },
  {
    files:['apps/finance/frontend/src/**/*.ts'],
    rules:{
      '@angular-eslint/directive-selector':['error',{type:'attribute',prefix:'app',style:'camelCase'}],
      '@angular-eslint/component-selector':['error',{type:'element',prefix:'app',style:'kebab-case'}],
    },
  },
  {
    files:['packages/ui/src/**/*.ts'],
    rules:{
      '@angular-eslint/directive-selector':['error',{type:'attribute',prefix:'ui',style:'camelCase'}],
      '@angular-eslint/component-selector':['error',{type:'element',prefix:'ui',style:'kebab-case'}],
    },
  },
  {
    files:['apps/site/src/**/*.ts'],
    rules:{
      '@angular-eslint/directive-selector':['error',{type:'attribute',prefix:'app',style:'camelCase'}],
      '@angular-eslint/component-selector':['error',{type:'element',prefix:['app','site'],style:'kebab-case'}],
    },
  },
  {files:['apps/**/src/**/*.html','packages/ui/src/**/*.html'],extends:[...angular.configs.templateRecommended]},
  {files:['apps/**/e2e/**/*.ts','packages/browser/src/**/*.ts','packages/auth/src/**/*.ts','packages/ui/pixels/**/*.ts'],extends:[eslint.configs.recommended,...tseslint.configs.recommended],rules},
  {
    files: ['apps/web/src/app/world/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        {name: 'performance', message: ENGINE_PURITY},
        {name: 'crypto', message: ENGINE_PURITY},
        {name: 'localStorage', message: ENGINE_PURITY},
        {name: 'sessionStorage', message: ENGINE_PURITY},
        {name: 'indexedDB', message: ENGINE_PURITY},
        {name: 'Intl', message: ENGINE_PURITY},
        {name: 'window', message: ENGINE_PURITY},
        {name: 'document', message: ENGINE_PURITY},
      ],
      'no-restricted-properties': ['error',
        {object: 'Math', property: 'random', message: ENGINE_PURITY},
        {object: 'Date', property: 'now', message: ENGINE_PURITY},
        {object: 'globalThis', property: 'crypto', message: ENGINE_PURITY},
        {object: 'globalThis', property: 'performance', message: ENGINE_PURITY},
        {object: 'self', property: 'crypto', message: ENGINE_PURITY},
        {object: 'globalThis', property: 'localStorage', message: ENGINE_PURITY},
        {object: 'globalThis', property: 'Intl', message: ENGINE_PURITY},
      ],
      'no-restricted-syntax': ['error',
        {selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: ENGINE_PURITY},
        {selector: "MemberExpression[property.name=/^toLocale/]", message: ENGINE_PURITY},
        {selector: 'ForInStatement', message: ENGINE_PURITY},
        {selector: "CallExpression[callee.object.name='Object'][callee.property.name=/^(keys|values|entries)$/]", message: ENGINE_PURITY},
        {selector: "MemberExpression[object.object.name='globalThis'][object.property.name='Math'][property.name='random']", message: ENGINE_PURITY},
      ],
    },
  },
  {
    files: ['apps/web/src/app/world/engine/canonical.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        {selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: ENGINE_PURITY},
        {selector: "MemberExpression[property.name=/^toLocale/]", message: ENGINE_PURITY},
        {selector: 'ForInStatement', message: ENGINE_PURITY},
        {selector: "CallExpression[callee.object.name='Object'][callee.property.name=/^(values|entries)$/]", message: ENGINE_PURITY},
        {selector: "MemberExpression[object.object.name='globalThis'][object.property.name='Math'][property.name='random']", message: ENGINE_PURITY},
      ],
    },
  },
);
