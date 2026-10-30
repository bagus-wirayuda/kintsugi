export const departments = [
  { id: "Wanita", label: "Dewasa" },
  { id: "Pria", label: "Hotel & Guest" },
  { id: "Anak", label: "Anak" },
  { id: "Bayi", label: "Bayi" },
];

export const catalogCategories = [
  { id: "T-Shirt", label: "Sprei Fitted" },
  { id: "Kemeja & Blus", label: "Set Sprei Spring Bed" },
  { id: "Celana", label: "Sprei Karet" },
  { id: "Luaran", label: "Sprei Hotel" },
  { id: "Sweater & Cardigan", label: "Sarung Bantal & Guling" },
  { id: "Rok & Gaun", label: "Sprei Anak" },
  { id: "Aksesoris", label: "Pelindung Kasur" },
];

export const departmentLabel = (id) =>
  departments.find((item) => item.id === id)?.label || id;

export const categoryLabel = (id) =>
  id === "Semua koleksi" || id === "Semua"
    ? "Semua koleksi"
    : catalogCategories.find((item) => item.id === id)?.label || id;
