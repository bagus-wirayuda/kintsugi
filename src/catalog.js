export const catalogCategories = [
  { id: "Sprei Fitted", label: "Sprei Fitted" },
  { id: "Set Sprei", label: "Set Sprei Spring Bed" },
  { id: "Sprei Karet", label: "Sprei Karet" },
  { id: "Sprei Hotel", label: "Sprei Hotel" },
  { id: "Sarung Bantal & Guling", label: "Sarung Bantal & Guling" },
  { id: "Sprei Motif", label: "Sprei Motif" },
  { id: "Pelindung Kasur", label: "Pelindung Kasur" },
];

export const categoryLabel = (id) =>
  id === "Semua koleksi" || id === "Semua"
    ? "Semua koleksi"
    : catalogCategories.find((item) => item.id === id)?.label || id;
