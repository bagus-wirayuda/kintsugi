import { pool } from '../server/db.js';
(async () => {
  const { rows } = await pool.query("SELECT setting_value FROM store_settings WHERE setting_key='homeSections'");
  if (!rows[0]) {
    const defaultSections = [
      {
        id: "section-1",
        kicker: "SLEEP ESSENTIALS",
        title: "Pilihan untuk tidur yang lebih baik.",
        productIds: ["lj-1-1", "lj-1-2", "lj-1-8", "lj-2-1"]
      }
    ];
    await pool.query("INSERT INTO store_settings(setting_key, setting_value) VALUES('homeSections', ?)", [JSON.stringify(defaultSections)]);
    console.log("Seeded homeSections successfully!");
  } else {
    console.log("homeSections already exists:", rows[0].setting_value);
  }
  process.exit(0);
})();
