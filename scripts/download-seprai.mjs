import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const targetDir = path.resolve('public/images/seprai');
const distDir = path.resolve('dist/images/seprai');
fs.mkdirSync(targetDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

async function main() {
  // 1. Fetch URLs from Bing async search for 'seprai'
  const allUrls = [
    // Include user's exact image first
    'https://down-id.img.susercontent.com/file/sg-11134201-22100-5nz1x2yx7eivbc'
  ];

  for (const first of [0, 35, 70, 105]) {
    try {
      const url = `https://www.bing.com/images/async?q=seprai&first=${first}&count=35&mmasync=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const text = await res.text();
      const murls = [...text.matchAll(/murl&quot;:&quot;([^&]+?)&quot;/g)].map(m => m[1]);
      for (const u of murls) {
        if (u.includes('susercontent.com') && !allUrls.includes(u)) {
          allUrls.push(u);
        }
      }
    } catch (e) {
      console.error('Fetch error at offset', first, e.message);
    }
  }

  console.log(`Discovered ${allUrls.length} Shopee seprai image URLs`);

  let count = 0;
  const downloaded = [];

  for (let i = 0; i < allUrls.length && count < 36; i++) {
    const url = allUrls[i];
    const filename = `sprei-${String(count + 1).padStart(2, '0')}.jpg`;
    const targetFile = path.join(targetDir, filename);
    const distFile = path.join(distDir, filename);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        // Only accept images > 20KB to ensure high quality
        if (buffer.length > 20000) {
          fs.writeFileSync(targetFile, buffer);
          fs.writeFileSync(distFile, buffer);
          count++;
          downloaded.push({
            index: count,
            filename,
            sourceUrl: url,
            size: buffer.length
          });
          console.log(`Saved [${count}/36] ${filename} (${Math.round(buffer.length / 1024)} KB)`);
        }
      }
    } catch (err) {
      console.warn(`Failed to download ${url}: ${err.message}`);
    }
  }

  console.log(`\nSuccessfully downloaded ${count} seprai images!`);
  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(downloaded, null, 2));
}

main().catch(console.error);

