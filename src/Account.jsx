import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  UserRound,
  ShieldCheck,
  Heart,
  ShoppingBag,
  ArrowRight,
  RefreshCw,
  MapPin,
  Clock3,
} from "lucide-react";
import Workspace, { Empty, Notice, Status } from "./Workspace";
import OrderCard from "./Orders";
import { api } from "./store";
export default function Account({
  user,
  onUser,
  onLogout,
  notify,
  nav,
  wishCount,
  cartCount,
  config,
}) {
  const tabs = ["overview", "orders", "profile", "security"];
  const tabFromHash = () =>
    tabs.includes(location.hash.split("/")[1])
      ? location.hash.split("/")[1]
      : "overview";
  const [tab, setTab] = useState(tabFromHash),
    [orders, setOrders] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [filter, setFilter] = useState("all"),
    [profile, setProfile] = useState(null);
  function select(t) {
    setTab(t);
    setError("");
    setMessage("");
    history.replaceState(null, "", "#account/" + t);
  }
  async function refresh() {
    const data = await api("/orders");
    setOrders(data);
    return data;
  }
  useEffect(() => {
    const change = () => setTab(tabFromHash());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [o, p] = await Promise.all([api("/orders"), api("/me/profile")]);
        if (!alive) return;
        setOrders(o);
        setProfile(p);
        for (const order of o
          .filter((o) => ["PENDING", "CREATING"].includes(o.payment_status))
          .slice(0, 5)) {
          try {
            await api("/orders/" + order.id + "/payment", { method: "POST" });
          } catch {}
        }
        if (alive) await refresh();
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const timer = setInterval(() => {
      if (!document.hidden) refresh().catch((e) => setError(e.message));
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user.id]);
  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const p = await api("/me/profile", {
        method: "PATCH",
        body: Object.fromEntries(new FormData(e.currentTarget)),
      });
      setProfile(p);
      onUser({ ...user, name: p.name });
      setMessage("Profil dan alamat pengiriman berhasil disimpan.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form));
    setError("");
    setMessage("");
    if (f.newPassword !== f.confirmPassword)
      return setError("Konfirmasi kata sandi tidak cocok.");
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "PATCH",
        body: { oldPassword: f.oldPassword, newPassword: f.newPassword },
      });
      setMessage(
        "Kata sandi berhasil diubah. Sesi pada perangkat lain telah dicabut.",
      );
      form.reset();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const waiting = orders.filter((o) => o.status === "Menunggu pembayaran"),
    active = orders.filter((o) => ["Diproses", "Dikirim"].includes(o.status)),
    complete = orders.filter((o) => o.status === "Selesai");
  const titles = {
    overview: "Ringkasan akun",
    orders: "Pesanan saya",
    profile: "Profil & alamat",
    security: "Keamanan akun",
  };
  const items = [
    { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
    {
      id: "orders",
      label: "Pesanan saya",
      icon: Package,
      count: waiting.length,
    },
    { id: "profile", label: "Profil & alamat", icon: UserRound },
    { id: "security", label: "Keamanan", icon: ShieldCheck },
    { id: "wishlist", label: "Favorit saya", icon: Heart, count: wishCount },
    { id: "cart", label: "Keranjang", icon: ShoppingBag, count: cartCount },
  ];
  const selectMenu = (t) =>
    t === "wishlist" ? nav("wishlist") : t === "cart" ? nav("cart") : select(t);
  const shown = orders.filter(
    (o) =>
      filter === "all" ||
      (filter === "pending" && o.status === "Menunggu pembayaran") ||
      (filter === "active" && ["Diproses", "Dikirim"].includes(o.status)) ||
      (filter === "complete" && o.status === "Selesai") ||
      (filter === "cancelled" && o.status === "Dibatalkan"),
  );
  return (
    <Workspace
      user={user}
      items={items}
      active={tab}
      onSelect={selectMenu}
      onLogout={onLogout}
      title={titles[tab]}
      subtitle="Kelola informasi dan aktivitas belanja Anda dengan mudah."
      actions={
        tab === "orders" ? (
          <button
            className="ws-button"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            <RefreshCw size={16} />
            Muat ulang
          </button>
        ) : null
      }
    >
      <Notice>{error}</Notice>
      <Notice type="success">{message}</Notice>
      {loading ? (
        <div className="ws-loading" role="status">
          Memuat akun Anda…
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <section className="ws-welcome">
                <div>
                  <p className="ws-kicker">SENANG MELIHAT ANDA KEMBALI</p>
                  <h2>Halo, {user.name.split(" ")[0]}.</h2>
                  <p>
                    Temukan pembaruan pesanan dan atur kebutuhan akun Anda di
                    sini.
                  </p>
                  <button
                    className="ws-button light"
                    onClick={() => nav("catalog")}
                  >
                    Jelajahi katalog
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="ws-welcome-symbol">
                  <ShoppingBag size={70} />
                </div>
              </section>
              <div className="ws-stats">
                {[
                  {
                    label: "Menunggu pembayaran",
                    value: waiting.length,
                    icon: Clock3,
                    tab: "orders",
                  },
                  {
                    label: "Sedang diproses",
                    value: active.length,
                    icon: Package,
                    tab: "orders",
                  },
                  {
                    label: "Pesanan selesai",
                    value: complete.length,
                    icon: ShieldCheck,
                    tab: "orders",
                  },
                ].map((s) => (
                  <button
                    className="ws-stat"
                    key={s.label}
                    onClick={() => {
                      select(s.tab);
                      setFilter(
                        s.label === "Menunggu pembayaran"
                          ? "pending"
                          : s.label === "Sedang diproses"
                            ? "active"
                            : "complete",
                      );
                    }}
                  >
                    <span>
                      <s.icon size={20} />
                    </span>
                    <div>
                      <p>{s.label}</p>
                      <b>{s.value}</b>
                    </div>
                    <ArrowRight size={17} />
                  </button>
                ))}
              </div>
              <div className="ws-section-heading">
                <div>
                  <h2>Pesanan terbaru</h2>
                  <p>Pantau perjalanan barang pilihan Anda.</p>
                </div>
                <button className="ws-link" onClick={() => select("orders")}>
                  Lihat semua
                  <ArrowRight size={15} />
                </button>
              </div>
              {orders.length ? (
                <OrderCard
                  order={orders[0]}
                  onRefresh={refresh}
                  notify={notify}
                  config={config}
                />
              ) : (
                <div className="ws-panel">
                  <Empty
                    icon={Package}
                    title="Belum ada pesanan"
                    action={
                      <button
                        className="ws-button primary"
                        onClick={() => nav("catalog")}
                      >
                        Mulai belanja
                      </button>
                    }
                  >
                    Produk yang Anda pesan akan tampil di sini.
                  </Empty>
                </div>
              )}
              <div className="ws-account-bottom">
                <button
                  className="ws-panel ws-shortcut"
                  onClick={() => select("profile")}
                >
                  <MapPin size={24} />
                  <div>
                    <h3>Alamat pengiriman</h3>
                    <p>
                      {profile?.street
                        ? profile.street + ", " + profile.city
                        : "Simpan alamat agar checkout berikutnya lebih cepat."}
                    </p>
                  </div>
                  <ArrowRight size={18} />
                </button>
                <button
                  className="ws-panel ws-shortcut"
                  onClick={() => nav("wishlist")}
                >
                  <Heart size={24} />
                  <div>
                    <h3>Favorit pilihan Anda</h3>
                    <p>{wishCount} produk tersimpan di browser ini.</p>
                  </div>
                  <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}
          {tab === "orders" && (
            <>
              <div className="ws-filterbar" aria-label="Filter pesanan">
                {[
                  ["all", "Semua"],
                  ["pending", "Belum dibayar"],
                  ["active", "Diproses / dikirim"],
                  ["complete", "Selesai"],
                  ["cancelled", "Dibatalkan"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={filter === v ? "active" : ""}
                    onClick={() => setFilter(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {shown.length ? (
                shown.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onRefresh={refresh}
                    notify={notify}
                    config={config}
                  />
                ))
              ) : (
                <div className="ws-panel">
                  <Empty icon={Package} title="Tidak ada pesanan">
                    Belum ada pesanan pada status ini.
                  </Empty>
                </div>
              )}
            </>
          )}
          {tab === "profile" && (
            <section className="ws-panel ws-form-panel">
              <div className="ws-panel-heading">
                <h2>Informasi pribadi & pengiriman</h2>
                <p>Alamat ini dapat digunakan saat Anda checkout.</p>
              </div>
              <form
                className="ws-form-grid"
                onSubmit={saveProfile}
                key={profile?.name + profile?.street}
              >
                <label>
                  Nama lengkap
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={profile?.name || user.name}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Email akun
                  <input value={user.email} readOnly />
                  <small>Email digunakan untuk masuk dan verifikasi.</small>
                </label>
                <label>
                  Nomor telepon
                  <input
                    name="phone"
                    type="tel"
                    pattern="[0-9+ ()-]{8,20}"
                    required
                    defaultValue={profile?.phone || ""}
                    autoComplete="tel"
                  />
                </label>
                <label>
                  Kota / kabupaten
                  <input
                    name="city"
                    required
                    minLength={2}
                    defaultValue={profile?.city || ""}
                  />
                </label>
                <label className="ws-wide">
                  Alamat lengkap
                  <textarea
                    name="street"
                    required
                    minLength={10}
                    defaultValue={profile?.street || ""}
                    autoComplete="street-address"
                  />
                </label>
                <label>
                  Kode pos
                  <input
                    name="postal"
                    required
                    pattern="[0-9]{5}"
                    maxLength={5}
                    defaultValue={profile?.postal || ""}
                  />
                </label>
                <div className="ws-wide ws-form-actions">
                  <button className="ws-button primary" disabled={busy}>
                    {busy ? "Menyimpan…" : "Simpan perubahan"}
                  </button>
                </div>
              </form>
            </section>
          )}
          {tab === "security" && (
            <div className="ws-security-grid">
              <section className="ws-panel ws-form-panel">
                <div className="ws-panel-heading">
                  <h2>Ubah kata sandi</h2>
                  <p>Gunakan kata sandi yang unik, minimal 8 karakter.</p>
                </div>
                <form onSubmit={changePassword}>
                  <label>
                    Kata sandi saat ini
                    <input
                      name="oldPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <label>
                    Kata sandi baru
                    <input
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={72}
                      required
                    />
                  </label>
                  <label>
                    Ulangi kata sandi baru
                    <input
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </label>
                  <button className="ws-button primary" disabled={busy}>
                    {busy ? "Memperbarui…" : "Perbarui kata sandi"}
                  </button>
                </form>
              </section>
              <section className="ws-panel ws-security-note">
                <ShieldCheck size={30} />
                <h3>Perlindungan akun Anda</h3>
                <p>
                  Akun baru harus memverifikasi email menggunakan OTP. Kode
                  hanya berlaku 10 menit dan satu kali pemakaian.
                </p>
                <p>
                  Mengubah kata sandi akan mengeluarkan sesi pada perangkat
                  lain.
                </p>
                <p>
                  Jangan bagikan kata sandi atau kode verifikasi kepada orang
                  lain.
                </p>
              </section>
            </div>
          )}
        </>
      )}
    </Workspace>
  );
}
