import React, { useState, useEffect, useRef } from "react";
import { createPortal } from 'react-dom';
import {
  Search,
  UserRound,
  Heart,
  ShoppingBag,
  ShoppingCart,
  ArrowRight,
  Menu,
  X,
  Grid2X2,
  Package,
  MapPin,
  ShieldCheck,
  LogOut,
  HelpCircle,
} from "lucide-react";
import Brand from "./Brand";
import { departments } from "./catalog";
import { categories } from "./data";
import { categoryLabel } from "./catalog";
export function StoreHeader({
  nav,
  shop,
  gender,
  count = 0,
  wishCount = 0,
  onSearch,
  user,
  onLogout,
}) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileTrigger = useRef(null);
  const profilePanel = useRef(null);
  const active = location.hash.split('/')[0].slice(1);
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') { setProfileOpen(false); setOpen(false); profileTrigger.current?.focus(); }
      if (e.type === 'pointerdown' && !e.target.closest('[data-profile-area]')) setProfileOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, []);
  useEffect(() => { if (profileOpen) profilePanel.current?.querySelector('button')?.focus(); }, [profileOpen]);
  const go = (route) => { setProfileOpen(false); setOpen(false); nav(route); };
  const browse = (g) => {
    setOpen(false);
    shop ? shop("Semua", g) : nav("catalog");
  };
  return (
    <>
      <div className="ks-announcement">
        <span>Ruang tidur yang tenang, dimulai dari tekstil yang baik.</span>
        <span>
          Gratis ongkir mulai Rp699.000 <ArrowRight size={13} />
        </span>
        <a href={user ? "#account/orders" : "mailto:wirayuda101101@gmail.com"}>
          {user ? "Pesanan saya" : "Bantuan belanja"}
        </a>
      </div>
      <header className="ks-header">
        <div className="ks-header-inner">
          <button
            className="ks-brand"
            onClick={() => nav(user ? "catalog" : "home")}
            aria-label="Kintsugi beranda"
          >
            <Brand />
          </button>
          <nav className="ks-departments" aria-label="Departemen belanja">
            {departments.map(({ id: g, label }) => (
              <button
                key={g}
                className={gender === g ? "active" : ""}
                onClick={() => browse(g)}
              >
                {label.toUpperCase()}
              </button>
            ))}
          </nav>
          <div className="ks-actions">
            <button
              className="ks-search"
              aria-label="Cari produk"
              onClick={onSearch || (() => nav("catalog"))}
            >
              <Search size={21} />
              <span>Cari kebutuhan Anda</span>
            </button>
            <button ref={profileTrigger} data-profile-area aria-label="Menu profil" aria-expanded={profileOpen} aria-controls="customer-profile-menu" onClick={() => { setProfileOpen(!profileOpen); setOpen(false); }}>
              <UserRound size={22} /><span className="ks-profile-label">Profil</span>
            </button>
            <button aria-label="Favorit saya" onClick={() => nav("wishlist")}>
              <Heart size={22} />
              {wishCount > 0 && <b>{wishCount}</b>}
            </button>
            <button data-cart-target aria-label={`Keranjang belanja, ${count} barang`} onClick={() => nav("cart")}>
              <ShoppingCart size={22} />
              {count > 0 && <b>{count}</b>}
            </button>
            <button
              className="ks-menu"
              aria-label={open ? "Tutup kategori" : "Buka kategori"}
              onClick={() => { setOpen(!open); setProfileOpen(false); }}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        <nav
          className={"ks-mobile-departments " + (open ? "expanded" : "")}
          aria-label="Kategori di ponsel"
        >
          {departments.map(({ id: g, label }) => (
            <button key={g} onClick={() => browse(g)}>
              {label}
            </button>
          ))}
          {open && categories.map((c) => <button key={c} onClick={() => { setOpen(false); shop ? shop(c, gender) : nav('catalog'); }}>{categoryLabel(c)}</button>)}
        </nav>
        {profileOpen && createPortal(<section ref={profilePanel} data-profile-area id="customer-profile-menu" className="ks-profile-menu" aria-label="Menu akun pelanggan">
          <div className="ks-profile-heading"><span className="ks-profile-avatar"><UserRound size={24}/></span><div><strong>{user?.name || 'Selamat datang'}</strong><small>{user ? 'Akun pelanggan Kintsugi' : 'Masuk untuk mengelola belanja Anda'}</small></div><button aria-label="Tutup menu profil" onClick={() => setProfileOpen(false)}><X size={19}/></button></div>
          {(user ? [
            ['account/orders', 'Pesanan saya', Package],
            ['account/profile', 'Profil & data diri', UserRound],
            ['account/address', 'Alamat pengiriman', MapPin],
            ['account/security', 'Keamanan akun', ShieldCheck],
            ['wishlist', 'Favorit saya', Heart],
            ['cart', 'Keranjang belanja', ShoppingCart],
            ['account/help', 'Bantuan belanja', HelpCircle],
          ] : [['account', 'Masuk / daftar', UserRound]]).map(([route, label, Icon]) => <button key={route} onClick={() => go(route)}><Icon size={19}/><span>{label}</span><ArrowRight size={15}/></button>)}
          {user && onLogout && <button className="ks-profile-logout" onClick={() => { setProfileOpen(false); onLogout(); }}><LogOut size={19}/><span>Keluar dari akun</span></button>}
        </section>, document.body)}
      </header>
      {createPortal(<nav className="ks-bottom-nav" aria-label="Navigasi belanja ponsel">
        <button className={active === 'catalog' && !open ? 'active' : ''} onClick={() => go('catalog')}><ShoppingBag size={21}/><span>Belanja</span></button>
        <button className={open ? 'active' : ''} aria-expanded={open} onClick={() => { setOpen(!open); setProfileOpen(false); }}><Grid2X2 size={21}/><span>Kategori</span></button>
        <button className={active === 'wishlist' ? 'active' : ''} onClick={() => go('wishlist')}><Heart size={21}/><span>Favorit</span>{wishCount > 0 && <b>{wishCount}</b>}</button>
        <button data-cart-target className={active === 'cart' ? 'active' : ''} aria-label={`Keranjang, ${count} barang`} onClick={() => go('cart')}><ShoppingCart size={21}/><span>Keranjang</span>{count > 0 && <b>{count}</b>}</button>
        <button data-profile-area className={profileOpen || active === 'account' ? 'active' : ''} aria-label="Profil" aria-controls="customer-profile-menu" aria-expanded={profileOpen} onClick={() => { setProfileOpen(!profileOpen); setOpen(false); }}><UserRound size={21}/><span>Profil</span></button>
      </nav>, document.body)}
    </>
  );
}
export function StoreFooter({ nav }) {
  return (
    <footer className="ks-simple-footer">
      <Brand />
      <p>Tekstil lembut untuk ruang istirahat yang lebih utuh.</p>
      <nav>
        <button onClick={() => nav("catalog")}>Koleksi</button>
        <button onClick={() => nav("account/orders")}>Pesanan saya</button>
        <button onClick={() => nav("account/profile")}>Akun & bantuan</button>
      </nav>
      <small>© 2026 Kintsugi · Indonesia / IDR</small>
    </footer>
  );
}
