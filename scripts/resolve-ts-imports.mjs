// Extract and resolve TypeScript/JavaScript imports. Ownership policy stays in
// check-shared-boundaries.py. This file does not decide which edges are legal.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const root = path.resolve(input.root);

function compilerOptions() {
  const configPath = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(configPath)) {
    return {
      allowJs: true,
      baseUrl: root,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      paths: {
        '@vivek/auth': ['packages/auth/src/index.ts'],
        '@vivek/browser': ['packages/browser/src/index.ts'],
        '@vivek/ui': ['packages/ui/src/public-api.ts'],
      },
      target: ts.ScriptTarget.ES2022,
    };
  }
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
  parsed.options.allowJs = true;
  parsed.options.noEmit = true;
  return parsed.options;
}

const options = compilerOptions();

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function literal(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function visitSpecifiers(sourceFile, found) {
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      found.push({
        kind: node.importClause?.isTypeOnly ? 'type' : 'import',
        specifier: literal(node.moduleSpecifier),
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      found.push({ kind: 'export', specifier: literal(node.moduleSpecifier) });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      found.push({ kind: 'require', specifier: literal(node.moduleReference.expression) });
    } else if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const required = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (dynamic || required) {
        found.push({
          kind: dynamic ? 'dynamic' : 'require',
          specifier: literal(node.arguments[0]),
        });
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      found.push({ kind: 'import-type', specifier: literal(node.argument.literal) });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function unresolvedMatters(specifier) {
  if (specifier == null) return true;
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('@') ||
    specifier.startsWith('apps/') ||
    specifier.startsWith('apps.')
  );
}

function insideRoot(file) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

const edges = [];
const unresolved = [];
for (const file of input.files) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, scriptKind(file));
  const found = [];
  visitSpecifiers(source, found);
  for (const item of found) {
    if (item.specifier == null) {
      // import(expr) and require(expr) have no static specifier. Literal forms stay edges.
      continue;
    }
    if (item.specifier.startsWith('data:')) continue;
    const resolved = ts.resolveModuleName(item.specifier, file, options, ts.sys);
    const target = resolved.resolvedModule && resolved.resolvedModule.resolvedFileName;
    if (!target || !insideRoot(target)) {
      if (!target && unresolvedMatters(item.specifier)) {
        unresolved.push({ kind: item.kind, source: file, specifier: item.specifier });
      }
      continue;
    }
    edges.push({ kind: item.kind, source: file, specifier: item.specifier, target });
  }
}

process.stdout.write(JSON.stringify({ edges, unresolved }));
