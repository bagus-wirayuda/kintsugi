export const mainCategories = [
  { id: "seprai", label: "Seprai & Bedding", name: "Seprai & Bedding" },
  { id: "fashion", label: "Fashion & Pakaian", name: "Fashion & Pakaian" },
  { id: "home-living", label: "Perlengkapan Rumah", name: "Perlengkapan Rumah" },
];

export const catalogCategories = [
  // Kategori Utama
  { id: "seprai", label: "Seprai & Bedding", name: "Seprai & Bedding", parentId: null, parent_id: null },
  { id: "fashion", label: "Fashion & Pakaian", name: "Fashion & Pakaian", parentId: null, parent_id: null },
  { id: "home-living", label: "Perlengkapan Rumah", name: "Perlengkapan Rumah", parentId: null, parent_id: null },

  // Sub-kategori Seprai
  { id: "Sprei Fitted", label: "Sprei Fitted", name: "Sprei Fitted", parentId: "seprai", parent_id: "seprai" },
  { id: "Set Sprei", label: "Set Sprei Spring Bed", name: "Set Sprei Spring Bed", parentId: "seprai", parent_id: "seprai" },
  { id: "Sprei Karet", label: "Sprei Karet", name: "Sprei Karet", parentId: "seprai", parent_id: "seprai" },
  { id: "Sprei Hotel", label: "Sprei Hotel", name: "Sprei Hotel", parentId: "seprai", parent_id: "seprai" },
  { id: "Sarung Bantal & Guling", label: "Sarung Bantal & Guling", name: "Sarung Bantal & Guling", parentId: "seprai", parent_id: "seprai" },
  { id: "Sprei Motif", label: "Sprei Motif", name: "Sprei Motif", parentId: "seprai", parent_id: "seprai" },
  { id: "Pelindung Kasur", label: "Pelindung Kasur", name: "Pelindung Kasur", parentId: "seprai", parent_id: "seprai" },

  // Sub-kategori Fashion
  { id: "fashion-kaos", label: "Kaos & T-Shirt", name: "Kaos & T-Shirt", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-kemeja", label: "Kemeja Kasual & Formal", name: "Kemeja Kasual & Formal", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-celana", label: "Celana Panjang & Pendek", name: "Celana Panjang & Pendek", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-dress", label: "Dress & Tunik", name: "Dress & Tunik", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-outerwear", label: "Jaket & Outerwear", name: "Jaket & Outerwear", parentId: "fashion", parent_id: "fashion" },

  // Sub-kategori Perlengkapan Rumah
  { id: "home-selimut", label: "Selimut & Bed Cover", name: "Selimut & Bed Cover", parentId: "home-living", parent_id: "home-living" },
  { id: "home-bantal", label: "Bantal & Guling", name: "Bantal & Guling", parentId: "home-living", parent_id: "home-living" },
  { id: "home-handuk", label: "Handuk Mandi", name: "Handuk Mandi", parentId: "home-living", parent_id: "home-living" },
];

export const getMainCategories = (categories = []) => {
  const pool = categories && categories.length ? categories : catalogCategories;
  const mains = pool.filter((c) => !c.parentId && !c.parent_id && c.active !== false);
  return mains.length ? mains : mainCategories;
};

export const getSubcategories = (categories = [], parentId = null) => {
  const pool = categories && categories.length ? categories : catalogCategories;
  if (!parentId || parentId === "Semua") {
    return pool.filter((c) => (c.parentId || c.parent_id) && c.active !== false);
  }
  return pool.filter((c) => (c.parentId || c.parent_id) === parentId && c.active !== false);
};

export const categoryLabel = (id, categories = catalogCategories) => {
  if (!id || id === "Semua koleksi" || id === "Semua") return "Semua koleksi";
  const found = categories.find((item) => item.id === id || item.name === id);
  return found?.label || found?.name || id;
};

export const mainCategoryLabel = (id, categories = catalogCategories) => {
  if (!id || id === "Semua") return "Semua Departemen";
  const mains = getMainCategories(categories);
  const found = mains.find((item) => item.id === id || item.name === id);
  return found?.label || found?.name || id;
};
