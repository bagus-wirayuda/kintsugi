export const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export const photo = (id, w = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;

// Seluruh visual katalog menggambarkan tekstil untuk kasur/spring bed.
export const assets = {
  hero: photo("photo-1505693416388-ac5ce068fe85", 2000),
  sheets: photo("photo-1586023492125-27b2c045efd7", 1600),
  fitted: photo("photo-1586023492125-27b2c045efd7", 1100),
  hotel: photo("photo-1616486338812-3dadae4b4ace", 1600),
  kids: photo("photo-1519710164239-da123dc03ef4", 1200),
  baby: photo("photo-1584100936595-c0654b55a2e2", 1200),
  protector: photo("photo-1505693416388-ac5ce068fe85", 900),
  pillow: photo("photo-1616486338812-3dadae4b4ace", 900),
  linen: photo("photo-1505693416388-ac5ce068fe85", 1200),
  stripe: photo("photo-1618221195710-dd6b41faaea6", 1000),
};

const colorNames = {
  "#F7F1E7": "Putih Ivory",
  "#0E6575": "Teal Samudra",
  "#9CB8B5": "Hijau Sage",
  "#6F8294": "Biru Kabut",
  "#B88C62": "Mocha Hangat",
  "#D7B28A": "Champagne",
  "#E8D8CB": "Rose Dust",
  "#6E7479": "Abu Batu",
  "#F4EFE2": "Krem Susu",
  "#B7C8D5": "Biru Langit",
  "#C9DDBB": "Hijau Mint",
  "#EACD72": "Kuning Ceria",
  "#F2C4C6": "Pink Lembut",
  "#E7EEF0": "Putih Awan",
};

export const colorLabel = (color) => colorNames[color?.toUpperCase()] || color;

const adultSizes = ["100×200", "120×200", "160×200", "180×200", "200×200"];
const childSizes = ["90×200", "100×200", "120×200"];
const babySizes = ["60×120", "70×140", "70×160"];

const collections = [
  {
    gender: "Wanita",
    items: [
      ["Sprei Fitted Katun Jepang Signature", "T-Shirt", 299000, 359000, "fitted", ["#F7F1E7", "#0E6575", "#9CB8B5"], adultSizes, "Sprei fitted berkaret penuh untuk membungkus kasur spring bed dengan rapi. Katun lembut dan sejuk untuk pemakaian harian."],
      ["Set Sprei Spring Bed Premium 4 pcs", "Kemeja & Blus", 379000, 429000, "sheets", ["#F4EFE2", "#6F8294", "#B88C62"], adultSizes, "Satu set sprei untuk spring bed: sprei utama, dua sarung bantal, dan satu sarung guling. Pilih ukuran kasur sebelum membeli."],
      ["Sprei Karet Bamboo Soft", "Celana", 339000, 0, "linen", ["#9CB8B5", "#E8D8CB", "#6E7479"], adultSizes, "Sprei karet elastis yang mengikuti sudut kasur spring bed dan tidak mudah bergeser saat digunakan."],
      ["Set Sarung Bantal & Guling Kintsugi", "Sweater & Cardigan", 119000, 0, "pillow", ["#F7F1E7", "#0E6575", "#D7B28A"], ["Standar", "King"], "Pelengkap sprei untuk bantal dan guling dengan warna senada, dirancang untuk melengkapi set kasur Anda."],
    ],
  },
  {
    gender: "Pria",
    items: [
      ["Sprei Hotel Stripe 300TC", "Luaran", 419000, 479000, "stripe", ["#F7F1E7", "#E7EEF0", "#6F8294"], adultSizes, "Sprei motif garis hotel untuk membungkus kasur spring bed. Tenunan rapat memberi tampilan kamar lebih bersih dan teratur."],
      ["Sprei Fitted Hotel Deep Pocket", "T-Shirt", 359000, 0, "hotel", ["#F7F1E7", "#6F8294", "#0E6575"], adultSizes, "Sprei fitted dengan karet sudut dan ruang kasur lebih dalam, cocok untuk spring bed ber-topper."],
      ["Set Sprei Guest House 4 pcs", "Kemeja & Blus", 389000, 449000, "sheets", ["#F4EFE2", "#9CB8B5", "#B88C62"], adultSizes, "Set sprei praktis untuk kamar tamu: membungkus kasur spring bed sekaligus menyamakan warna bantal dan guling."],
      ["Sarung Bantal Hotel 2 pcs", "Sweater & Cardigan", 99000, 0, "pillow", ["#F7F1E7", "#E7EEF0", "#0E6575"], ["Standar", "King"], "Sarung bantal lembut berpasangan untuk dipadukan dengan sprei spring bed koleksi hotel."],
    ],
  },
  {
    gender: "Anak",
    items: [
      ["Sprei Anak Motif Langit Ceria", "Rok & Gaun", 249000, 289000, "kids", ["#B7C8D5", "#C9DDBB", "#EACD72"], childSizes, "Sprei berkaret untuk membungkus spring bed anak. Motif dan warna ceria tetap mudah dipadukan dengan kamar anak."],
      ["Sprei Fitted Anak Cotton Cool", "T-Shirt", 219000, 0, "fitted", ["#B7C8D5", "#F2C4C6", "#E7EEF0"], childSizes, "Sprei fitted katun dengan karet di sekeliling sudut agar tetap rapi di kasur spring bed anak."],
      ["Sprei Karet Anak Playful", "Celana", 229000, 0, "sheets", ["#C9DDBB", "#EACD72", "#F2C4C6"], childSizes, "Sprei karet lembut dan ringan untuk penggunaan sehari-hari pada kasur spring bed ukuran anak."],
      ["Set Sprei Anak 4 pcs", "Kemeja & Blus", 299000, 349000, "kids", ["#B7C8D5", "#C9DDBB", "#F2C4C6"], childSizes, "Satu set sprei spring bed anak lengkap dengan sarung bantal dan guling dalam warna yang serasi."],
    ],
  },
  {
    gender: "Bayi",
    items: [
      ["Sprei Fitted Box Bayi Soft Touch", "T-Shirt", 159000, 0, "baby", ["#E7EEF0", "#F2C4C6", "#C9DDBB"], babySizes, "Sprei fitted lembut untuk kasur box bayi. Karet sekeliling membantu sprei membungkus kasur secara rapi."],
      ["Set Sprei Bayi Motif Awan 3 pcs", "Rok & Gaun", 199000, 239000, "baby", ["#B7C8D5", "#F2C4C6", "#E7EEF0"], babySizes, "Set sprei kasur bayi berisi sprei fitted dan sarung bantal kecil. Pilih ukuran sesuai kasur box bayi."],
      ["Pelindung Kasur Bayi Waterproof", "Aksesoris", 139000, 0, "protector", ["#F7F1E7", "#E7EEF0", "#C9DDBB"], babySizes, "Lapisan pelindung di bawah sprei untuk membantu menjaga kasur bayi tetap bersih tanpa mengubah kenyamanan."],
      ["Sarung Bantal Bayi 2 pcs", "Sweater & Cardigan", 69000, 0, "pillow", ["#E7EEF0", "#F2C4C6", "#C9DDBB"], ["Baby", "Toddler"], "Sarung bantal kecil yang lembut untuk melengkapi set sprei kasur bayi."],
    ],
  },
];

export const products = collections.flatMap(({ gender, items }, groupIndex) =>
  items.map((item, itemIndex) => ({
    id: `lj-${groupIndex + 1}-${itemIndex + 1}`,
    sku: `KTS-SPR-${groupIndex + 1}${String(itemIndex + 1).padStart(2, "0")}`,
    name: item[0],
    category: item[1],
    gender,
    price: item[2],
    oldPrice: item[3],
    image: assets[item[4]],
    colors: item[5],
    sizes: item[6],
    description: item[7],
    rating: 4.7 + (itemIndex % 3) * 0.1,
    reviews: 38 + groupIndex * 21 + itemIndex * 13,
    stock: 36,
    isNew: itemIndex < 2,
  })),
);

// Nilai internal dipertahankan demi kompatibilitas API dan database lama.
export const categories = ["Semua", "T-Shirt", "Kemeja & Blus", "Celana", "Luaran", "Sweater & Cardigan", "Rok & Gaun", "Aksesoris"];

export const campaigns = [
  { eyebrow: "KINTSUGI SPRING BED", title: "Sprei rapi.\nTidur lebih utuh.", desc: "Sprei fitted untuk membungkus spring bed dengan nyaman dan presisi.", image: assets.hero, tag: "Sprei spring bed", product: "Sprei Fitted Katun Jepang", price: "Mulai Rp159.000" },
  { eyebrow: "EVERYDAY FITTED", title: "Pas di sudut.\nLembut di tidur.", desc: "Pilih ukuran dan warna sprei yang sesuai dengan kasur Anda.", image: assets.fitted, tag: "Karet penuh", product: "Sprei Karet Bamboo Soft", price: "Rp339.000" },
  { eyebrow: "COLOUR YOUR ROOM", title: "Warna yang rapi.\nKamar yang tenang.", desc: "Pilihan warna jelas untuk setiap ukuran spring bed.", image: assets.hotel, tag: "Pilihan warna", product: "Set Sprei Spring Bed", price: "Mulai Rp199.000" },
];
