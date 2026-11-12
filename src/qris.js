/**
 * Modul EMVCo / QRIS TLV Parser, Validator, CRC16-CCITT & Converter Dinamis.
 * Reusable untuk DANA maupun metode QRIS statis manual lainnya.
 */

export const SAMPLE_DANA_QRIS_PAYLOAD =
  "00020101021126570011ID.DANA.WWW011893600915315697612002091569761200303UMI51440014ID.CO.QRIS.WWW0215ID10210807457190303UMI5204549953033605802ID5914BAGUS WIRAYUDA6011Kab. Kolaka6105935186304722D";

export const SAMPLE_DANA_QRIS_META = {
  id: "QRIS_DANA_MANUAL",
  name: "QRIS (DANA - BAGUS WIRAYUDA)",
  merchantName: "BAGUS WIRAYUDA",
  provider: "DANA",
};

const PROVIDER_PATTERNS = [
  { match: /DANA/i, name: "DANA" },
  { match: /GOPAY|GOJEK/i, name: "GoPay" },
  { match: /OVO/i, name: "OVO" },
  { match: /SHOPEE|SPAY/i, name: "ShopeePay" },
  { match: /LINKAJA/i, name: "LinkAja" },
  { match: /BCA/i, name: "BCA QRIS" },
  { match: /BRI/i, name: "BRI QRIS" },
  { match: /MANDIRI/i, name: "Mandiri QRIS" },
  { match: /BNI/i, name: "BNI QRIS" },
  { match: /NOBU/i, name: "Nobu QRIS" },
];

const textEncoder = new TextEncoder();

export function normalizeQrisPayload(raw) {
  return String(raw || "").trim().replace(/[\r\n]+/g, "");
}

/**
 * Hitung CRC16-CCITT (polinomial 0x1021, nilai awal 0xFFFF) sesuai spesifikasi EMVCo.
 */
export function computeCrc16Ccitt(input) {
  const bytes = textEncoder.encode(String(input || ""));
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Parse string TLV EMVCo secara ketat berdasarkan Tag (2 char), Length (2 digit), Value.
 */
export function parseTlv(payload, { strict = true, requireCrcLast = false } = {}) {
  const str = normalizeQrisPayload(payload);
  if (!str) {
    throw new Error("Payload QRIS kosong.");
  }

  const entries = [];
  let offset = 0;

  while (offset < str.length) {
    if (offset + 4 > str.length) {
      throw new Error(`Header TLV tidak lengkap pada indeks ${offset}.`);
    }

    const tag = str.slice(offset, offset + 2);
    const lenStr = str.slice(offset + 2, offset + 4);

    if (!/^\d{2}$/.test(tag)) {
      throw new Error(`Tag TLV tidak valid ("${tag}") pada indeks ${offset}.`);
    }
    if (!/^\d{2}$/.test(lenStr)) {
      throw new Error(`Panjang TLV tidak valid ("${lenStr}") untuk tag ${tag}.`);
    }

    const length = Number(lenStr);
    const valueStart = offset + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > str.length) {
      throw new Error(
        `Nilai tag ${tag} terpotong: butuh ${length} karakter, tersisa ${str.length - valueStart}.`,
      );
    }

    const value = str.slice(valueStart, valueEnd);
    entries.push({ tag, length, value, offset });
    offset = valueEnd;

    if (strict && tag === "63") {
      if (length !== 4) {
        throw new Error(`Tag 63 (CRC) harus memiliki panjang 4, ditemukan ${length}.`);
      }
      if (requireCrcLast && offset !== str.length) {
        throw new Error("Tag 63 (CRC) harus berada di bagian paling akhir payload QRIS.");
      }
    }
  }

  return entries;
}

/**
 * Susun ulang array entri TLV dan hitung ulang tag 63 (CRC16-CCITT).
 */
export function serializeTlv(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Daftar entri TLV tidak boleh kosong.");
  }

  const parts = [];
  for (const entry of entries) {
    if (!entry || entry.tag === "63") continue;
    const tag = String(entry.tag || "");
    const value = String(entry.value ?? "");
    if (!/^\d{2}$/.test(tag)) {
      throw new Error(`Tag TLV tidak valid: ${tag}`);
    }
    if (value.length > 99) {
      throw new Error(`Nilai tag ${tag} melebihi batas maksimum 99 karakter.`);
    }
    parts.push(`${tag}${String(value.length).padStart(2, "0")}${value}`);
  }

  const bodyWithoutCrc = `${parts.join("")}6304`;
  const crc = computeCrc16Ccitt(bodyWithoutCrc);
  return `${bodyWithoutCrc}${crc}`;
}

function inferProviderFromDomains(domains = []) {
  for (const domain of domains) {
    for (const pattern of PROVIDER_PATTERNS) {
      if (pattern.match.test(domain)) {
        return pattern.name;
      }
    }
  }
  const primary = domains.find((d) => !/^ID\.CO\.QRIS\.WWW$/i.test(d));
  return primary || "";
}

/**
 * Parse payload QRIS menjadi struktur lengkap termasuk Merchant Account Info (tag 26-51) dan CRC.
 */
export function parseQris(payload) {
  const normalized = normalizeQrisPayload(payload);
  const tags = parseTlv(normalized, { strict: true, requireCrcLast: true });
  const tagMap = new Map(tags.map((item) => [item.tag, item.value]));

  const crcTag = tags.find((item) => item.tag === "63");
  const crcPrefixIndex = normalized.lastIndexOf("6304");
  const expectedCrc =
    crcTag && crcPrefixIndex >= 0
      ? computeCrc16Ccitt(normalized.slice(0, crcPrefixIndex + 4))
      : null;
  const actualCrc = crcTag ? crcTag.value.toUpperCase() : null;
  const crcValid = Boolean(crcTag && expectedCrc && actualCrc === expectedCrc);

  const maiTags = [];
  const acquirerDomains = [];
  let merchantPan = "";
  let merchantId = "";
  let nmid = "";
  let merchantCriteria = "";

  for (const entry of tags) {
    const tagNum = Number(entry.tag);
    if (tagNum >= 26 && tagNum <= 51) {
      let subTags = [];
      try {
        subTags = parseTlv(entry.value, { strict: false });
      } catch {
        subTags = [];
      }
      const subMap = new Map(subTags.map((s) => [s.tag, s.value]));
      const domain = subMap.get("00") || "";
      if (domain) acquirerDomains.push(domain);
      if (tagNum === 51) {
        nmid = subMap.get("02") || nmid;
        merchantCriteria = subMap.get("03") || merchantCriteria;
      } else {
        merchantPan = merchantPan || subMap.get("01") || "";
        merchantId = merchantId || subMap.get("02") || "";
        merchantCriteria = merchantCriteria || subMap.get("03") || "";
      }
      maiTags.push({
        tag: entry.tag,
        domain,
        subTags,
      });
    }
  }

  let additionalData = [];
  const tag62 = tagMap.get("62");
  if (tag62) {
    try {
      additionalData = parseTlv(tag62, { strict: false });
    } catch {
      additionalData = [];
    }
  }

  const pointOfInitiation = tagMap.get("01") || "";
  const provider = inferProviderFromDomains(acquirerDomains);

  return {
    normalized,
    tags,
    tagMap,
    maiTags,
    additionalData,
    formatIndicator: tagMap.get("00") || "",
    pointOfInitiation,
    isStatic: pointOfInitiation === "11",
    isDynamic: pointOfInitiation === "12",
    amount: tagMap.get("54") || null,
    currency: tagMap.get("53") || "",
    countryCode: tagMap.get("58") || "",
    mcc: tagMap.get("52") || "",
    merchantName: tagMap.get("59") || "",
    merchantCity: tagMap.get("60") || "",
    postalCode: tagMap.get("61") || "",
    provider,
    acquirerDomains,
    merchantPan,
    merchantId,
    nmid,
    merchantCriteria,
    actualCrc,
    expectedCrc,
    crcValid,
  };
}

/**
 * Validasi struktur EMVCo, tag wajib QRIS Indonesia, dan checksum CRC16.
 */
export function validateQrisPayload(payload) {
  const errors = [];
  let parsed = null;

  try {
    parsed = parseQris(payload);
  } catch (err) {
    return {
      valid: false,
      errors: [err.message || "Format TLV QRIS tidak valid."],
      parsed: null,
    };
  }

  if (parsed.formatIndicator !== "01") {
    errors.push(`Tag 00 (Payload Format Indicator) harus bernilai "01".`);
  }
  if (!["11", "12"].includes(parsed.pointOfInitiation)) {
    errors.push(`Tag 01 (Point of Initiation) harus bernilai "11" (statis) atau "12" (dinamis).`);
  }
  if (parsed.maiTags.length === 0) {
    errors.push("Merchant Account Information (tag 26–51) tidak ditemukan.");
  }
  if (!parsed.currency) {
    errors.push("Tag 53 (Transaction Currency) tidak ditemukan.");
  } else if (parsed.currency !== "360") {
    errors.push(`Mata uang QRIS (${parsed.currency}) bukan Rupiah ("360").`);
  }
  if (parsed.countryCode !== "ID") {
    errors.push(`Tag 58 (Country Code) harus "ID".`);
  }
  if (!parsed.merchantName) {
    errors.push("Tag 59 (Nama Merchant) tidak ditemukan.");
  }
  if (!parsed.merchantCity) {
    errors.push("Tag 60 (Kota Merchant) tidak ditemukan.");
  }
  if (!parsed.crcValid) {
    errors.push(
      `Checksum CRC16 (tag 63) tidak cocok: ditemukan ${parsed.actualCrc || "-"}, seharusnya ${parsed.expectedCrc || "-"}.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed,
  };
}

/**
 * Evaluasi kompatibilitas konversi QRIS statis ke dinamis (termasuk karakteristik DANA / UMI).
 * Catatan penting: validitas teknis EMVCo/CRC tidak otomatis menjamin penerimaan oleh seluruh app/acquirer.
 */
export function assessQrisCompatibility(input) {
  const parsed = typeof input === "string" ? parseQris(input) : input;
  if (!parsed) {
    return {
      level: "invalid",
      technicalReady: false,
      requiresFallback: true,
      requiresLiveVerification: true,
      summary: "Payload QRIS belum terbaca.",
      notes: [],
    };
  }

  const isDana =
    /DANA/i.test(parsed.provider || "") ||
    parsed.acquirerDomains.some((d) => /DANA/i.test(d));
  const isUmi = parsed.merchantCriteria === "UMI";

  const notes = [
    "Konversi menambahkan tag 54 (nominal) dan memperbarui tag 01 (11 → 12) serta CRC16 tag 63 sesuai standar EMVCo.",
    "Valid secara teknis (TLV + CRC16 valid) belum tentu otomatis diterima oleh semua aplikasi e-wallet/bank pada transaksi nyata tanpa integrasi QRIS dinamis resmi/BI SNAP.",
  ];

  if (isDana) {
    notes.push(
      "Terdeteksi acquirer DANA (ID.DANA.WWW). Sebagian aplikasi e-wallet/bank dapat menerima nominal otomatis tag 54, namun DANA atau issuer tertentu berpotensi menolak QR dinamis yang belum terdaftar di server DANA.",
    );
  }
  if (isUmi) {
    notes.push(
      "Kriteria merchant UMI (Usaha Mikro) umumnya diterbitkan sebagai QRIS statis. Selalu uji scan transaksi nominal kecil dan siapkan Fallback QRIS Statis.",
    );
  }
  notes.push(
    "Pembayaran tetap berstatus Menunggu Verifikasi hingga Admin memeriksa mutasi akun DANA secara manual sebelum mengubah status menjadi Lunas.",
  );

  return {
    level: "caution",
    technicalReady: Boolean(parsed.crcValid),
    isDana,
    isUmi,
    requiresFallback: true,
    requiresLiveVerification: true,
    summary: isDana
      ? "Kompatibel secara teknis EMVCo (CRC16 valid). Disarankan tetap mengaktifkan opsi Fallback QRIS Statis untuk kompatibilitas aplikasi DANA/issuer."
      : "Kompatibel secara teknis EMVCo (CRC16 valid). Uji transaksi nyata dengan penyedia QRIS terkait sebelum production penuh.",
    notes,
  };
}

/**
 * Konversi payload QRIS statis menjadi QRIS dinamis dengan nominal tervalidasi server.
 * Mempertahankan seluruh informasi merchant, hanya mengubah tag 01 (jika 11 → 12),
 * menyisipkan/memperbarui tag 54, dan menghitung ulang CRC16-CCITT pada tag 63.
 */
export function convertStaticQrisToDynamic(payload, amount) {
  const numericAmount = Number(amount);
  if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
    throw new Error("Nominal QRIS dinamis harus berupa bilangan bulat positif lebih dari 0.");
  }

  const validation = validateQrisPayload(payload);
  if (!validation.valid || !validation.parsed) {
    throw new Error(`QRIS statis tidak valid: ${validation.errors.join(" ")}`);
  }

  const originalParsed = validation.parsed;
  const amountStr = String(numericAmount);
  const updatedEntries = [];
  let updatedTag01 = false;
  let insertedTag54 = false;

  for (const entry of originalParsed.tags) {
    if (entry.tag === "63") {
      continue;
    }

    if (entry.tag === "01") {
      updatedEntries.push({ tag: "01", value: "12" });
      updatedTag01 = true;
      continue;
    }

    if (entry.tag === "54") {
      updatedEntries.push({ tag: "54", value: amountStr });
      insertedTag54 = true;
      continue;
    }

    if (entry.tag === "58" && !insertedTag54) {
      updatedEntries.push({ tag: "54", value: amountStr });
      insertedTag54 = true;
    }

    updatedEntries.push({ tag: entry.tag, value: entry.value });

    if (entry.tag === "53" && !insertedTag54) {
      updatedEntries.push({ tag: "54", value: amountStr });
      insertedTag54 = true;
    }
  }

  if (!updatedTag01) {
    const tag00Index = updatedEntries.findIndex((item) => item.tag === "00");
    updatedEntries.splice(tag00Index + 1, 0, { tag: "01", value: "12" });
  }

  if (!insertedTag54) {
    updatedEntries.push({ tag: "54", value: amountStr });
  }

  const dynamicPayload = serializeTlv(updatedEntries);
  const recheck = validateQrisPayload(dynamicPayload);
  if (!recheck.valid || !recheck.parsed) {
    throw new Error(`Hasil konversi QRIS gagal validasi ulang: ${recheck.errors.join(" ")}`);
  }
  if (recheck.parsed.amount !== amountStr) {
    throw new Error("Verifikasi ulang nominal QRIS gagal mencocokkan tag 54.");
  }

  return {
    payload: dynamicPayload,
    staticPayload: originalParsed.normalized,
    amount: numericAmount,
    parsed: recheck.parsed,
    compatibility: assessQrisCompatibility(recheck.parsed),
  };
}
