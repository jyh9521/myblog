const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module'), ts = require('typescript');
module.exports = function load(file) {
  const absolute = path.resolve(file), local = createRequire(absolute);
  const context = { exports: {}, process, URL, URLSearchParams, Date, require(name) {
    const relative = name.startsWith('.') && path.resolve(path.dirname(absolute), name);
    if (relative && fs.existsSync(relative + '.ts')) return load(relative + '.ts');
    return local(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context, { filename: absolute });
  return context.exports;
};
