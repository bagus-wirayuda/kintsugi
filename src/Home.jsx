import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
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
export default function Home({ shop, products, openProduct, config = {} }) {
  const promotions = Array.isArray(config.promotions) ? config.promotions : [];
  const [promoIndex, setPromoIndex] = useState(0);
  useEffect(() => {
    setPromoIndex(0);
    if (promotions.length < 2) return;
    const timer = setInterval(() => setPromoIndex((index) => (index + 1) % promotions.length), 6500);
    return () => clearInterval(timer);
  }, [promotions.length]);
  const departments = (config.categories?.length ? config.categories : categoryTiles.map(([id]) => ({ id, label: categoryLabel(id, config.categories) }))).filter((item) => item.id !== "Semua");
  const selectedProducts = Array.isArray(config.essentialsProducts) && config.essentialsProducts.length
    ? config.essentialsProducts.map((id) => products.find((item) => item.id === id)).filter(Boolean)
    : products.slice(0, 4);
  const selectedDepartments = Array.isArray(config.departmentProducts) && config.departmentProducts.length
    ? config.departmentProducts.map((id) => products.find((item) => item.id === id)).filter(Boolean)
    : [];
  const activePromotion = promotions.length ? promotions[promoIndex % promotions.length] : null;
  const promoProduct = products.find((item) => item.id === (activePromotion?.productId || config.promoProductId));
  const promoImage = activePromotion?.image || config.promoImage || promoProduct?.image || assets.editorial;
  const promoPrice = activePromotion?.price ?? (Number(config.promoPrice) || promoProduct?.price || 0);
  const promoOldPrice = activePromotion?.oldPrice ?? (config.promoOldPrice != null ? Number(config.promoOldPrice) : promoProduct?.oldPrice || 0);
  const promoKicker = activePromotion?.eyebrow || config.promoKicker || "THE KINTSUGI WAY";
  const promoTitle = activePromotion?.title || config.promoTitle || "Keindahan ada di setiap cerita.";
  const promoText = activePromotion?.description || config.promoText || "Pilihan tekstil kamar yang lembut untuk ruang istirahat Anda.";
  return (
    <main className="ks-home">
      <section className="ks-hero">
        <img
          src={config.heroImage || assets.hero}
          alt="Kamar tidur dengan tekstil lembut pilihan Kintsugi"
          fetchPriority="high"
        />
        <div className="ks-hero-shade" />
        <div className="ks-hero-content">
          <span className="ks-kicker">{config.heroKicker || "KINTSUGI / BEDROOM COLLECTION"}</span>
          <h1>{(config.heroTitle || "Beristirahat.\nLebih dalam.\nSetiap malam.").split("\n").map((line, index) => <React.Fragment key={index}>{index > 0 && <br />}{index === 2 ? <em>{line}</em> : line}</React.Fragment>)}</h1>
          <p>{config.heroText || "Tekstil kamar yang lembut untuk menjaga setiap momen istirahat."}</p>
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
          <span>{config.brand || "SLEEP, REFINED."}</span>
        </div>
      </section>
      <nav className="ks-quick-links" aria-label="Pilihan koleksi">
        {[
          "Produk Baru",
          "Penawaran Terbatas",
          ...departments.slice(0, 4).map((item) => item.id),
        ].map((c) => (
          <button key={c} onClick={() => shop(c)}>
            {c === "Produk Baru" || c === "Penawaran Terbatas" ? c : categoryLabel(c, config.categories)} <ArrowUpRight size={15} />
          </button>
        ))}
      </nav>
      <section className="ks-section ks-department-section">
        <div className="ks-section-heading">
          <div>
            <p className="ks-kicker">{config.departmentKicker || "TEMUKAN PILIHAN ANDA"}</p>
            <h2>{config.departmentTitle || "Untuk setiap ruang. Untuk istirahat yang utuh."}</h2>
          </div>
          <button onClick={() => shop()}>
            Lihat semua <ArrowRight size={17} />
          </button>
        </div>
        <div className="ks-department-grid ks-product-category-grid">
          {selectedDepartments.length ? selectedDepartments.map((product) => <button key={product.id} onClick={() => openProduct(product)}><div><img src={product.image} alt={product.name} loading="lazy" /></div><h3>{product.name.toUpperCase()} <ArrowUpRight size={19} /></h3><p>{product.motif || product.description}</p></button>) : departments.map((category) => {
            const product = products.find((item) => item.category === category.id);
            const legacy = categoryTiles.find(([id]) => id === category.id);
            const image = product?.image || legacy?.[1] || assets.hero;
            const description = product?.description || legacy?.[2] || `Jelajahi koleksi ${category.label}.`;
            return <button key={category.id} onClick={() => shop(category.id)}><div><img src={image} alt={category.label} loading="lazy" /></div><h3>{category.label.toUpperCase()} <ArrowUpRight size={19} /></h3><p>{description}</p></button>;
          })}
        </div>
      </section>
      <section className="ks-section ks-products-section">
        <div className="ks-section-heading">
          <div>
            <p className="ks-kicker">{config.essentialsKicker || "SLEEP ESSENTIALS"}</p>
            <h2>{config.essentialsTitle || "Pilihan untuk tidur yang lebih baik."}</h2>
          </div>
          <button onClick={() => shop()}>
            Jelajahi koleksi <ArrowRight size={17} />
          </button>
        </div>
        <div className="ks-home-products">
          {selectedProducts.map((p) => (
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
              <small>{categoryLabel(p.category, config.categories).toUpperCase()} · {colorLabel(p.colors[0])}</small>
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
      <section className="ks-story" id="promo">
        <div className="ks-story-photo">
          <img
            src={promoImage}
            alt={promoProduct?.name || "Koleksi pilihan toko"}
            loading="lazy"
          />
        </div>
        <div className="ks-story-copy">
          <p className="ks-kicker">{promoKicker}</p>
          <h2>{promoTitle}</h2>
          <span className="ks-gold-rule" />
          <p>{promoText}</p>
          {activePromotion && <span className="ks-promo-badge">DISKON {activePromotion.discountPercent}%</span>}
          {promoProduct && <button className="ks-promo-product" onClick={() => openProduct(promoProduct)}>{promoProduct.name}<strong>{money(promoPrice)}</strong>{promoOldPrice > promoPrice && <del>{money(promoOldPrice)}</del>}</button>}
          <button onClick={() => shop()}>
            TEMUKAN KOLEKSI KAMAR <ArrowRight size={18} />
          </button>
          {promotions.length > 1 && <div className="ks-promo-controls" aria-label="Navigasi promo"><button aria-label="Promo sebelumnya" onClick={()=>setPromoIndex((index)=>(index-1+promotions.length)%promotions.length)}><ChevronLeft size={18}/></button><span>{promoIndex+1} / {promotions.length}</span><button aria-label="Promo berikutnya" onClick={()=>setPromoIndex((index)=>(index+1)%promotions.length)}><ChevronRight size={18}/></button></div>}
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
