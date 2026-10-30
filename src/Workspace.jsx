import React from "react";
import { ArrowLeft, LogOut, Menu, X } from "lucide-react";
import Brand from "./Brand";
export default function Workspace({
  user,
  admin = false,
  items,
  active,
  onSelect,
  onLogout,
  children,
  title,
  subtitle,
  actions,
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={"workspace " + (admin ? "ws-admin" : "ws-customer")}>
      <aside className={"ws-sidebar " + (open ? "is-open" : "")}>
        <a className="ws-logo" href={admin ? "#admin" : "#account"}>
          <Brand />
          <div>
            <small>{admin ? "ADMINISTRATION" : "AKUN PELANGGAN"}</small>
          </div>
        </a>
        <p className="ws-nav-caption">{admin ? "RUANG KERJA" : "MENU AKUN"}</p>
        <nav aria-label={admin ? "Navigasi admin" : "Navigasi akun"}>
          {items.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              className={active === id ? "active" : ""}
              aria-current={active === id ? "page" : undefined}
              onClick={() => {
                onSelect(id);
                setOpen(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {count > 0 && <b>{count}</b>}
            </button>
          ))}
        </nav>
        <div className="ws-sidebar-bottom">
          {!admin && (
            <a href="#catalog">
              <ArrowLeft size={18} /> Kembali ke katalog
            </a>
          )}
          <button onClick={onLogout}>
            <LogOut size={18} />
            Keluar dari akun
          </button>
          <small>
            {admin
              ? "Akun ini digunakan untuk pengelolaan toko."
              : "Favorit, pesanan, dan informasi Anda."}
          </small>
        </div>
      </aside>
      {open && (
        <button
          className="ws-mobile-backdrop"
          aria-label="Tutup navigasi"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="ws-main">
        <header className="ws-topbar">
          <button
            className="ws-menu-toggle"
            aria-label={open ? "Tutup menu" : "Buka menu akun"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <span>{admin ? "Pusat pengelolaan toko" : "Ruang pelanggan"}</span>
          <div className="ws-user">
            <span className="ws-avatar">
              {user?.name?.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <b>{user?.name}</b>
              <small>{admin ? "Administrator" : "Pelanggan"}</small>
            </div>
          </div>
        </header>
        <main className="ws-content">
          <div className="ws-page-heading">
            <div>
              <p className="ws-kicker">
                {admin ? "KINTSUGI / OPERASIONAL" : "AKUN SAYA"}
              </p>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {actions}
          </div>
          {children}
        </main>
        <footer className="ws-footer">
          © 2026 Kintsugi{" "}
          <span>{admin ? "Panel administrator" : "Pusat akun pelanggan"}</span>
        </footer>
      </div>
    </div>
  );
}
export function Notice({ children, type = "error" }) {
  return children ? (
    <div
      className={"ws-notice " + type}
      role={type === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  ) : null;
}
export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="ws-empty">
      {Icon && (
        <span>
          <Icon size={28} />
        </span>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Status({ children, tone = "" }) {
  return <span className={"ws-status " + tone}>{children}</span>;
}
