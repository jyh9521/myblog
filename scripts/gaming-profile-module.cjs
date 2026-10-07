const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
// Reuse the typed normalizer in the scheduled Node task and its offline tests.
const source = fs.readFileSync(path.join(__dirname, '../lib/gaming-profile.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText;
const result = { exports: {} };
new Function('exports', 'module', compiled)(result.exports, result);
module.exports = result.exports;
