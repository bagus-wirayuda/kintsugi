import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'liny_jaya',
};

const APP_PORT = process.env.PORT || 3001;
const APP_HOST = process.env.HOST || '127.0.0.1';
const BASE_URL = `http://${APP_HOST}:${APP_PORT}`;

console.log('====================================================');
console.log('MULAI DIAGNOSTIK PENUH SERVER & DATABASE');
console.log('====================================================\n');

function scanCodebase(dir, searchString) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (['node_modules', '.git', 'dist', 'debug-full.js'].includes(file.name)) continue;
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results.push(...scanCodebase(fullPath, searchString));
    } else if (/\.(js|ts|jsx|tsx)$/.test(file.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes(searchString)) {
          results.push({
            file: fullPath,
            line: idx + 1,
            context: lines.slice(Math.max(0, idx - 8), Math.min(lines.length, idx + 8)).join('\n')
          });
        }
      });
    }
  }
  return results;
}

console.log('--- [1] MENCARI SUMBER PESAN ERROR DI CODEBASE ---');
const matches = scanCodebase('.', 'Layanan toko sedang tidak tersedia');
if (matches.length === 0) {
  console.log('Teks tidak ditemukan secara langsung.');
} else {
  for (const m of matches) {
    console.log(`\nDitemukan di: ${m.file} (Baris ${m.line})`);
    console.log('----------------------------------------------------');
    console.log(m.context);
    console.log('----------------------------------------------------');
  }
}

console.log('\n--- [2] MEMERIKSA SINTAKS SQL TIDAK KOMPATIBEL DI SERVER/ ---');
const sqlIssues = ['SKIP LOCKED', 'NOWAIT', 'RETURNING', 'JSON_TABLE', 'REGEXP_REPLACE'];
for (const keyword of sqlIssues) {
  const found = scanCodebase('./server', keyword);
  if (found.length > 0) {
    console.log(`Ditemukan sintaks "${keyword}" di:`);
    found.forEach(f => console.log(`   - ${f.file}:${f.line}`));
  }
}

async function testDatabaseWrite() {
  console.log('\n--- [3] MENGUJI OPERASI DATABASE ---');
  let conn;
  try {
    conn = await mysql.createConnection(config);
    const [[versionRow]] = await conn.query('SELECT VERSION() AS ver, @@sql_mode AS mode');
    console.log(`Versi DB : ${versionRow.ver}`);
    console.log(`SQL Mode : ${versionRow.mode}`);

    for (const table of ['users', 'sessions', 'auth_challenges']) {
      try {
        const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
        console.log(`Tabel '${table}' OK (${cols.length} kolom): ${cols.map(c => c.Field).join(', ')}`);
      } catch (err) {
        console.error(`Gagal membaca struktur tabel '${table}':`, err.message);
      }
    }

    const [users] = await conn.query('SELECT id, email, role FROM users LIMIT 5');
    console.log(`Jumlah user di tabel users saat ini: ${users.length}`);
    if (users.length > 0) console.table(users);

  } catch (err) {
    console.error('Error Database:', err.message);
    if (err.sql) console.error('   SQL:', err.sql);
  } finally {
    if (conn) await conn.end();
  }
}

async function testPostEndpoints() {
  console.log('\n--- [4] MENCARI & MENGUJI ENDPOINT POST DI SERVER ---');
  const postRoutes = scanCodebase('./server', '.post(');
  console.log(`Ditemukan ${postRoutes.length} definisi route .post():`);
  postRoutes.forEach(r => {
    const firstLine = r.context.split('\n').find(l => l.includes('.post(')) || '';
    console.log(`   - ${r.file}:${r.line} -> ${firstLine.trim()}`);
  });

  console.log(`\nMencoba mengirim request POST ke ${BASE_URL}...`);
  const testPaths = ['/api/auth/login', '/api/login', '/api/auth/challenge', '/api/newsletter'];
  for (const p of testPaths) {
    try {
      const res = await fetch(`${BASE_URL}${p}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': process.env.APP_URL || BASE_URL
        },
        body: JSON.stringify({
          email: process.env.ADMIN_EMAIL || 'admin@linyjaya.test',
          password: process.env.ADMIN_PASSWORD || 'AdminLinyJaya2026!'
        })
      });
      const text = await res.text();
      console.log(`\nPOST ${p} [Status: ${res.status}]`);
      console.log(`Response: ${text.slice(0, 300)}`);
    } catch (err) {
      console.error(`Gagal menghubungi ${BASE_URL}${p}: ${err.message}`);
    }
  }
}

await testDatabaseWrite();
await testPostEndpoints();
console.log('\n====================================================');
console.log('DIAGNOSTIK SELESAI');
console.log('====================================================');