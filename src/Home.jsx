import React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Truck,
  ShieldCheck,
  Package,
} from "lucide-react";
import { assets, colorLabel, money } from "./data";
import { categoryLabel } from "./catalog";
import SizeSummary from "./SizeSummary.jsx";
const categoryTiles = [
  ["Sprei Fitted", assets.fitted, "Sprei berkaret yang membungkus spring bed dengan rapi."],
  ["Set Sprei", assets.sheets, "Paket sprei dan sarung bantal yang serasi."],
  ["Sprei Karet", assets.stripe, "Pilihan sprei praktis untuk pemakaian harian."],
  ["Sprei Hotel", assets.hotel, "Tampilan rapi dan nyaman untuk kamar inap."],
  ["Sarung Bantal & Guling", assets.pillow, "Pelengkap tempat tidur dengan warna senada."],
  ["Sprei Motif", assets.kids, "Pilihan motif untuk suasana kamar yang lebih personal."],
  ["Pelindung Kasur", assets.protector, "Lapisan pelindung untuk menjaga kasur."],
];
export default function Home({ shop, products, openProduct }) {
  return (
    <main className="ks-home">
      <section className="ks-hero">
        <img
          src={assets.hero}
          alt="Kamar tidur dengan tekstil lembut pilihan Kintsugi"
          fetchPriority="high"
        />
        <div className="ks-hero-shade" />
        <div className="ks-hero-content">
          <span className="ks-kicker">KINTSUGI / BEDROOM COLLECTION</span>
          <h1>
            Beristirahat.
            <br />
            Lebih dalam.
            <br />
            <em>Setiap malam.</em>
          </h1>
          <p>Tekstil kamar yang lembut untuk menjaga setiap momen istirahat.</p>
          <button onClick={() => shop()}>
            JELAJAHI KOLEKSI <ArrowRight size={19} />
          </button>
          <span className="ks-hero-caption">
            Lembut, tenang, dan dirancang untuk tidur yang utuh.
          </span>
        </div>
        <div className="ks-hero-index">
          <span>01</span>
          <i />
          <span>SLEEP, REFINED.</span>
        </div>
      </section>
      <nav className="ks-quick-links" aria-label="Pilihan koleksi">
        {[
          "Produk Baru",
          "Penawaran Terbatas",
          "Sprei Fitted",
          "Set Sprei",
          "Sprei Karet",
          "Sprei Hotel",
        ].map((c) => (
          <button key={c} onClick={() => shop(c)}>
            {c === "Produk Baru" || c === "Penawaran Terbatas" ? c : categoryLabel(c)} <ArrowUpRight size={15} />
          </button>
        ))}
      </nav>
      <section className="ks-section ks-department-section">
        <div className="ks-section-heading">
          <div>
            <p className="ks-kicker">TEMUKAN PILIHAN ANDA</p>
            <h2>Untuk setiap ruang. Untuk istirahat yang utuh.</h2>
          </div>
          <button onClick={() => shop()}>
            Lihat semua <ArrowRight size={17} />
          </button>
        </div>
        <div className="ks-department-grid ks-product-category-grid">
          {categoryTiles.map(([category, image, description]) => (
            <button key={category} onClick={() => shop(category)}>
              <div>
                <img src={image} alt={category} loading="lazy" />
              </div>
              <h3>
                {categoryLabel(category).toUpperCase()} <ArrowUpRight size={19} />
              </h3>
              <p>{description}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="ks-section ks-products-section">
        <div className="ks-section-heading">
          <div>
            <p className="ks-kicker">SLEEP ESSENTIALS</p>
            <h2>Pilihan untuk tidur yang lebih baik.</h2>
          </div>
          <button onClick={() => shop()}>
            Jelajahi koleksi <ArrowRight size={17} />
          </button>
        </div>
        <div className="ks-home-products">
          {products.slice(0, 4).map((p) => (
            <article key={p.id}>
              <button
                className="ks-home-product-image"
                onClick={() => openProduct(p)}
              >
                <img src={p.image} alt={p.name} loading="lazy" />
                <span>
                  {p.oldPrice ? "PENAWARAN TERBATAS" : "PILIHAN KINTSUGI"}
                </span>
              </button>
              <div className="swatches">
                {p.colors.map((c) => (
                  <span key={c} style={{ background: c }} title={colorLabel(c)} />
                ))}
              </div>
              <small>{categoryLabel(p.category).toUpperCase()} · {colorLabel(p.colors[0])}</small>
              <SizeSummary sizes={p.sizes} />
              <button
                className="ks-home-product-name"
                onClick={() => openProduct(p)}
              >
                {p.name}
              </button>
              <strong>{money(p.price)}</strong>
              {p.oldPrice > 0 && <del>{money(p.oldPrice)}</del>}
              <div className="ks-product-actions"><button onClick={() => openProduct(p, 'cart')}>+ Keranjang</button><button onClick={() => openProduct(p, 'buy')}>Beli langsung</button></div>
            </article>
          ))}
        </div>
      </section>
      <section className="ks-story">
        <div className="ks-story-photo">
          <img
            src={assets.editorial}
            alt="Detail tekstil kamar tidur Kintsugi"
            loading="lazy"
          />
        </div>
        <div className="ks-story-copy">
          <p className="ks-kicker">THE KINTSUGI WAY</p>
          <h2>
            Keindahan ada
            <br />
            di setiap cerita.
          </h2>
          <span className="ks-gold-rule" />
          <p>
            Terinspirasi dari seni merangkai kembali, Kintsugi merayakan ruang
            istirahat yang terasa utuh. Mulai dari tekstil yang menyentuh hari
            Anda paling awal dan paling akhir.
          </p>
          <button onClick={() => shop()}>
            TEMUKAN KOLEKSI KAMAR <ArrowRight size={18} />
          </button>
        </div>
      </section>
      <section className="ks-benefits">
        {[
          [Truck, "Dikirim ke pintu Anda", "Gratis ongkir mulai Rp699.000"],
          [ShieldCheck, "Pembayaran aman", "Transfer bank, QRIS & dompet digital"],
          [
            Package,
            "Belanja tanpa terburu-buru",
            "Pilihan Anda tersimpan di browser",
          ],
        ].map(([Icon, title, detail]) => (
          <div key={title}>
            <Icon size={25} />
            <div>
              <b>{title}</b>
              <p>{detail}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
