import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatRupiah, money } from "./rupiah.js";

/**
 * Format tanggal Indonesia lengkap: "13 November 2026, 20:30 WIB"
 */
export function formatReportDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d) + " WIB";
}

export function formatShortDate(date) {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Gambar Kop Surat & Header Resmi PT Liny Jaya
 */
function drawReportHeader(doc, title, subtitle, periodLabel, generatedBy, storeInfo = {}) {
  const storeName = storeInfo.name || "PT LINY JAYA";
  const storeEmail = storeInfo.email || "info@linyjaya.com";
  const storePhone = storeInfo.phone || "+62 811-1111-1111";
  const storeAddress = storeInfo.address || "Makassar, Sulawesi Selatan, Indonesia";

  // Brand Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(storeName, 14, 16);

  // Brand Tagline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`${storeAddress} | Telp: ${storePhone} | Email: ${storeEmail}`, 14, 21);

  // Line Divider
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.6);
  doc.line(14, 25, 196, 25);

  // Title Document
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(title.toUpperCase(), 14, 33);

  // Subtitle & Metadata
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Periode: ${periodLabel || "Semua Waktu"}   |   Kategori / Fokus: ${subtitle || "Umum"}`, 14, 38);
  doc.text(
    `Waktu Cetak: ${formatReportDate(new Date())}   |   Dicetak oleh: ${generatedBy?.name || "Administrator"} (${generatedBy?.role || "admin"})`,
    14,
    43
  );

  return 47; // y position after header
}

/**
 * Gambar Footer dan Halaman
 */
function attachFooterAndPagination(doc, generatedBy, storeInfo = {}) {
  const pageCount = doc.internal.getNumberOfPages();
  const userName = generatedBy?.name || "Administrator";

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.height || 297;

    // Tanda Tangan pada halaman terakhir
    if (i === pageCount) {
      const signY = Math.min(pageHeight - 40, doc.lastAutoTable ? doc.lastAutoTable.finalY + 14 : pageHeight - 40);
      if (signY < pageHeight - 35) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text("Makassar, " + formatShortDate(new Date()), 145, signY);
        doc.text("Penanggung Jawab Toko,", 145, signY + 5);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(userName, 145, signY + 22);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(storeInfo.name || "PT Liny Jaya", 145, signY + 26);
      }
    }

    // Garis Footer
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, pageHeight - 12, 196, pageHeight - 12);

    // Teks Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Dokumen resmi PT Liny Jaya • Sistem Manajemen Toko Terintegrasi`,
      14,
      pageHeight - 8
    );
    doc.text(`Halaman ${i} dari ${pageCount}`, 196, pageHeight - 8, { align: "right" });
  }
}

/**
 * 1. LAPORAN PENJUALAN & TRANSAKSI
 */
export function generateSalesReportPDF({
  orders = [],
  periodLabel = "Semua Waktu",
  statusFilter = "Semua",
  paymentFilter = "Semua",
  generatedBy = { name: "Administrator", role: "admin" },
  storeInfo = {},
  save = true,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const startY = drawReportHeader(
    doc,
    "Laporan Penjualan & Transaksi",
    `Status: ${statusFilter} • Pembayaran: ${paymentFilter}`,
    periodLabel,
    generatedBy,
    storeInfo
  );

  // Hitung KPI Penjualan
  const totalOrders = orders.length;
  const paidOrders = orders.filter((o) => o.payment_status === "PAID");
  const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const totalSubtotal = paidOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
  const totalDiscount = paidOrders.reduce((sum, o) => sum + (Number(o.discount) || 0), 0);
  const totalDelivery = paidOrders.reduce((sum, o) => sum + (Number(o.delivery) || 0), 0);
  const aov = paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0;

  // Kotak Ringkasan KPI
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(14, startY, 182, 24, 2, 2, "FD");

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL TRANSAKSI", 18, startY + 6);
  doc.text("TOTAL OMZET (LUNAS)", 58, startY + 6);
  doc.text("RATA-RATA ORDER (AOV)", 105, startY + 6);
  doc.text("TOTAL ONGKIR", 150, startY + 6);

  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${totalOrders} Pesanan`, 18, startY + 13);
  doc.setTextColor(22, 101, 52); // emerald-800
  doc.text(money(totalRevenue), 58, startY + 13);
  doc.setTextColor(15, 23, 42);
  doc.text(money(aov), 105, startY + 13);
  doc.text(money(totalDelivery), 150, startY + 13);

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`(Lunas: ${paidOrders.length} | Lainnya: ${totalOrders - paidOrders.length})`, 18, startY + 19);
  doc.text(`Subtotal Produk: ${money(totalSubtotal)} • Diskon: -${money(totalDiscount)}`, 58, startY + 19);

  // Tabel Pesanan
  const tableData = orders.map((o, idx) => {
    const itemsSummary = (o.items || [])
      .map((it) => `${it.name} (${it.size || ""}, ${it.color || ""}) ×${it.quantity}`)
      .join(", ") || "—";

    const customerName = o.address?.name || "Pelanggan";
    const paymentDesc = o.payment_type === "qris" ? `QRIS (${o.payment_status})` : (o.payment_method_name || o.payment || "—");

    return [
      String(idx + 1),
      o.id || "—",
      formatShortDate(o.created_at),
      customerName,
      itemsSummary,
      paymentDesc,
      o.status || "—",
      money(o.total || 0),
    ];
  });

  autoTable(doc, {
    startY: startY + 28,
    head: [["No", "ID Pesanan", "Tanggal", "Pelanggan", "Rincian Barang", "Pembayaran", "Status", "Total"]],
    body: tableData.length > 0 ? tableData : [["—", "Tidak ada data transaksi", "—", "—", "—", "—", "—", "Rp 0"]],
    theme: "striped",
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85],
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 26, fontStyle: "bold" },
      2: { cellWidth: 18 },
      3: { cellWidth: 24 },
      4: { cellWidth: 42 },
      5: { cellWidth: 22 },
      6: { cellWidth: 20 },
      7: { cellWidth: 22, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  attachFooterAndPagination(doc, generatedBy, storeInfo);

  const filename = `Laporan_Penjualan_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (save && typeof doc.save === "function") {
    doc.save(filename);
  }
  return doc;
}

/**
 * 2. LAPORAN KEUANGAN & LABA RUGI
 */
export function generateFinancialReportPDF({
  metrics = {},
  orders = [],
  expenses = [],
  periodLabel = "Semua Waktu",
  generatedBy = { name: "Administrator", role: "admin" },
  storeInfo = {},
  save = true,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const startY = drawReportHeader(
    doc,
    "Laporan Keuangan & Laba Rugi",
    "Ikhtisar Pendapatan, HPP & Pengeluaran Toko",
    periodLabel,
    generatedBy,
    storeInfo
  );

  const revenue = Number(metrics.revenue) || 0;
  const cogs = Number(metrics.capital) || 0;
  const operatingExpenses = Number(metrics.expenses) || 0;
  const grossProfit = revenue - cogs;
  const netIncome = grossProfit - operatingExpenses;
  const grossMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : 0;
  const netMargin = revenue > 0 ? ((netIncome / revenue) * 100).toFixed(1) : 0;

  // Kotak Laba Rugi Utama
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, 182, 38, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 116, 139);
  doc.text("PENDAPATAN BERSIH (OMZET LUNAS)", 18, startY + 6);
  doc.text("HARGA POKOK PENJUALAN (HPP)", 80, startY + 6);
  doc.text("LABA KOTOR (GROSS PROFIT)", 140, startY + 6);

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(money(revenue), 18, startY + 13);
  doc.setTextColor(185, 28, 28); // red-700
  doc.text(`-${money(cogs)}`, 80, startY + 13);
  doc.setTextColor(22, 101, 52); // emerald-800
  doc.text(money(grossProfit), 140, startY + 13);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Margin Kotor: ${grossMargin}%`, 140, startY + 18);

  // Baris kedua: Beban & Laba Bersih
  doc.setDrawColor(226, 232, 240);
  doc.line(18, startY + 21, 192, startY + 21);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 116, 139);
  doc.text("BEBAN OPERASIONAL TOKO", 18, startY + 27);
  doc.text("LABA BERSIH AKHIR (NET PROFIT)", 105, startY + 27);

  doc.setFontSize(11);
  doc.setTextColor(185, 28, 28);
  doc.text(`-${money(operatingExpenses)}`, 18, startY + 34);

  if (netIncome >= 0) {
    doc.setTextColor(22, 101, 52); // green
  } else {
    doc.setTextColor(185, 28, 28); // red
  }
  doc.text(money(netIncome), 105, startY + 34);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Net Margin: ${netMargin}%`, 160, startY + 34);

  // Tabel Pengeluaran Operasional
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Rincian Beban & Pengeluaran Toko", 14, startY + 45);

  const expenseTableData = (expenses.length > 0 ? expenses : metrics.expenseRows || []).map((exp, idx) => [
    String(idx + 1),
    formatShortDate(exp.date || exp.expense_date),
    exp.description || "—",
    money(exp.amount || 0),
  ]);

  autoTable(doc, {
    startY: startY + 48,
    head: [["No", "Tanggal", "Keterangan Pengeluaran", "Nominal"]],
    body: expenseTableData.length > 0 ? expenseTableData : [["—", "—", "Belum ada catatan pengeluaran operasional", "Rp 0"]],
    theme: "striped",
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85],
      cellPadding: 2.2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 30 },
      2: { cellWidth: 100 },
      3: { cellWidth: 42, halign: "right", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
  });

  attachFooterAndPagination(doc, generatedBy, storeInfo);

  const filename = `Laporan_Laba_Rugi_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (save && typeof doc.save === "function") {
    doc.save(filename);
  }
  return doc;
}

/**
 * 3. LAPORAN INVENTARIS STOK & VARIAN PRODUK
 */
export function generateInventoryReportPDF({
  products = [],
  categoryFilter = "Semua",
  stockFilter = "Semua",
  generatedBy = { name: "Administrator", role: "admin" },
  storeInfo = {},
  save = true,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const startY = drawReportHeader(
    doc,
    "Laporan Inventaris Stok & Varian Produk",
    `Kategori: ${categoryFilter} • Kondisi Stok: ${stockFilter}`,
    "Posisi Saat Ini",
    generatedBy,
    storeInfo
  );

  // Flatten varian untuk inventory
  const variantRows = [];
  let totalStockUnits = 0;
  let totalEstimatedCostValue = 0;
  let totalEstimatedRetailValue = 0;

  products.forEach((p) => {
    const variants = Array.isArray(p.variants) && p.variants.length > 0
      ? p.variants
      : [{ size: "Standar", color: "Standar", stock: p.stock || 0, price: p.price }];

    variants.forEach((v) => {
      const stock = Number(v.stock) || 0;
      const vPrice = v.price != null && Number(v.price) >= 1000 ? Number(v.price) : Number(p.price || 0);
      const cPrice = Number(p.costPrice || p.cost_price) || 0;
      const stockCostVal = stock * cPrice;
      const stockRetailVal = stock * vPrice;

      totalStockUnits += stock;
      totalEstimatedCostValue += stockCostVal;
      totalEstimatedRetailValue += stockRetailVal;

      variantRows.push({
        sku: p.sku || "—",
        name: p.name,
        category: p.category,
        size: v.size,
        color: v.color,
        stock,
        costPrice: cPrice,
        price: vPrice,
        retailValue: stockRetailVal,
      });
    });
  });

  // Kotak Ringkasan Inventaris
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, startY, 182, 22, 2, 2, "FD");

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL PRODUK & VARIAN", 18, startY + 6);
  doc.text("TOTAL FISIK STOK", 68, startY + 6);
  doc.text("ESTIMASI NILAI MODAL (HPP)", 110, startY + 6);
  doc.text("POTENSI NILAI JUAL", 155, startY + 6);

  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${products.length} Produk (${variantRows.length} Varian)`, 18, startY + 13);
  doc.text(`${totalStockUnits.toLocaleString("id-ID")} Unit`, 68, startY + 13);
  doc.setTextColor(71, 85, 105);
  doc.text(money(totalEstimatedCostValue), 110, startY + 13);
  doc.setTextColor(22, 101, 52);
  doc.text(money(totalEstimatedRetailValue), 155, startY + 13);

  const tableData = variantRows.map((row, idx) => [
    String(idx + 1),
    row.sku,
    row.name,
    `${row.size} - ${row.color}`,
    row.costPrice > 0 ? money(row.costPrice) : "—",
    money(row.price),
    String(row.stock),
    money(row.retailValue),
  ]);

  autoTable(doc, {
    startY: startY + 26,
    head: [["No", "SKU", "Nama Produk", "Varian (Ukuran & Warna)", "Harga Pokok", "Harga Jual", "Stok", "Total Nilai"]],
    body: tableData.length > 0 ? tableData : [["—", "—", "Tidak ada data inventaris produk", "—", "—", "—", "0", "Rp 0"]],
    theme: "striped",
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7.2,
      textColor: [51, 65, 85],
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 20 },
      2: { cellWidth: 45 },
      3: { cellWidth: 35 },
      4: { cellWidth: 20, halign: "right" },
      5: { cellWidth: 20, halign: "right", fontStyle: "bold" },
      6: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      7: { cellWidth: 20, halign: "right" },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  attachFooterAndPagination(doc, generatedBy, storeInfo);

  const filename = `Laporan_Inventaris_Stok_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (save && typeof doc.save === "function") {
    doc.save(filename);
  }
  return doc;
}
