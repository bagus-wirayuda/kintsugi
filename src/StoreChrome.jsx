import React, { useState, useEffect, useRef } from "react";
import { createPortal } from 'react-dom';
import {
  Search,
  UserRound,
  Heart,
  ShoppingBag,
  ShoppingCart,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Grid2X2,
  Package,
  MapPin,
  ShieldCheck,
  LogOut,
  HelpCircle,
  Mail,
  SlidersHorizontal,
} from "lucide-react";
import Brand from "./Brand";
import { getMainCategories, getSubcategories, categoryLabel, catalogCategories } from "./catalog";
export function StoreHeader({
  nav,
  shop,
  activeCategory = "Semua",
  activeSubcategory = "Semua",
  count = 0,
  wishCount = 0,
  onSearch,
  user,
  onLogout,
  config,
}) {
  const [open, setOpen] = useState(false);
  const active = location.hash.split('/')[0].slice(1);
  const allCategories = config?.categories?.length ? config.categories : catalogCategories;
  const mainCategoriesList = getMainCategories(allCategories);
  const isAdmin = ["admin", "manager", "staff"].includes(user?.role);

  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.type === 'pointerdown') {
        if (!e.target.closest('.ks-mobile-departments') && !e.target.closest('[data-bottom-category]')) setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, []);
  const go = (route) => { setOpen(false); nav(route); };
  const handleProfileClick = () => {
    setOpen(false);
    if (isAdmin) {
      nav(user?.role === "staff" ? "admin/orders" : "admin/overview");
    } else {
      nav(user ? "account/profile" : "account");
    }
  };
  const goPromo = () => {
    if (active !== "home") nav("home");
    setTimeout(() => document.getElementById("promo")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const browse = (mainCatId, subCatId = "Semua") => {
    setOpen(false);
    shop ? shop(mainCatId, subCatId) : nav("catalog");
  };
  return (
    <>
      <div className="ks-announcement">
        <span>{config?.announcementText || "Koleksi tekstil & busana berkualitas untuk kenyamanan ruang hidup Anda."}</span>
        <span>
          Gratis ongkir mulai Rp699.000 <ArrowRight size={13} />
        </span>
        <button className="ks-announcement-promo" onClick={goPromo}>Lihat promo</button>
      </div>
      <header className="ks-header">
        <div className="ks-header-inner">
          <button
            className="ks-brand"
            onClick={() => nav("home")}
            aria-label="Kintsugi beranda"
          >
            <Brand src={config?.logo || undefined} alt={config?.brand || "Kintsugi"} />
          </button>
          <nav className="ks-departments" aria-label="Kategori utama produk">
            {mainCategoriesList.map((m) => (
              <button
                key={m.id}
                className={activeCategory === m.id ? "active" : ""}
                onClick={() => browse(m.id, "Semua")}
              >
                {(m.label || m.name || m.id).toUpperCase()}
              </button>
            ))}
          </nav>
          <div className="ks-actions">
            {isAdmin && (
              <button
                className="ks-admin-badge"
                title="Buka panel administrasi toko"
                onClick={() => nav("admin/overview")}
              >
                <ShieldCheck size={17} />
                <span>Panel Admin</span>
              </button>
            )}
            <button
              className="ks-search"
              aria-label="Cari produk"
              onClick={onSearch || (() => nav("catalog"))}
            >
              <Search size={21} />
              <span>Cari katalog…</span>
            </button>
            <button
              className="ks-profile-btn"
              aria-label={user ? "Profil saya" : "Masuk ke akun"}
              onClick={handleProfileClick}
            >
              <UserRound size={22} /><span className="ks-profile-label">{user ? "Profil" : "Masuk"}</span>
            </button>
            <button
              aria-label="Favorit saya"
              onClick={() => nav(user?.role === "customer" ? "account/wishlist" : "wishlist")}
            >
              <Heart size={22} />
              {wishCount > 0 && <b>{wishCount}</b>}
            </button>
            <button
              data-cart-target
              aria-label={`Keranjang belanja, ${count} barang`}
              onClick={() => nav(user?.role === "customer" ? "account/cart" : "cart")}
            >
              <ShoppingCart size={22} />
              {count > 0 && <b>{count}</b>}
            </button>
            <button
              className="ks-menu"
              aria-label={open ? "Tutup kategori" : "Buka kategori"}
              onClick={() => { setOpen(!open); }}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        <nav
          className={"ks-mobile-departments " + (open ? "expanded" : "")}
          aria-label="Kategori di ponsel"
        >
          <div className="ks-mobile-departments-header">
            <span className="ks-mobile-section-title">KATEGORI</span>
            <button
              type="button"
              className="ks-mobile-close-btn"
              aria-label="Tutup menu kategori"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="ks-mobile-cats-list">
            {mainCategoriesList.map((m) => (
              <button
                key={m.id}
                type="button"
                className={"ks-mobile-cat-item " + (activeCategory === m.id ? "active" : "")}
                onClick={() => browse(m.id, "Semua")}
              >
                <span>{m.label || m.name || m.id}</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </nav>
      </header>
      {createPortal(<nav className="ks-bottom-nav" aria-label="Navigasi belanja ponsel">
        <button className={active === 'catalog' && !open ? 'active' : ''} onClick={() => go('catalog')}><ShoppingBag size={21}/><span>Belanja</span></button>
        <button data-bottom-category className={open ? 'active' : ''} aria-expanded={open} onClick={() => { setOpen(!open); }}><Grid2X2 size={21}/><span>Kategori</span></button>
        <button
          className={(active === 'wishlist' || (active === 'account' && location.hash.includes('wishlist'))) ? 'active' : ''}
          onClick={() => go(user?.role === "customer" ? "account/wishlist" : "wishlist")}
        >
          <Heart size={21} />
          <span>Favorit</span>
          {wishCount > 0 && <b>{wishCount}</b>}
        </button>
        <button
          data-cart-target
          className={(active === 'cart' || (active === 'account' && location.hash.includes('cart'))) ? 'active' : ''}
          aria-label={`Keranjang, ${count} barang`}
          onClick={() => go(user?.role === "customer" ? "account/cart" : "cart")}
        >
          <ShoppingCart size={21} />
          <span>Keranjang</span>
          {count > 0 && <b>{count}</b>}
        </button>
        <button className={active === 'account' ? 'active' : ''} aria-label={user ? "Profil saya" : "Masuk ke akun"} onClick={handleProfileClick}><UserRound size={21}/><span>{user ? "Profil" : "Masuk"}</span></button>
      </nav>, document.body)}
    </>
  );
}
export function StoreFooter({ nav, onInfo, contact = "", storeAddress = "", brand = "Kintsugi" }) {
  const info = (title) => onInfo ? onInfo(title) : nav("account/help");
  return (
    <footer className="ks-simple-footer">
      <div className="ks-footer-main">
        {/* Kolom Brand & Keunggulan */}
        <div className="ks-footer-brand-col">
          <div className="ks-footer-brand-wrap">
            <span className="ks-footer-brand-title">{brand}</span>
            <span className="ks-footer-brand-gold-bar"></span>
          </div>
          <p className="ks-footer-brand-tagline">
            Koleksi tekstil & busana berkualitas yang dirancang dengan perhatian pada detail dan kenyamanan ruang hidup Anda.
          </p>
          <div className="ks-footer-trust-badge">
            <ShieldCheck size={16} />
            <span>Kualitas Terjamin & Belanja Aman</span>
          </div>
        </div>

        {/* Kolom Informasi & Panduan */}
        <div className="ks-footer-nav-col">
          <h4 className="ks-footer-col-title">Informasi & Bantuan</h4>
          <nav className="ks-footer-links" aria-label={`Informasi ${brand}`}>
            <button type="button" onClick={() => info("Kebijakan privasi")}>
              <span>Kebijakan Privasi</span>
              <ArrowRight size={13} className="ks-footer-link-arrow" />
            </button>
            <button type="button" onClick={() => info("Pengiriman")}>
              <span>Informasi Pengiriman</span>
              <ArrowRight size={13} className="ks-footer-link-arrow" />
            </button>
            <button type="button" onClick={() => info("Cerita kami")}>
              <span>Informasi {brand}</span>
              <ArrowRight size={13} className="ks-footer-link-arrow" />
            </button>
            <button type="button" onClick={() => info("Panduan belanja")}>
              <span>Panduan Belanja</span>
              <ArrowRight size={13} className="ks-footer-link-arrow" />
            </button>
            <button type="button" onClick={() => info("Syarat & ketentuan")}>
              <span>Syarat & Ketentuan</span>
              <ArrowRight size={13} className="ks-footer-link-arrow" />
            </button>
          </nav>
        </div>

        {/* Kolom Layanan Pelanggan & Kontak */}
        <div className="ks-footer-contact-col">
          <h4 className="ks-footer-col-title">Layanan Pelanggan</h4>
          <div className="ks-footer-contact">
            <p className="ks-footer-contact-label">Hubungi layanan pelanggan {brand}:</p>
            {contact && (
              <a className="ks-footer-contact-card" href={`mailto:${contact}`} title={`Kirim email ke ${contact}`}>
                <Mail size={16} />
                <span>{contact}</span>
              </a>
            )}
            {storeAddress && (
              <div className="ks-footer-address-card">
                <MapPin size={16} />
                <span>Alamat toko: {storeAddress}</span>
              </div>
            )}
            <p className="ks-footer-order-note">
              <HelpCircle size={14} />
              <span>Untuk pertanyaan pesanan, sertakan nomor pesanan Anda.</span>
            </p>
          </div>
        </div>
      </div>

      {/* Footer Bottom Bar */}
      <div className="ks-footer-bottom">
        <small className="ks-footer-copyright">
          Hak Cipta © 2026 {brand}. Semua hak dilindungi undang-undang.
        </small>
        <div className="ks-footer-actions">
          <button
            type="button"
            className="ks-footer-icon-btn"
            aria-label={`Koleksi ${brand}`}
            title={`Koleksi ${brand}`}
            onClick={() => nav("catalog")}
          >
            <ShoppingBag size={18} />
          </button>
          <button
            type="button"
            className="ks-footer-icon-btn"
            aria-label={`Hubungi ${brand}`}
            title="Bantuan & Layanan"
            onClick={() => info("Hubungi kami")}
          >
            <HelpCircle size={18} />
          </button>
          {contact && (
            <a
              className="ks-footer-icon-btn"
              aria-label={`Kirim email ke ${brand}`}
              title={`Kirim email ke ${contact}`}
              href={`mailto:${contact}`}
            >
              <Mail size={18} />
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
