import React, { useEffect, useState } from "react";
import { ShieldCheck, Plus, ArrowRight } from "lucide-react";
import { api, DEMO } from "./store";
import { money, categories } from "./data";

export default function Admin({ user, products, notify, onProducts }) {
  const [rows, setRows] = useState([]),
    [allProducts, setAllProducts] = useState(products),
    [tab, setTab] = useState("products"),
    [edit, setEdit] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const [p, o] = await Promise.all([
      api("/admin/products"),
      api("/admin/orders"),
    ]);
    setAllProducts(p);
    setRows(o);
    onProducts(p.filter((p) => p.active));
  }
  useEffect(() => {
    if (!DEMO && user?.role === "admin")
      refresh()
        .catch((e) => notify(e.message))
        .finally(() => setLoading(false));
  }, [user]);
  if (DEMO || user?.role !== "admin")
    return (
      <main className="page empty">
        <ShieldCheck size={42} />
        <h1>Panel admin</h1>
        <p>
          Panel admin memerlukan mode API PostgreSQL dan akun admin yang dibuat
          saat inisialisasi database.
        </p>
        <p className="muted">
          Lihat README untuk menjalankan backend dan database.
        </p>
      </main>
    );
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const body = edit.id
        ? { name: f.name, price: Number(f.price), stock: Number(f.stock) }
        : {
            name: f.name,
            price: Number(f.price),
            stock: Number(f.stock),
            sku: f.sku,
            category: f.category,
            gender: f.gender,
            image: f.image,
            description: f.description,
            sizes: f.sizes
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            colors: f.colors
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          };
      await api("/admin/products" + (edit.id ? "/" + edit.id : ""), {
        method: edit.id ? "PATCH" : "POST",
        body,
      });
      await refresh();
      setEdit(null);
      notify("Produk berhasil disimpan");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(p) {
    setBusy(true);
    try {
      await api("/admin/products/" + p.id, {
        method: "PATCH",
        body: { active: !p.active },
      });
      await refresh();
      notify(
        p.active
          ? "Produk diarsipkan. Dapat diaktifkan kembali."
          : "Produk diaktifkan kembali.",
      );
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page admin">
      <span className="eyebrow">LINY JAYA / ADMIN</span>
      <div className="catalog-title">
        <h1>Kelola toko</h1>
        <button
          className="btn black"
          onClick={() => {
            setTab("products");
            setEdit({ name: "", price: 149000, stock: 30 });
          }}
        >
          <Plus size={16} /> Tambah produk
        </button>
      </div>
      <div className="admin-stats">
        <div>
          <span>Produk aktif</span>
          <b>{allProducts.filter((p) => p.active).length}</b>
        </div>
        <div>
          <span>Pesanan</span>
          <b>{rows.length}</b>
        </div>
        <div>
          <span>Total pesanan aktif</span>
          <b>
            {money(
              rows
                .filter((o) => o.status !== "Dibatalkan")
                .reduce((s, o) => s + o.total, 0),
            )}
          </b>
        </div>
      </div>
      <div className="auth-tabs">
        <button
          className={tab === "products" ? "active" : ""}
          onClick={() => setTab("products")}
        >
          Produk & stok
        </button>
        <button
          className={tab === "orders" ? "active" : ""}
          onClick={() => setTab("orders")}
        >
          Pesanan
        </button>
        <button onClick={() => refresh().catch((e) => notify(e.message))}>
          Muat ulang
        </button>
      </div>
      {edit && (
        <form key={edit.id || "new"} className="admin-edit" onSubmit={save}>
          <label>
            Nama produk
            <input
              name="name"
              defaultValue={edit.name}
              required
              minLength={2}
            />
          </label>
          <label>
            Harga (IDR)
            <input
              name="price"
              type="number"
              min="1000"
              max="10000000"
              defaultValue={edit.price}
              required
            />
          </label>
          <label>
            Stok per varian
            <input
              name="stock"
              type="number"
              min="0"
              max="100000"
              defaultValue={edit.stock}
              required
            />
          </label>
          {!edit.id && (
            <>
              <label>
                SKU
                <input
                  name="sku"
                  required
                  pattern="[A-Za-z0-9-]+"
                  placeholder="LJ-NEW-001"
                />
              </label>
              <label>
                Departemen
                <select name="gender">
                  {["Wanita", "Pria", "Anak", "Bayi"].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label>
                Kategori
                <select name="category">
                  {categories
                    .filter((c) => c !== "Semua")
                    .map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                </select>
              </label>
              <label>
                Gambar (path lokal / HTTPS)
                <input
                  name="image"
                  defaultValue="/images/tshirt.jpg"
                  required
                />
              </label>
              <label>
                Ukuran (pisahkan koma)
                <input name="sizes" defaultValue="S,M,L,XL" required />
              </label>
              <label>
                Warna HEX (pisahkan koma)
                <input name="colors" defaultValue="#fff,#333" required />
              </label>
              <label className="wide">
                Deskripsi
                <textarea
                  name="description"
                  minLength={10}
                  required
                  defaultValue="Pakaian esensial yang nyaman untuk setiap hari."
                />
              </label>
            </>
          )}
          <button className="btn black" disabled={busy}>
            Simpan produk <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => setEdit(null)}
          >
            Batal
          </button>
        </form>
      )}
      <div className="table-scroll">
        {loading ? (
          <p>Memuat data toko…</p>
        ) : tab === "products" ? (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produk</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Stok / varian</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {allProducts.map((p) => (
                <tr key={p.id}>
                  <td>{p.sku}</td>
                  <td>
                    {p.name}
                    <small>{p.gender}</small>
                  </td>
                  <td>{p.category}</td>
                  <td>{money(p.price)}</td>
                  <td>{p.stock}</td>
                  <td>{p.active ? "Aktif" : "Arsip"}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="text-link" onClick={() => setEdit(p)}>
                        Edit
                      </button>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => toggle(p)}
                      >
                        {p.active ? "Arsipkan" : "Aktifkan"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Pesanan</th>
                <th>Penerima & pengiriman</th>
                <th>Item</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.id}
                    <small>
                      {new Date(o.createdAt).toLocaleDateString("id-ID")}
                    </small>
                  </td>
                  <td>
                    {o.address.name}
                    <small>
                      {o.address.street}, {o.address.city}, {o.address.postal}
                    </small>
                    <small>
                      {o.address.phone} · {o.shipping}
                    </small>
                  </td>
                  <td>
                    {o.items.map((i, n) => (
                      <small key={n}>
                        {i.name} · {i.size} × {i.quantity}
                      </small>
                    ))}
                  </td>
                  <td>{money(o.total)}</td>
                  <td>
                    <select
                      aria-label={`Status ${o.id}`}
                      value={o.status}
                      onChange={async (e) => {
                        try {
                          await api("/admin/orders/" + o.id, {
                            method: "PATCH",
                            body: { status: e.target.value },
                          });
                          await refresh();
                          notify("Status diperbarui");
                        } catch (e) {
                          notify(e.message);
                        }
                      }}
                    >
                      {[
                        "Menunggu pembayaran",
                        "Diproses",
                        "Dikirim",
                        "Selesai",
                        "Dibatalkan",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <p>Belum ada pesanan masuk.</p>
          </div>
        )}
      </div>
    </main>
  );
}
