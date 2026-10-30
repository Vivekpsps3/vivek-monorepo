const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const rules = {
  'no-undef': 'off',
  '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_'}],
};
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
);
