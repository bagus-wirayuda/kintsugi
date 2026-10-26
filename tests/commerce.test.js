import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateTotals,
  aggregateItems,
  orderSchema,
  transitions,
} from "../server/commerce.js";
test("voucher 10% dibatasi 100 ribu dan ongkir gratis mulai 699 ribu", () => {
  assert.deepEqual(
    calculateTotals([{ price: 1000000, quantity: 2 }], "LINY10", "express"),
    { subtotal: 2000000, discount: 100000, delivery: 0, total: 1900000 },
  );
  assert.equal(
    calculateTotals([{ price: 699000, quantity: 1 }], "", "regular").delivery,
    0,
  );
  assert.equal(
    calculateTotals([{ price: 698000, quantity: 1 }], "", "regular").delivery,
    15000,
  );
});
test("ongkir ekspres dan pickup dihitung konsisten", () => {
  assert.equal(
    calculateTotals([{ price: 149000, quantity: 1 }], "", "express").total,
    184000,
  );
  assert.equal(
    calculateTotals([{ price: 149000, quantity: 1 }], "LINY10", "pickup").total,
    134100,
  );
});
test("duplikat varian digabung sebelum penguncian stok", () => {
  assert.deepEqual(
    aggregateItems([
      { id: "a", size: "M", color: "#fff", quantity: 2 },
      { id: "a", size: "M", color: "#fff", quantity: 3 },
    ]),
    [{ id: "a", size: "M", color: "#fff", quantity: 5 }],
  );
  assert.throws(() =>
    aggregateItems([
      { id: "a", size: "M", color: "#fff", quantity: 90 },
      { id: "a", size: "M", color: "#fff", quantity: 20 },
    ]),
  );
});
const valid = {
  items: [{ id: "a", size: "M", color: "#fff", quantity: 1 }],
  address: {
    name: "Dummy User",
    email: "dummy@example.test",
    phone: "081234567890",
    street: "Jalan Contoh No. 10",
    city: "Jakarta",
    postal: "12345",
  },
  shipping: "regular",
  payment: "cod",
  coupon: "",
};
test("validasi menolak jumlah negatif, pecahan, kupon palsu, dan data alamat salah", () => {
  assert.equal(orderSchema.safeParse(valid).success, true);
  for (const bad of [
    { ...valid, items: [{ ...valid.items[0], quantity: -1 }] },
    { ...valid, items: [{ ...valid.items[0], quantity: 1.5 }] },
    { ...valid, coupon: "FREE" },
    { ...valid, address: { ...valid.address, postal: "abc" } },
    { ...valid, items: [] },
  ])
    assert.equal(orderSchema.safeParse(bad).success, false);
});
test("harga dari browser dihapus oleh schema", () => {
  const parsed = orderSchema.parse({
    ...valid,
    total: 1,
    items: [{ ...valid.items[0], price: 1 }],
  });
  assert.equal(parsed.total, undefined);
  assert.equal(parsed.items[0].price, undefined);
});
test("pesanan terminal tidak dapat diproses ulang atau dibatalkan dua kali", () => {
  assert.deepEqual(transitions["Dibatalkan"], []);
  assert.deepEqual(transitions["Selesai"], []);
  assert.equal(transitions["Dikirim"].includes("Dibatalkan"), false);
});
