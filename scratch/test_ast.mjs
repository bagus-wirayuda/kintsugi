import fs from 'node:fs';
import * as babel from '@babel/parser';

const code = fs.readFileSync('src/Admin.jsx', 'utf8');

const ast = babel.parse(code, {
  sourceType: 'module',
  plugins: ['jsx']
});

const declaredGlobals = new Set([
  'React', 'window', 'document', 'location', 'history', 'console', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'fetch', 'FormData', 'URLSearchParams', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Math', 'Date', 'Set', 'Map', 'JSON', 'Promise', 'Error',
  'RegExp', 'encodeURIComponent', 'decodeURIComponent', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'undefined', 'null', 'Infinity', 'NaN', 'alert', 'confirm', 'prompt'
]);

const fileDeclared = new Set([...declaredGlobals]);

// First pass: collect all imports and top-level declarations
for (const node of ast.program.body) {
  if (node.type === 'ImportDeclaration') {
    node.specifiers.forEach(s => fileDeclared.add(s.local.name));
  } else if (node.type === 'FunctionDeclaration') {
    if (node.id) fileDeclared.add(node.id.name);
  } else if (node.type === 'VariableDeclaration') {
    node.declarations.forEach(d => {
      if (d.id.type === 'Identifier') fileDeclared.add(d.id.name);
    });
  }
}

console.log('File-level declared:', fileDeclared.size);

// Check usages of undeclared identifiers
const undeclared = new Set();

function checkScope(node, scope) {
  if (!node) return;

  const currentScope = new Set(scope);

  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    node.params.forEach(p => {
      if (p.type === 'Identifier') currentScope.add(p.name);
      else if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') currentScope.add(p.left.name);
      else if (p.type === 'ObjectPattern') {
        p.properties.forEach(prop => {
          if (prop.value?.type === 'Identifier') currentScope.add(prop.value.name);
        });
      }
    });
  }

  if (node.type === 'VariableDeclaration') {
    node.declarations.forEach(d => {
      if (d.id.type === 'Identifier') currentScope.add(d.id.name);
      else if (d.id.type === 'ArrayPattern') {
        d.id.elements.forEach(el => {
          if (el?.type === 'Identifier') currentScope.add(el.name);
        });
      } else if (d.id.type === 'ObjectPattern') {
        d.id.properties.forEach(prop => {
          if (prop?.value?.type === 'Identifier') currentScope.add(prop.value.name);
        });
      }
    });
  }

  if (node.type === 'CatchClause') {
    if (node.param?.type === 'Identifier') currentScope.add(node.param.name);
  }

  // Check identifier
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
    const name = node.callee.name;
    if (!currentScope.has(name) && !fileDeclared.has(name)) {
      undeclared.add(name);
    }
  }

  for (const key in node) {
    if (key === 'callee' || key === 'params') continue;
    if (node[key] && typeof node[key] === 'object') {
      if (Array.isArray(node[key])) {
        node[key].forEach(child => checkScope(child, currentScope));
      } else {
        checkScope(node[key], currentScope);
      }
    }
  }
}

checkScope(ast.program, new Set());

console.log('Undeclared function calls found:', Array.from(undeclared));
