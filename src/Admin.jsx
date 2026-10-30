import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Settings,
  Plus,
  Search,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";
import Workspace, { Empty, Notice, Status } from "./Workspace";
import { api } from "./store";
import { colorLabel, money } from "./data";
import { catalogCategories, departmentLabel, departments } from "./catalog";
import { paymentLabel } from "./Orders";

export default function Admin({ user, notify, onLogout }) {
  const tabs = ["overview", "products", "orders", "settings"];
  const readTab = () =>
    tabs.includes(location.hash.split("/")[1])
      ? location.hash.split("/")[1]
      : "overview";
  const [tab, setTab] = useState(readTab),
    [products, setProducts] = useState([]),
    [orders, setOrders] = useState([]),
    [health, setHealth] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [edit, setEdit] = useState(null),
    [selected, setSelected] = useState(null);
  async function refresh() {
    const [p, o, h] = await Promise.all([
      api("/admin/products"),
      api("/admin/orders"),
      api("/admin/status"),
    ]);
    setProducts(p);
    setOrders(o);
    setHealth(h);
    if (selected) setSelected(o.find((x) => x.id === selected.id) || null);
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const change = () => {
      setTab(readTab());
      setEdit(null);
      setSelected(null);
      setSearch("");
      setFilter("all");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [user.id]);
  function select(t) {
    setTab(t);
    setEdit(null);
    setSelected(null);
    setSearch("");
    setFilter("all");
    setError("");
    setMessage("");
    history.replaceState(null, "", "#admin/" + t);
  }
  async function perform(fn, msg) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
      if (msg) {
        setMessage(msg);
        notify(msg);
      }
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const body = {
      name: f.name,
      sku: f.sku,
      price: Number(f.price),
      oldPrice: Number(f.oldPrice),
      gender: f.gender,
      category: f.category,
      image: f.image,
      description: f.description,
      isNew: f.isNew === "on",
    };
    if (edit.id) {
      const changed = edit.variants
        .map((v, i) => ({
          size: v.size,
          color: v.color,
          stock: Number(f["stock_" + i]),
          oldStock: v.stock,
        }))
        .filter((v) => v.stock !== v.oldStock)
        .map(({ oldStock, ...v }) => v);
      if (changed.length) body.variants = changed;
    } else
      Object.assign(body, {
        stock: Number(f.stock),
        sizes: f.sizes
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        colors: f.colors
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
    if (
      await perform(
        () =>
          api("/admin/products" + (edit.id ? "/" + edit.id : ""), {
            method: edit.id ? "PATCH" : "POST",
            body,
          }),
        "Produk berhasil disimpan.",
      )
    )
      setEdit(null);
  }
  const pending = orders.filter(
    (o) => o.payment_status === "PENDING" || o.payment_status === "CREATING",
  );
  const items = [
    { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
    { id: "products", label: "Produk & stok", icon: Boxes },
    {
      id: "orders",
      label: "Pesanan",
      icon: Package,
      count: orders.filter((o) => o.status === "Diproses").length,
    },
    { id: "settings", label: "Status layanan", icon: Settings },
  ];
  const titles = {
    overview: "Ringkasan toko",
    products: edit
      ? edit.id
        ? "Edit produk"
        : "Tambah produk"
      : "Produk & stok",
    orders: selected ? "Detail pesanan" : "Kelola pesanan",
    settings: "Status layanan",
  };
  const productRows = products.filter(
    (p) =>
      (filter === "all" ||
        (filter === "active" && p.active) ||
        (filter === "archived" && !p.active)) &&
      [p.name, p.sku, p.gender]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const orderRows = orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      [o.id, o.address.name, o.address.email]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function orderTable(list) {
    return (
      <div className="ws-table-scroll">
        <table className="ws-table">
          <thead>
            <tr>
              <th>Pesanan</th>
              <th>Pelanggan</th>
              <th>Total</th>
              <th>Pembayaran</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id}>
                <td>
                  <b>#{o.id.slice(-8).toUpperCase()}</b>
                  <small>
                    {new Date(o.createdAt).toLocaleDateString("id-ID")}
                  </small>
                </td>
                <td>
                  {o.address.name}
                  <small>{o.address.email}</small>
                </td>
                <td className="ws-nowrap">{money(o.total)}</td>
                <td>
                  <Status
                    tone={
                      o.payment_status === "PAID"
                        ? "success"
                        : o.payment_status === "PENDING"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {paymentLabel[o.payment_status]}
                  </Status>
                </td>
                <td>{o.status}</td>
                <td>
                  <button
                    className="ws-link"
                    onClick={() => {
                      setTab("orders");
                      setSelected(o);
                    }}
                  >
                    Lihat
                    <ArrowRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <Workspace
      user={user}
      admin
      items={items}
      active={tab}
      onSelect={select}
      onLogout={onLogout}
      title={titles[tab]}
      subtitle={
        tab === "overview"
          ? "Pantau aktivitas dan pekerjaan yang perlu ditindaklanjuti."
          : tab === "products"
            ? "Kelola informasi produk dan ketersediaan setiap varian."
            : tab === "orders"
              ? "Periksa pembayaran, siapkan pesanan, dan kelola pengiriman."
              : "Periksa koneksi dan konfigurasi layanan toko."
      }
      actions={
        <div className="ws-actions">
          {!edit && !selected && (
            <button
              className="ws-button"
              disabled={busy}
              onClick={() => perform(refresh)}
            >
              <RefreshCw size={16} />
              Muat ulang
            </button>
          )}
          {tab === "products" && !edit && (
            <button
              className="ws-button primary"
              onClick={() =>
                setEdit({
                  name: "",
                  price: 149000,
                  oldPrice: 0,
                  stock: 30,
                  isNew: true,
                })
              }
            >
              <Plus size={17} />
              Tambah produk
            </button>
          )}
          {(edit || selected) && (
            <button
              className="ws-button"
              onClick={() => {
                setEdit(null);
                setSelected(null);
                setError("");
              }}
            >
              <ArrowLeft size={16} />
              Kembali
            </button>
          )}
        </div>
      }
    >
      <Notice>{error}</Notice>
      <Notice type="success">{message}</Notice>
      {loading ? (
        <div className="ws-loading" role="status">
          Memuat data toko…
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <div className="ws-admin-intro">
                <span className="ws-status success">
                  <span className="ws-live-dot" />
                  Panel operasional aktif
                </span>
                <p>
                  Selamat datang, {user.name}. Berikut kondisi toko Anda hari
                  ini.
                </p>
              </div>
              <div className="ws-stats admin-stats-grid">
                {[
                  {
                    label: "Pembayaran diterima",
                    value: money(
                      orders
                        .filter((o) => o.payment_status === "PAID")
                        .reduce((n, o) => n + o.total, 0),
                    ),
                    icon: CheckCircle2,
                  },
                  {
                    label: "Perlu disiapkan",
                    value: orders.filter((o) => o.status === "Diproses").length,
                    icon: Package,
                  },
                  {
                    label: "Produk aktif",
                    value: products.filter((p) => p.active).length,
                    icon: Boxes,
                  },
                  {
                    label: "Belum dibayar",
                    value: pending.length,
                    icon: AlertCircle,
                  },
                ].map((s) => (
                  <div key={s.label} className="ws-stat">
                    <span>
                      <s.icon size={21} />
                    </span>
                    <div>
                      <p>{s.label}</p>
                      <b>{s.value}</b>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ws-panel">
                <div className="ws-panel-heading horizontal">
                  <div>
                    <h2>Pesanan terbaru</h2>
                    <p>Riwayat transaksi yang masuk ke toko.</p>
                  </div>
                  <button className="ws-link" onClick={() => select("orders")}>
                    Semua pesanan
                    <ArrowRight size={15} />
                  </button>
                </div>
                {orders.length ? (
                  orderTable(orders.slice(0, 6))
                ) : (
                  <Empty icon={Package} title="Belum ada pesanan">
                    Pesanan pelanggan akan tampil di sini.
                  </Empty>
                )}
              </div>
              <div className="ws-admin-bottom">
                <section className="ws-panel">
                  <div className="ws-panel-heading">
                    <h2>Prioritas persediaan</h2>
                    <p>
                      Produk dengan setidaknya satu varian kurang dari 5 unit.
                    </p>
                  </div>
                  {products.filter(
                    (p) => p.active && p.variants.some((v) => v.stock < 5),
                  ).length ? (
                    products
                      .filter(
                        (p) => p.active && p.variants.some((v) => v.stock < 5),
                      )
                      .slice(0, 5)
                      .map((p) => (
                        <button
                          className="ws-inventory-alert"
                          key={p.id}
                          onClick={() => {
                            setTab("products");
                            setEdit(p);
                          }}
                        >
                          <span>
                            {p.name}
                            <small>{p.sku}</small>
                          </span>
                          <Status tone="warning">
                            {p.variants.filter((v) => v.stock < 5).length}{" "}
                            varian menipis
                          </Status>
                        </button>
                      ))
                  ) : (
                    <div className="ws-inline-empty">
                      <CheckCircle2 size={20} />
                      Persediaan saat ini mencukupi.
                    </div>
                  )}
                </section>
                <section className="ws-panel">
                  <div className="ws-panel-heading">
                    <h2>Peran administrator</h2>
                    <p>Ruang ini khusus untuk mengelola operasional.</p>
                  </div>
                  <p className="ws-body-copy">
                    Akun admin tidak memiliki keranjang, favorit, atau checkout.
                    Untuk mencoba belanja, keluar lalu masuk dengan akun
                    pelanggan.
                  </p>
                  <button
                    className="ws-link"
                    onClick={() => select("settings")}
                  >
                    Periksa status layanan
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            </>
          )}
          {tab === "products" && !edit && (
            <section className="ws-panel">
              <div className="ws-toolbar">
                <label className="ws-search">
                  <Search size={18} />
                  <input
                    aria-label="Cari produk admin"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama, SKU, atau departemen…"
                  />
                </label>
                <select
                  aria-label="Status publikasi"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Semua produk</option>
                  <option value="active">Aktif</option>
                  <option value="archived">Arsip</option>
                </select>
                <span className="ws-muted">{productRows.length} produk</span>
              </div>
              {productRows.length ? (
                <div className="ws-table-scroll">
                  <table className="ws-table">
                    <thead>
                      <tr>
                        <th>Produk</th>
                        <th>Harga</th>
                        <th>Persediaan</th>
                        <th>Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="ws-product-cell">
                              <img src={p.image} alt={p.name} />
                              <div>
                                <b>{p.name}</b>
                                <small>
                                  {p.sku} · {departmentLabel(p.gender)}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>{money(p.price)}</td>
                          <td>
                            <b>{p.stock}</b> unit
                            <small>{p.variants.length} varian</small>
                          </td>
                          <td>
                            <Status tone={p.active ? "success" : "neutral"}>
                              {p.active ? "Aktif" : "Arsip"}
                            </Status>
                          </td>
                          <td>
                            <div className="ws-row-actions">
                              <button
                                className="ws-link"
                                onClick={() => setEdit(p)}
                              >
                                Edit
                              </button>
                              <button
                                className="ws-link secondary-link"
                                disabled={busy}
                                onClick={() =>
                                  perform(
                                    () =>
                                      api("/admin/products/" + p.id, {
                                        method: "PATCH",
                                        body: { active: !p.active },
                                      }),
                                    p.active
                                      ? "Produk diarsipkan."
                                      : "Produk diaktifkan.",
                                  )
                                }
                              >
                                {p.active ? "Arsipkan" : "Aktifkan"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon={Boxes} title="Produk tidak ditemukan">
                  Coba kata pencarian atau status lain.
                </Empty>
              )}
            </section>
          )}
          {tab === "products" && edit && (
            <section className="ws-panel ws-form-panel">
              <form
                className="ws-form-grid"
                key={edit.id || "new"}
                onSubmit={save}
              >
                <div className="ws-wide ws-panel-heading">
                  <h2>Informasi produk</h2>
                  <p>
                    Lengkapi identitas, harga, dan deskripsi sebelum menyimpan.
                  </p>
                </div>
                <label>
                  Nama produk
                  <input
                    name="name"
                    defaultValue={edit.name}
                    required
                    minLength={2}
                    maxLength={200}
                  />
                </label>
                <label>
                  SKU
                  <input
                    name="sku"
                    defaultValue={edit.sku || ""}
                    required
                    pattern="[A-Za-z0-9-]{2,40}"
                    placeholder="LJ-NEW-001"
                  />
                </label>
                <label>
                  Departemen
                  <select name="gender" defaultValue={edit.gender || "Wanita"}>
                    {departments.map(({ id, label }) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Kategori
                  <select
                    name="category"
                    defaultValue={edit.category || "T-Shirt"}
                  >
                    {catalogCategories.map(({ id, label }) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Harga jual (Rp)
                  <input
                    name="price"
                    type="number"
                    min="1000"
                    max="10000000"
                    required
                    defaultValue={edit.price}
                  />
                </label>
                <label>
                  Harga sebelum diskon (Rp)
                  <input
                    name="oldPrice"
                    type="number"
                    min="0"
                    max="10000000"
                    required
                    defaultValue={edit.oldPrice || 0}
                  />
                  <small>Isi 0 jika tidak ada promo.</small>
                </label>
                <label className="ws-wide">
                  Gambar produk
                  <input
                    name="image"
                    required
                    defaultValue={edit.image || ""}
                    placeholder="Alamat gambar produk"
                  />
                  <small>
                    Path /images/ atau URL HTTPS images.unsplash.com.
                  </small>
                </label>
                <label className="ws-wide">
                  Deskripsi
                  <textarea
                    name="description"
                    minLength={10}
                    maxLength={2000}
                    required
                    defaultValue={edit.description || ""}
                  />
                </label>
                <label className="ws-checkbox ws-wide">
                  <input
                    type="checkbox"
                    name="isNew"
                    defaultChecked={edit.isNew}
                  />
                  Tandai sebagai produk baru
                </label>
                {edit.id ? (
                  <div className="ws-wide">
                    <div className="ws-panel-heading">
                      <h2>Stok per varian</h2>
                      <p>
                        Hanya nilai yang Anda ubah yang disimpan. Stok yang
                        sudah dipesan tidak termasuk di sini.
                      </p>
                    </div>
                    <div className="ws-variant-scroll">
                      <table className="ws-table">
                        <thead>
                          <tr>
                            <th>Ukuran kasur</th>
                            <th>Warna</th>
                            <th>Stok tersedia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {edit.variants.map((v, i) => (
                            <tr key={v.size + v.color}>
                              <td>{v.size}</td>
                              <td>
                                <i
                                  className="color-dot"
                                  style={{ background: v.color }}
                                />{" "}
                                {colorLabel(v.color)}
                              </td>
                              <td>
                                <input
                                  aria-label={"Stok " + v.size + " " + v.color}
                                  name={"stock_" + i}
                                  type="number"
                                  min="0"
                                  max="100000"
                                  defaultValue={v.stock}
                                  required
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <>
                    <label>
                      Ukuran kasur (pisahkan koma)
                      <input name="sizes" required defaultValue="100×200,120×200,160×200" />
                    </label>
                    <label>
                      Warna HEX (pisahkan koma)
                      <input name="colors" required defaultValue="#fff,#333" />
                    </label>
                    <label>
                      Stok awal setiap varian
                      <input
                        name="stock"
                        type="number"
                        min="0"
                        max="100000"
                        required
                        defaultValue="30"
                      />
                    </label>
                  </>
                )}
                <div className="ws-wide ws-form-actions">
                  <button className="ws-button primary" disabled={busy}>
                    {busy ? "Menyimpan…" : "Simpan produk"}
                  </button>
                  <button
                    type="button"
                    className="ws-button"
                    onClick={() => setEdit(null)}
                  >
                    Batal
                  </button>
                </div>
              </form>
            </section>
          )}
          {tab === "orders" && !selected && (
            <section className="ws-panel">
              <div className="ws-toolbar">
                <label className="ws-search">
                  <Search size={18} />
                  <input
                    aria-label="Cari pesanan admin"
                    placeholder="Nomor pesanan atau pelanggan…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter status pesanan"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Semua status</option>
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
              </div>
              {orderRows.length ? (
                orderTable(orderRows)
              ) : (
                <Empty icon={Package} title="Tidak ada pesanan">
                  Tidak ada hasil untuk filter ini.
                </Empty>
              )}
            </section>
          )}
          {tab === "orders" && selected && (
            <section className="ws-panel ws-admin-order">
              <div className="ws-order-heading">
                <div>
                  <p className="ws-kicker">
                    #{selected.id.slice(-8).toUpperCase()}
                  </p>
                  <h2>{selected.address.name}</h2>
                  <p>{new Date(selected.createdAt).toLocaleString("id-ID")}</p>
                </div>
                <Status
                  tone={
                    selected.payment_status === "PAID" ? "success" : "warning"
                  }
                >
                  {selected.status}
                </Status>
              </div>
              <div className="ws-detail-columns">
                <div>
                  <h3>Penerima & alamat</h3>
                  <p>
                    {selected.address.name}
                    <br />
                    {selected.address.phone}
                    <br />
                    {selected.address.email}
                    <br />
                    {selected.address.street}, {selected.address.city}{" "}
                    {selected.address.postal}
                  </p>
                </div>
                <div>
                  <h3>Pembayaran</h3>
                  <p>
                    {paymentLabel[selected.payment_status]}
                    <br />
                    Metode pengiriman: {selected.shipping}
                  </p>
                  <small className="ws-mono">
                    {selected.invoice_id || "Invoice belum tersedia"}
                  </small>
                </div>
              </div>
              <div className="ws-table-scroll">
                <table className="ws-table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Varian</th>
                      <th>Jumlah</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((i, j) => (
                      <tr key={j}>
                        <td>{i.name}</td>
                        <td>
                          {i.size} ·{" "}
                          <i
                            className="color-dot"
                            style={{ background: i.color }}
                          />
                        </td>
                        <td>{i.quantity}</td>
                        <td>{money(i.quantity * i.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ws-admin-totals">
                <p>
                  Subtotal <b>{money(selected.subtotal)}</b>
                </p>
                <p>
                  Diskon <b>−{money(selected.discount)}</b>
                </p>
                <p>
                  Ongkir <b>{money(selected.delivery)}</b>
                </p>
                <p>
                  Total <strong>{money(selected.total)}</strong>
                </p>
              </div>
              <div className="ws-form-actions">
                {selected.status === "Menunggu pembayaran" && (
                  <>
                    <button
                      className="ws-button primary"
                      disabled={busy}
                      onClick={() =>
                        perform(
                          () =>
                            api("/admin/orders/" + selected.id + "/payment", {
                              method: "POST",
                            }),
                          "Pembayaran telah diperiksa.",
                        )
                      }
                    >
                      Periksa pembayaran
                    </button>
                    <button
                      className="ws-button"
                      disabled={busy}
                      onClick={() =>
                        perform(
                          () =>
                            api("/admin/orders/" + selected.id, {
                              method: "PATCH",
                              body: { status: "Dibatalkan" },
                            }),
                          "Pesanan dibatalkan.",
                        )
                      }
                    >
                      Batalkan pesanan
                    </button>
                  </>
                )}
                {["Diproses", "Dikirim"].includes(selected.status) && (
                  <button
                    className="ws-button primary"
                    disabled={busy}
                    onClick={() =>
                      perform(
                        () =>
                          api("/admin/orders/" + selected.id, {
                            method: "PATCH",
                            body: {
                              status:
                                selected.status === "Diproses"
                                  ? "Dikirim"
                                  : "Selesai",
                            },
                          }),
                        "Status pesanan diperbarui.",
                      )
                    }
                  >
                    {selected.status === "Diproses"
                      ? "Tandai dikirim"
                      : "Tandai selesai"}
                  </button>
                )}
              </div>
              <small className="ws-mono ws-muted">
                Referensi: {selected.id}
              </small>
            </section>
          )}
          {tab === "settings" && (
            <div className="ws-services">
              {[
                {
                  name: "Database toko",
                  detail: "Penyimpanan produk, akun dan pesanan",
                  ok: true,
                  label: "Terhubung",
                },
                {
                  name: "Pembayaran online",
                  detail: health?.sandbox
                    ? "Transaksi nyata belum diaktifkan."
                    : "Penerimaan dan konfirmasi pembayaran otomatis.",
                  ok: health?.gateway,
                  label: health?.gateway
                    ? health?.sandbox
                      ? "Belum live"
                      : "Aktif"
                    : "Belum diatur",
                },
                {
                  name: "WhatsApp & verifikasi akun",
                  detail: "Pengiriman kode verifikasi dan notifikasi pesanan.",
                  ok: health?.whatsappConfigured,
                  label: health?.whatsappConfigured ? "Aktif" : "Belum diatur",
                },
              ].map((s) => (
                <section className="ws-panel ws-service" key={s.name}>
                  <span className="ws-service-icon">
                    {s.ok ? (
                      <CheckCircle2 size={25} />
                    ) : (
                      <AlertCircle size={25} />
                    )}
                  </span>
                  <div>
                    <h2>{s.name}</h2>
                    <p>{s.detail}</p>
                  </div>
                  <Status tone={s.ok ? "success" : "warning"}>{s.label}</Status>
                </section>
              ))}
              <section className="ws-panel ws-service">
                <div>
                  <h2>Antrean email transaksi</h2>
                  <p>
                    {health?.email.find((x) => x.status === "sent")?.count || 0}{" "}
                    terkirim ·{" "}
                    {health?.email.find((x) => x.status === "pending")?.count ||
                      0}{" "}
                    menunggu pengiriman. OTP dikirim langsung agar tidak
                    menunggu antrean.
                  </p>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </Workspace>
  );
}
