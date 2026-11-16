const ts = require('typescript');
const vm = require('node:vm');

// Execute the actual pinned bundle's editor code without booting the CMS UI.
// TypeScript's binder follows references to top-level declarations, retaining
// their original order and source. No Lexical nodes or commands are mocked.
module.exports = function loadRuntime(source) {
  const file = 'sveltia.js';
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const host = {
    getSourceFile: name => name === file ? ast : undefined,
    getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => '',
    getDirectories: () => [], fileExists: name => name === file,
    readFile: name => name === file ? source : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  };
  const checker = ts.createProgram([file], { allowJs: true, noLib: true, noResolve: true }, host).getTypeChecker();
  const body = ast.statements[0].expression.expression.expression.body;
  const declarations = new Map();
  for (const statement of body.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
      }
    } else if (ts.isFunctionDeclaration(statement)) declarations.set(statement.name.text, statement);
  }
  const selected = new Set();
  function include(declaration) {
    if (!declaration) throw Error('Pinned Sveltia test entry point changed');
    if (selected.has(declaration)) return;
    selected.add(declaration);
    function walk(node) {
      if (ts.isIdentifier(node)) {
        for (const dependency of checker.getSymbolAtLocation(node)?.declarations || []) {
          if (dependency.name && declarations.get(dependency.name.text) === dependency) include(dependency);
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(declaration);
  }
  const exports = {
    createEditor: 'rv', root: 'ng', list: 'kw', item: 'Mw', text: 'eh', paragraph: 'Sh',
    insertTable: 'mve', selection: '$', registerLists: 'Vve', registerRichText: 'Lpe', enter: 'Od',
    importMarkdown: 'Wme', exportMarkdown: 'Gme', transformers: 'ET', tableTransformer: 'Tve',
    ListNode: 'Ow', ListItemNode: 'jw', TableNode: 'PE', TableRowNode: 'YT', TableCellNode: 'WT',
    registerHistory: 'uhe', createHistory: 'dhe', undo: 'Fd', redo: 'Id',
  };
  Object.values(exports).forEach(name => include(declarations.get(name)));
  const code = [...selected].sort((a, b) => a.pos - b.pos)
    .map(node => ts.isVariableDeclaration(node) ? `var ${node.getText(ast)};` : node.getText(ast)).join('\n');
  return vm.runInNewContext(`${code}\n;({${Object.entries(exports).map(([key, value]) => `${key}:${value}`).join(',')}})`,
    { console, setTimeout, clearTimeout, queueMicrotask, performance, URL, URLSearchParams });
};
