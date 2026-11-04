import fs from 'node:fs';

const code = fs.readFileSync('src/Admin.jsx', 'utf8');

// Find all imported names
const importMatches = code.matchAll(/import\s+(?:\{([^}]+)\}|([A-Za-z0-9_]+))\s+from/g);
const importedNames = new Set(['React']);
for (const match of importMatches) {
  if (match[1]) {
    match[1].split(',').forEach((name) => {
      const trimmed = name.trim().split(/\s+as\s+/)[1] || name.trim();
      if (trimmed) importedNames.add(trimmed);
    });
  }
  if (match[2]) {
    importedNames.add(match[2].trim());
  }
}

console.log('Imported names:', Array.from(importedNames).sort());

// Find all JSX tags that start with capital letter
const jsxTags = new Set();
const tagMatches = code.matchAll(/<([A-Z][A-Za-z0-9_]*)/g);
for (const match of tagMatches) {
  jsxTags.add(match[1]);
}

console.log('\nJSX Component Tags used:');
const missingTags = [];
for (const tag of Array.from(jsxTags).sort()) {
  const isImported = importedNames.has(tag);
  console.log(`- ${tag}: ${isImported ? 'OK' : 'MISSING'}`);
  if (!isImported) missingTags.push(tag);
}

if (missingTags.length > 0) {
  console.error('\nMISSING JSX TAGS:', missingTags);
} else {
  console.log('\nAll JSX tags are properly imported!');
}
