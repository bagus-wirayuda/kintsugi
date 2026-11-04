import assert from 'node:assert';
import { parseDimensions, dimensionLabel } from '../src/dimensions.js';

console.log('--- Testing Mode Switch Logic ---');

// Test 1: switching to text mode from dimensions
let rows = [
  { id: '1', size: '160×200×30', variation: 'Putih', stock: 20, length: '160', width: '200', height: '30', imageUrl: '' }
];

function switchMode(newMode, currentRows) {
  return currentRows.map((r) => {
    if (newMode === 'dimensions') {
      const d = parseDimensions(r?.size);
      const l = r?.length || d?.length || '160';
      const w = r?.width || d?.width || '200';
      const h = r?.height || d?.height || '30';
      return {
        ...r,
        length: String(l),
        width: String(w),
        height: String(h),
        size: `${l}×${w}×${h}`,
      };
    } else {
      const currentSize = String(r?.size ?? '');
      const isDimension = /[×xX]/.test(currentSize) || (r?.length && r?.width);
      return {
        ...r,
        size: !isDimension && currentSize ? currentSize : 'S',
      };
    }
  });
}

// Switch to text
rows = switchMode('text', rows);
assert.strictEqual(rows[0].size, 'S', 'Should default to S when converting from dimensions');

// User updates text size to "XL"
rows[0].size = 'XL';

// Switch back to dimensions
rows = switchMode('dimensions', rows);
assert.strictEqual(rows[0].size, '160×200×30', 'Should restore dimensions');
assert.strictEqual(rows[0].length, '160');
assert.strictEqual(rows[0].width, '200');
assert.strictEqual(rows[0].height, '30');

// Switch to text again (should preserve if not dimension, or convert)
rows[0].size = 'All Size';
rows[0].length = '';
rows[0].width = '';
rows[0].height = '';
rows = switchMode('text', rows);
assert.strictEqual(rows[0].size, 'All Size', 'Custom text size preserved');

// Switch back to dimensions from custom text
rows = switchMode('dimensions', rows);
assert.strictEqual(rows[0].length, '160');
assert.strictEqual(rows[0].width, '200');
assert.strictEqual(rows[0].height, '30');
assert.strictEqual(rows[0].size, '160×200×30');

console.log('✓ Mode switch simulation passed cleanly!');
