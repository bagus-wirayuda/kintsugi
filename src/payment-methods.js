// Invoice channel codes shared by checkout and server validation.
export const paymentMethods = [
  { id: 'QRIS', name: 'QRIS', group: 'QR & dompet digital', detail: 'Scan dengan mobile banking atau dompet digital' },
  ...['DANA', 'OVO', 'SHOPEEPAY', 'LINKAJA'].map((id) => ({ id, name: { SHOPEEPAY: 'ShopeePay', LINKAJA: 'LinkAja' }[id] || id, group: 'QR & dompet digital', detail: 'Bayar melalui aplikasi Anda' })),
  ...['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'BSI'].map((id) => ({ id, name: { MANDIRI: 'Mandiri', PERMATA: 'Permata' }[id] || id, group: 'Transfer bank', detail: 'Virtual account · verifikasi otomatis' })),
  { id: 'CREDIT_CARD', name: 'Kartu kredit / debit', group: 'Kartu', detail: 'Visa, Mastercard, dan kartu yang didukung' },
];
export const paymentName = (id) => paymentMethods.find((method) => method.id === id)?.name || 'Pembayaran online';
