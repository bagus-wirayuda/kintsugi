export const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export const photo = (id, w = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;
export const assetSources = {
  hero: photo("photo-1483985988355-763728e1935b", 2000),
  men: photo("photo-1617137968427-85924c800a22", 1600),
  kids: photo("photo-1519689680058-324335c77eba", 1600),
  baby: photo("photo-1519689680058-324335c77eba", 1600),
  editorial: photo("photo-1445205170230-053b83016050", 1200),
  linen: photo("photo-1598554747436-c9293d6a588f", 1200),
  shirt: photo("photo-1434389677669-e08b4cac3105", 900),
  tshirt: photo("photo-1521572163474-6864f9cf17ab", 900),
  jacket: photo("photo-1544022613-e87ca75a784a", 900),
  denim: photo("photo-1542272604-787c3835535d", 900),
  dress: photo("photo-1515372039744-b8f02a3ae446", 900),
  bag: photo("photo-1544816155-12df9643f363", 900),
};
export const assets = Object.fromEntries(
  Object.keys(assetSources).map((key) => [key, `/images/${key}.jpg`]),
);
const basics = [
  [
    "Kemeja Linen Blend Lengan Panjang",
    "Kemeja & Blus",
    299000,
    399000,
    "linen",
    ["#e5dfd2", "#c5d3cf", "#fff"],
    "Lembut, ringan, dan terasa sejuk. Kemeja linen untuk menemani hari-hari Anda.",
  ],
  [
    "T-Shirt Katun Premium Relaxed",
    "T-Shirt",
    149000,
    199000,
    "tshirt",
    ["#e8e6e1", "#333e44", "#9c987f"],
    "Potongan rileks dengan katun berkualitas yang nyaman sepanjang hari.",
  ],
  [
    "Celana Jeans Straight Fit",
    "Celana",
    399000,
    0,
    "denim",
    ["#627c92", "#272c36", "#d3cfbe"],
    "Siluet lurus yang timeless dengan sentuhan denim yang semakin nyaman.",
  ],
  [
    "Cardigan Rajut Soft Touch",
    "Sweater & Cardigan",
    349000,
    0,
    "shirt",
    ["#d8c8b6", "#8d554d", "#2f383a"],
    "Rajutan halus untuk layering yang ringan dan effortless.",
  ],
  [
    "Jaket Utility Ringan",
    "Luaran",
    499000,
    599000,
    "jacket",
    ["#656c5c", "#d2c2ab", "#303438"],
    "Fungsional, ringan, dan mudah dipadukan untuk aktivitas Anda.",
  ],
  [
    "Gaun Midi Linen Blend",
    "Rok & Gaun",
    449000,
    0,
    "dress",
    ["#cfaf75", "#262f35", "#ece3d6"],
    "Gaun berpotongan santai dengan detail sederhana yang elegan.",
  ],
  [
    "Tas Bahu Mini Serbaguna",
    "Aksesoris",
    199000,
    249000,
    "bag",
    ["#e0d6bf", "#333", "#78806d"],
    "Ringkas dengan ruang yang pas untuk semua barang esensial Anda.",
  ],
  [
    "Sweater Katun Crew Neck",
    "Sweater & Cardigan",
    299000,
    0,
    "shirt",
    ["#d9d0c1", "#7b818a", "#54574d"],
    "Esensial sehari-hari dengan tekstur lembut dan potongan modern.",
  ],
];
export const products = ["Wanita", "Pria", "Anak", "Bayi"].flatMap(
  (gender, g) =>
    basics.map((b, i) => ({
      id: `lj-${g + 1}-${i + 1}`,
      sku: `LJ-${1000 + g * 100 + i}`,
      name: b[0],
      category: b[1],
      gender,
      price: g > 1 ? Math.round((b[2] * 0.7) / 1000) * 1000 : b[2],
      oldPrice: b[3],
      image: assets[b[4]],
      colors: b[5],
      sizes:
        g === 3
          ? ["60", "70", "80", "90"]
          : g === 2
            ? ["100", "110", "120", "130", "140"]
            : ["XS", "S", "M", "L", "XL", "XXL"],
      description: b[6],
      rating: 4.7 + (i % 3) * 0.1,
      reviews: 24 + i * 17,
      stock: 30,
      isNew: i < 4,
    })),
);
export const categories = [
  "Semua",
  "T-Shirt",
  "Kemeja & Blus",
  "Celana",
  "Luaran",
  "Sweater & Cardigan",
  "Rok & Gaun",
  "Aksesoris",
];
export const campaigns = [
  {
    eyebrow: "THE EVERYDAY EDIT",
    title: "Sederhana.\nSelalu istimewa.",
    desc: "Ruang untuk bergerak. Kebebasan untuk menjadi diri sendiri.",
    image: assets.hero,
    tag: "Koleksi baru",
    product: "Koleksi Esensial Sehari-hari",
    price: "Mulai Rp149.000",
  },
  {
    eyebrow: "LINEN COLLECTION",
    title: "Ringan terasa.\nBebas bergaya.",
    desc: "Tekstur alami, kenyamanan yang mengikuti setiap langkah.",
    image: assets.linen,
    tag: "Linen blend",
    product: "Kemeja Linen Blend",
    price: "Rp299.000",
  },
  {
    eyebrow: "A NEW PERSPECTIVE",
    title: "Gaya Anda.\nCerita Anda.",
    desc: "Temukan esensial baru untuk semua rencana hari ini.",
    image: assets.men,
    tag: "Everyday essentials",
    product: "Koleksi Pilihan Minggu Ini",
    price: "Mulai Rp149.000",
  },
];
