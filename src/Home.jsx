import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Truck,
  ShieldCheck,
  Package,
  Minus,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { assets, colorLabel, money } from "./data";
import { categoryLabel, getMainCategories, mainCategories } from "./catalog";
import { dimensionLabel, parseDimensions } from "./dimensions.js";
import { api } from "./store";
import SizeSummary from "./SizeSummary.jsx";
import VariantSummary from "./VariantSummary.jsx";

export default function Home({ shop, products = [], openProduct, config = {}, onAddToCart, onBuyDirect }) {
  const mainNavItems = getMainCategories(config.categories || mainCategories);

  // Resolusi section produk beranda (dinamis dan full custom)
  const homeSections = Array.isArray(config.homeSections)
    ? config.homeSections
    : [];

  const [extraProducts, setExtraProducts] = useState({});

  useEffect(() => {
    const promoProductIds = (config.promotions || [])
      .map((p) => p.productId)
      .concat(config.promoProductId ? [config.promoProductId] : [])
      .filter((id) => id && !products.some((item) => item.id === id && item.variants) && !extraProducts[id]);

    if (promoProductIds.length === 0) return;

    promoProductIds.forEach((id) => {
      api("/products/" + encodeURIComponent(id))
        .then((fullProd) => {
          if (fullProd && fullProd.id) {
            setExtraProducts((prev) => ({ ...prev, [id]: fullProd }));
          }
        })
        .catch(() => {});
    });
  }, [config.promotions, config.promoProductId, products, extraProducts]);

  // Resolusi multi-promo dinamis dari database (config.promotions) atau fallback legacy
  const promoSlides = React.useMemo(() => {
    if (Array.isArray(config.promotions) && config.promotions.length > 0) {
      return config.promotions.map((p) => {
        const prod = products.find((item) => item.id === p.productId) || extraProducts[p.productId];
        const basePrice = Number(p.basePrice || prod?.price || 0);
        const salePrice = Number(p.price || (prod ? Math.round(basePrice * (100 - Number(p.discountPercent || 0)) / 100) : 0));
        const oldPrice = Number(p.oldPrice || basePrice);
        const customImage = p.image && p.image !== prod?.image ? p.image : null;
        return {
          id: p.id,
          productId: p.productId,
          product: prod,
          eyebrow: p.eyebrow || "SOROTAN PROMO",
          title: p.title || prod?.name || "Penawaran Istimewa",
          description: p.description || "Pilihan istimewa untuk kenyamanan istirahat Anda.",
          customImage,
          image: customImage || prod?.image || assets.editorial,
          price: salePrice,
          oldPrice: oldPrice > salePrice ? oldPrice : 0,
          discountPercent: p.discountPercent || (oldPrice > salePrice && basePrice > 0 ? Math.round((1 - salePrice / basePrice) * 100) : 0),
        };
      });
    }
    if (config.promoTitle || config.promoProductId) {
      const prod = products.find((item) => item.id === config.promoProductId) || extraProducts[config.promoProductId];
      const basePrice = Number(config.promoOldPrice) || Number(prod?.price || 0);
      const salePrice = Number(config.promoPrice) || (basePrice > 0 ? basePrice : 0);
      const customImage = config.promoImage && config.promoImage !== prod?.image ? config.promoImage : null;
      return [{
        id: "legacy-promo",
        productId: config.promoProductId,
        product: prod,
        eyebrow: config.promoKicker || "THE KINTSUGI WAY",
        title: config.promoTitle || "Keindahan ada di setiap cerita.",
        description: config.promoText || "Pilihan tekstil kamar yang lembut untuk ruang istirahat Anda.",
        customImage,
        image: customImage || prod?.image || assets.editorial,
        price: salePrice,
        oldPrice: basePrice > salePrice ? basePrice : 0,
        discountPercent: basePrice > salePrice ? Math.round((1 - salePrice / basePrice) * 100) : 0,
      }];
    }
    return [];
  }, [config.promotions, config.promoTitle, config.promoProductId, config.promoKicker, config.promoText, config.promoImage, config.promoPrice, config.promoOldPrice, products, extraProducts]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = React.useRef(0);
  const touchStartY = React.useRef(0);

  // Auto-play interval jika promo lebih dari 1
  useEffect(() => {
    if (promoSlides.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setActiveSlide((curr) => (curr + 1) % promoSlides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [promoSlides.length, isPaused]);

  // Jeda sementara saat pengguna berinteraksi (klik tombol / swipe)
  const pauseTemporarily = () => {
    setIsPaused(true);
    if (window._promoPauseTimer) clearTimeout(window._promoPauseTimer);
    window._promoPauseTimer = setTimeout(() => setIsPaused(false), 5500);
  };

  const handlePrev = () => {
    pauseTemporarily();
    setActiveSlide((curr) => (curr - 1 + promoSlides.length) % promoSlides.length);
  };

  const handleNext = () => {
    pauseTemporarily();
    setActiveSlide((curr) => (curr + 1) % promoSlides.length);
  };

  const handleTouchStart = (e) => {
    setIsPaused(true);
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    const diffY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        setActiveSlide((curr) => (curr + 1) % promoSlides.length);
      } else {
        setActiveSlide((curr) => (curr - 1 + promoSlides.length) % promoSlides.length);
      }
    }
    pauseTemporarily();
  };
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
          <h1>
            {(config.heroTitle || "Beristirahat.\nLebih dalam.\nSetiap malam.")
              .split("\n")
              .map((line, index) => (
                <span key={index} className="ks-hero-line">
                  {index === 2 ? <em>{line}</em> : line}
                </span>
              ))}
          </h1>
          <p>{config.heroText || "Tekstil kamar yang lembut untuk menjaga setiap momen istirahat."}</p>
          <button type="button" onClick={() => shop("Semua", "Semua")}>
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
      <nav className="ks-quick-links" aria-label="Menu kategori utama di ponsel">
        {mainNavItems.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => shop(m.id, "Semua")}
          >
            {m.label || m.name || m.id} <ArrowUpRight size={14} />
          </button>
        ))}
      </nav>

      {/* Dynamic Product Sections (SLEEP ESSENTIALS concept) */}
      {homeSections.map((section, sIdx) => {
        const rawIds = Array.isArray(section.productIds) ? section.productIds : [];
        const sectionProducts = rawIds
          .map((id) => products.find((item) => item.id === id))
          .filter(Boolean);

        if (sectionProducts.length === 0) return null;

        return (
          <section key={section.id || sIdx} className="ks-section ks-products-section">
            <div className="ks-section-heading">
              <div>
                {section.kicker && <p className="ks-kicker">{section.kicker}</p>}
                <h2>{section.title || "Pilihan Koleksi"}</h2>
              </div>
              <button type="button" onClick={() => shop("Semua", "Semua")}>
                Jelajahi koleksi <ArrowRight size={17} />
              </button>
            </div>
            <div className="ks-home-products">
              {sectionProducts.map((p) => (
                <article key={p.id}>
                  <button
                    type="button"
                    className="ks-home-product-image"
                    onClick={() => openProduct(p)}
                  >
                    <img src={p.image} alt={p.name} loading="lazy" />
                    <span>
                      {p.oldPrice ? "PENAWARAN TERBATAS" : "PILIHAN KOLEKSI"}
                    </span>
                  </button>
                  <VariantSummary
                    colors={p.colors}
                    variationLabel={p.variationLabel || "Warna"}
                  />
                  <small>{categoryLabel(p.category, config.categories).toUpperCase()}</small>
                  <SizeSummary sizes={p.sizes} />
                  <button
                    type="button"
                    className="ks-home-product-name"
                    onClick={() => openProduct(p)}
                  >
                    {p.name}
                  </button>
                  <strong>{money(p.price)}</strong>
                  {p.oldPrice > 0 && <del>{money(p.oldPrice)}</del>}
                  <div className="ks-product-actions">
                    <button type="button" onClick={() => openProduct(p, 'cart')}>+ Keranjang</button>
                    <button type="button" onClick={() => openProduct(p, 'buy')}>Beli langsung</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {promoSlides.length > 0 && (
        <section
          className="ks-story-slider"
          id="promo"
          aria-label="Sorotan Promo dan Cerita Pilihan"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="ks-story-viewport">
            <div
              className="ks-story-track"
              style={{
                transform: promoSlides.length > 1 ? `translateX(-${activeSlide * 100}%)` : "none",
                transition: promoSlides.length > 1 ? "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
              }}
            >
              {promoSlides.map((slide, idx) => (
                <PromoSlideItem
                  key={slide.id || idx}
                  slide={slide}
                  isActive={idx === activeSlide}
                  onBuyDirect={onBuyDirect}
                  onAddToCart={onAddToCart}
                />
              ))}
            </div>
          </div>

          {promoSlides.length > 1 && (
            <div className="ks-story-controls" aria-label="Navigasi Slider Promo">
              <button
                type="button"
                className="ks-story-arrow prev"
                aria-label="Promo sebelumnya"
                onClick={handlePrev}
              >
                <ChevronLeft size={20} />
              </button>

              <div className="ks-story-dots">
                {promoSlides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={"ks-story-dot " + (idx === activeSlide ? "active" : "")}
                    aria-label={`Lihat promo ke-${idx + 1}`}
                    onClick={() => {
                      pauseTemporarily();
                      setActiveSlide(idx);
                    }}
                  />
                ))}
              </div>

              <span className="ks-story-counter">
                <b>{String(activeSlide + 1).padStart(2, "0")}</b> / {String(promoSlides.length).padStart(2, "0")}
              </span>

              <button
                type="button"
                className="ks-story-arrow next"
                aria-label="Promo berikutnya"
                onClick={handleNext}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </section>
      )}
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

function PromoSlideItem({ slide, isActive, onBuyDirect, onAddToCart }) {
  const product = slide.product;
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (product) {
      if (product.colors?.length && !selectedColor) {
        setSelectedColor(product.colors[0]);
      }
      if (product.sizes?.length && !selectedSize) {
        setSelectedSize(product.sizes[0]);
      }
    }
  }, [product]);

  // Compute selected variant and stock
  const currentVariant = product?.variants?.find(
    (v) => (v.color === selectedColor || !v.color) && (v.size === selectedSize || !v.size)
  );

  const currentStock = currentVariant
    ? currentVariant.stock
    : (product?.stock ?? 0);

  // If quantity > stock, adjust
  useEffect(() => {
    if (currentStock > 0 && quantity > currentStock) {
      setQuantity(Math.max(1, currentStock));
    }
  }, [currentStock]);

  const displayImage = slide.customImage
    ? slide.customImage
    : (currentVariant?.image_url || slide.image || product?.image || "/images/seprai/sprei-01.jpg");

  const basePrice = slide.oldPrice > slide.price ? slide.oldPrice : (product?.price || 0);
  const salePrice = slide.price;
  const discountPercent = slide.discountPercent || (basePrice > salePrice && basePrice > 0 ? Math.round((1 - salePrice / basePrice) * 100) : 0);

  return (
    <div
      className={"ks-story-slide " + (isActive ? "active" : "")}
      aria-hidden={!isActive}
    >
      {/* Area Kiri: Gambar Utama Produk / Foto Promo */}
      <div className="ks-story-photo">
        <img
          src={displayImage}
          alt={product?.name || slide.title}
          loading="lazy"
        />
        {discountPercent > 0 && (
          <span className="ks-promo-badge">
            HEMAT {discountPercent}%
          </span>
        )}
      </div>

      {/* Area Kanan: Informasi Promo & Panel Pembelian Langsung */}
      <div className="ks-story-copy">
        <p className="ks-kicker">{slide.eyebrow || "SOROTAN PROMO"}</p>
        <h2>{slide.title}</h2>
        <span className="ks-gold-rule" />
        <p className="ks-promo-slide-desc">{slide.description}</p>

        {/* Tampilan Harga Asli & Promo */}
        <div className="ks-promo-price-block">
          <span className="ks-promo-main-price">{money(salePrice)}</span>
          {basePrice > salePrice && (
            <del className="ks-promo-strike-price">{money(basePrice)}</del>
          )}
          {discountPercent > 0 && (
            <span className="ks-promo-discount-tag">HEMAT {discountPercent}%</span>
          )}
        </div>

        {/* Panel Pembelian Langsung Terintegrasi */}
        <div className="ks-promo-purchase-panel">
          {/* Pilihan Warna / Variasi */}
          {product?.colors?.length > 0 && (
            <div className="ks-promo-field-group">
              <div className="ks-promo-field-header">
                <span>{product.variationLabel || "Pilihan Variasi"}:</span>
                <strong>{colorLabel(selectedColor)}</strong>
              </div>
              <div className="ks-promo-choices-wrap">
                {product.colors.map((c) => {
                  const v = product.variants?.find((item) => item.color === c && item.image_url);
                  const isHex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
                  const isSel = selectedColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`ks-promo-variant-btn ${isSel ? "selected" : ""} ${isHex ? "is-hex" : "is-text"}`}
                      style={isHex ? { background: c } : undefined}
                      title={colorLabel(c)}
                      onClick={() => setSelectedColor(c)}
                      aria-label={colorLabel(c)}
                    >
                      {v?.image_url && (
                        <img src={v.image_url} alt="" className="ks-promo-variant-thumb" />
                      )}
                      {!isHex && <span>{c}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pilihan Ukuran */}
          {product?.sizes?.length > 0 && (
            <div className="ks-promo-field-group">
              <div className="ks-promo-field-header">
                <span>Ukuran:</span>
                <strong>{dimensionLabel(selectedSize)}</strong>
              </div>
              <div className="ks-promo-choices-wrap">
                {product.sizes.map((s) => {
                  const dims = parseDimensions(s);
                  const isSel = selectedSize === s;
                  const isAvail = !product.variants || product.variants.some((v) => v.size === s && (v.color === selectedColor || !selectedColor) && v.stock > 0);
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!isAvail}
                      className={`ks-promo-size-btn ${isSel ? "selected" : ""} ${!isAvail ? "disabled" : ""}`}
                      onClick={() => setSelectedSize(s)}
                      title={!isAvail ? "Stok habis untuk ukuran ini" : `Pilih ukuran ${s}`}
                    >
                      {dims ? (
                        <span className="ks-promo-dim-vals">
                          <b>{dims.length}</b>×<b>{dims.width}</b>×<b>{dims.height}</b>
                          <small>cm</small>
                        </span>
                      ) : (
                        <span>{s}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Jumlah & Stok */}
          <div className="ks-promo-qty-stock-row">
            <div className="ks-promo-qty-group">
              <span className="ks-promo-qty-label">Jumlah:</span>
              <div className="ks-promo-stepper">
                <button
                  type="button"
                  disabled={quantity <= 1 || currentStock < 1}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  aria-label="Kurangi jumlah"
                >
                  <Minus size={14} />
                </button>
                <span className="ks-promo-qty-num">{quantity}</span>
                <button
                  type="button"
                  disabled={quantity >= Math.min(99, currentStock) || currentStock < 1}
                  onClick={() => setQuantity(Math.min(99, currentStock, quantity + 1))}
                  aria-label="Tambah jumlah"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="ks-promo-stock-box">
              {currentStock > 0 ? (
                <span className="ks-promo-stock-pill in-stock">
                  <ShieldCheck size={14} />
                  <span>Tersedia {currentStock} pcs</span>
                </span>
              ) : (
                <span className="ks-promo-stock-pill out-of-stock">
                  Stok Habis
                </span>
              )}
            </div>
          </div>

          {/* Dua Tombol Aksi Pembelian */}
          <div className="ks-promo-btn-actions">
            <button
              type="button"
              className="ks-promo-buy-btn"
              disabled={!product || currentStock < 1}
              onClick={() => {
                if (!product) return;
                const key = `${product.id}:${selectedSize}:${selectedColor}`;
                onBuyDirect?.({
                  ...product,
                  price: salePrice,
                  oldPrice: basePrice > salePrice ? basePrice : 0,
                  stock: currentStock,
                  key,
                  size: selectedSize,
                  color: selectedColor,
                  quantity,
                });
              }}
            >
              <span>Beli Langsung</span>
              <ArrowRight size={17} />
            </button>

            <button
              type="button"
              className="ks-promo-cart-btn"
              disabled={!product || currentStock < 1}
              onClick={(e) => {
                if (!product) return;
                const key = `${product.id}:${selectedSize}:${selectedColor}`;
                onAddToCart?.({
                  ...product,
                  price: salePrice,
                  oldPrice: basePrice > salePrice ? basePrice : 0,
                  stock: currentStock,
                  key,
                  size: selectedSize,
                  color: selectedColor,
                  quantity,
                }, e.currentTarget);
              }}
            >
              <ShoppingBag size={17} />
              <span>Tambah Keranjang</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
