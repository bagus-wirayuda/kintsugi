// tes.js (Format ES Module)
import mysql from 'mysql2/promise';

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'liny_jaya',
};

async function showAllDatabaseContent() {
  try {
    const connection = await mysql.createConnection(config);
    console.log(`✅ Terhubung ke database: ${config.database}\n`);

    // 1. Ambil seluruh daftar tabel secara otomatis
    const [tables] = await connection.query('SHOW TABLES');
    const tableKey = `Tables_in_${config.database}`;

    console.log(`📋 Total Tabel Ditemukan: ${tables.length}`);
    console.log('====================================');

    // 2. Looping untuk melihat isi dari masing-masing tabel
    for (const row of tables) {
      const tableName = row[tableKey];
      const [data] = await connection.query(`SELECT * FROM \`${tableName}\``);

      console.log(`\n📌 TABEL: ${tableName} (Total: ${data.length} baris)`);
      if (data.length > 0) {
        console.table(data); // Menampilkan isi tabel dengan format rapi
      } else {
        console.log('   (Tabel ini masih kosong)');
      }
    }

    await connection.end();
  } catch (error) {
    console.error('❌ Gagal:', error.message);
  }
}

showAllDatabaseContent();