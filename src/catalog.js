export const mainCategories = [
  { id: "bedding", label: "Bedding", name: "Bedding" },
  { id: "fashion", label: "Fashion", name: "Fashion" },
];

export const catalogCategories = [
  // 2 Kategori Utama
  { id: "bedding", label: "Bedding", name: "Bedding", parentId: null, parent_id: null },
  { id: "fashion", label: "Fashion", name: "Fashion", parentId: null, parent_id: null },

  // Sub-kategori Bedding
  { id: "bedding-set", label: "Set Sprei & Bedcover", name: "Set Sprei & Bedcover", parentId: "bedding", parent_id: "bedding" },
  { id: "bedding-fitted", label: "Sprei Fitted & Karet", name: "Sprei Fitted & Karet", parentId: "bedding", parent_id: "bedding" },
  { id: "bedding-hotel", label: "Sprei Hotel & Dobby Stripe", name: "Sprei Hotel & Dobby Stripe", parentId: "bedding", parent_id: "bedding" },
  { id: "bedding-motif", label: "Sprei Motif & Aesthetic", name: "Sprei Motif & Aesthetic", parentId: "bedding", parent_id: "bedding" },
  { id: "bedding-bantal", label: "Sarung Bantal & Guling", name: "Sarung Bantal & Guling", parentId: "bedding", parent_id: "bedding" },
  { id: "bedding-protector", label: "Pelindung Kasur & Topper", name: "Pelindung Kasur & Topper", parentId: "bedding", parent_id: "bedding" },
  { id: "bedding-selimut", label: "Selimut & Quilt", name: "Selimut & Quilt", parentId: "bedding", parent_id: "bedding" },

  // Sub-kategori Fashion
  { id: "fashion-kaos", label: "Kaos & T-Shirt", name: "Kaos & T-Shirt", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-kemeja", label: "Kemeja Kasual & Formal", name: "Kemeja Kasual & Formal", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-celana", label: "Celana & Bawahan", name: "Celana & Bawahan", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-dress", label: "Dress & Tunik", name: "Dress & Tunik", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-outerwear", label: "Jaket & Outerwear", name: "Jaket & Outerwear", parentId: "fashion", parent_id: "fashion" },
  { id: "fashion-loungewear", label: "Piyama & Loungewear", name: "Piyama & Loungewear", parentId: "fashion", parent_id: "fashion" },
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

  // Kompatibilitas alias bila link lama memakai "seprai"
  const normalizedParentId = parentId === "seprai" ? "bedding" : parentId;

  // Cari kategori induk berdasarkan ID, nama, atau label
  const parent = pool.find(
    (c) =>
      (!c.parentId && !c.parent_id) &&
      (c.id === normalizedParentId ||
        c.id === parentId ||
        c.name?.toLowerCase() === String(normalizedParentId).toLowerCase() ||
        c.label?.toLowerCase() === String(normalizedParentId).toLowerCase())
  );

  const validParentKeys = new Set();
  validParentKeys.add(String(normalizedParentId).toLowerCase());
  validParentKeys.add(String(parentId).toLowerCase());
  if (parent) {
    if (parent.id) validParentKeys.add(String(parent.id).toLowerCase());
    if (parent.name) validParentKeys.add(String(parent.name).toLowerCase());
    if (parent.label) validParentKeys.add(String(parent.label).toLowerCase());
  }

  return pool.filter((c) => {
    const pId = c.parentId || c.parent_id;
    if (!pId) return false;
    if (c.active === false) return false;
    return validParentKeys.has(String(pId).toLowerCase());
  });
};

export const categoryLabel = (id, categories = catalogCategories) => {
  if (!id || id === "Semua koleksi" || id === "Semua") return "Semua koleksi";
  const found = categories.find(
    (item) =>
      item.id === id ||
      item.name?.toLowerCase() === String(id).toLowerCase() ||
      item.label?.toLowerCase() === String(id).toLowerCase()
  );
  return found?.label || found?.name || id;
};

export const mainCategoryLabel = (id, categories = catalogCategories) => {
  if (!id || id === "Semua") return "Semua Departemen";
  const normalizedId = id === "seprai" ? "bedding" : id;
  const mains = getMainCategories(categories);
  const found = mains.find(
    (item) =>
      item.id === normalizedId ||
      item.id === id ||
      item.name?.toLowerCase() === String(normalizedId).toLowerCase() ||
      item.label?.toLowerCase() === String(normalizedId).toLowerCase()
  );
  return found?.label || found?.name || id;
};
