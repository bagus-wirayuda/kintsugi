import React, { useEffect, useState } from "react";
import { dimensionLabel } from "./dimensions";
import {
  BEDDING_ACCESSORY_GUIDE,
  BEDDING_MATTRESS_GUIDE,
  FASHION_BOTTOMS_GUIDE,
  FASHION_LOUNGE_GUIDE,
  FASHION_TOPS_GUIDE,
  detectFashionSubgroup,
  detectSizeGuideCategory,
  sizesMatch,
} from "./size-guide";

/**
 * Category-aware size guide dialog body used on desktop and mobile.
 * Separates Bedding (mattresses, sheets, blankets) and Fashion (tops, bottoms, loungewear)
 * and highlights sizes available on the active product.
 */
export function SizeGuideContent({ product = null, activeCategory = "Semua" }) {
  const initialTab = detectSizeGuideCategory(product, activeCategory);
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(detectSizeGuideCategory(product, activeCategory));
  }, [product?.id, product?.category, product?.subcategory, activeCategory]);

  const productSizes = Array.isArray(product?.sizes) ? product.sizes : [];
  const hasMatch = (candidate) => productSizes.some((s) => sizesMatch(s, candidate));
  const fashionSubgroup = detectFashionSubgroup(product);

  const topsSection = (
    <div className="size-guide-block" key="tops">
      <h3>Atasan (Kaos, Kemeja, Dress, Outerwear)</h3>
      <p className="size-guide-note">
        Diukur dalam kondisi pakaian terbentang datar (sentimeter). Toleransi jahitan ±1–2 cm.
      </p>
      <div className="size-guide-table-wrap">
        <table className="size-guide-table">
          <thead>
            <tr>
              <th>Ukuran</th>
              <th>Lingkar Dada</th>
              <th>Lebar Bahu</th>
              <th>Panjang Baju</th>
              <th>Estimasi BB</th>
            </tr>
          </thead>
          <tbody>
            {FASHION_TOPS_GUIDE.map((row) => (
              <tr key={row.size} className={hasMatch(row.size) ? "is-match" : ""}>
                <td><strong>{row.size}</strong></td>
                <td>{row.chest}</td>
                <td>{row.shoulder}</td>
                <td>{row.length}</td>
                <td>{row.weightHint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const bottomsSection = (
    <div className="size-guide-block" key="bottoms">
      <h3>Celana & Bawahan</h3>
      <p className="size-guide-note">
        Ukur lingkar pinggang tepat di atas tulang pinggul. Pilih 1 nomor lebih besar untuk potongan lebih santai.
      </p>
      <div className="size-guide-table-wrap">
        <table className="size-guide-table">
          <thead>
            <tr>
              <th>Nomor</th>
              <th>Lingkar Pinggang</th>
              <th>Lingkar Pinggul</th>
              <th>Panjang</th>
              <th>Setara</th>
            </tr>
          </thead>
          <tbody>
            {FASHION_BOTTOMS_GUIDE.map((row) => (
              <tr key={row.size} className={hasMatch(row.size) ? "is-match" : ""}>
                <td><strong>{row.size}</strong></td>
                <td>{row.waist}</td>
                <td>{row.hip}</td>
                <td>{row.length}</td>
                <td>{row.fit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const loungeSection = (
    <div className="size-guide-block" key="lounge">
      <h3>Piyama & Loungewear</h3>
      <p className="size-guide-note">
        Menggunakan karet pinggang fleksibel serta potongan santai yang nyaman untuk penggunaan di rumah maupun tidur.
      </p>
      <div className="size-guide-table-wrap">
        <table className="size-guide-table">
          <thead>
            <tr>
              <th>Ukuran</th>
              <th>Lingkar Dada</th>
              <th>Lingkar Pinggang</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {FASHION_LOUNGE_GUIDE.map((row) => (
              <tr key={row.size} className={hasMatch(row.size) ? "is-match" : ""}>
                <td><strong>{row.size}</strong></td>
                <td>{row.chest}</td>
                <td>{row.waist}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const orderedFashionSections =
    fashionSubgroup === "bottoms"
      ? [bottomsSection, topsSection, loungeSection]
      : fashionSubgroup === "lounge"
        ? [loungeSection, topsSection, bottomsSection]
        : [topsSection, bottomsSection, loungeSection];

  return (
    <div className="size-guide">
      <div className="size-guide-tabs" role="tablist" aria-label="Kategori panduan ukuran">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "fashion"}
          className={tab === "fashion" ? "active" : ""}
          onClick={() => setTab("fashion")}
        >
          Fashion & Pakaian
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "bedding"}
          className={tab === "bedding" ? "active" : ""}
          onClick={() => setTab("bedding")}
        >
          Bedding & Kasur
        </button>
      </div>

      {product && (
        <div className="size-guide-context">
          <strong>{product.name}</strong>
          {productSizes.length > 0 && (
            <div className="size-guide-chips">
              <span>Tersedia untuk produk ini:</span>
              {productSizes.map((s) => (
                <span key={s} className="size-guide-chip">
                  {dimensionLabel(s) !== String(s) ? dimensionLabel(s) : s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "fashion" ? (
        <div className="size-guide-panel" role="tabpanel">
          {orderedFashionSections}
        </div>
      ) : (
        <div className="size-guide-panel" role="tabpanel">
          <div className="size-guide-block">
            <h3>Seprai, Bed Cover & Pelindung Kasur</h3>
            <p className="size-guide-note">
              Pilih ukuran yang sesuai dengan panjang, lebar, dan tinggi kasur (spring bed / busa) Anda. Semua ukuran dalam sentimeter (cm).
            </p>
            <div className="size-guide-table-wrap">
              <table className="size-guide-table">
                <thead>
                  <tr>
                    <th>Ukuran</th>
                    <th>Nama Umum</th>
                    <th>Lebar</th>
                    <th>Panjang</th>
                    <th>Tinggi Kasur</th>
                  </tr>
                </thead>
                <tbody>
                  {BEDDING_MATTRESS_GUIDE.map((row) => {
                    const baseDim = row.size.replace(/×30$/, "");
                    const matched =
                      hasMatch(row.size) ||
                      productSizes.some((s) => String(s).replace(/×/g, "x").startsWith(baseDim.replace(/×/g, "x")));
                    return (
                      <tr key={row.size} className={matched ? "is-match" : ""}>
                        <td><strong>{baseDim}</strong></td>
                        <td>{row.alias}</td>
                        <td>{row.width}</td>
                        <td>{row.length}</td>
                        <td>{row.height}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="size-guide-block">
            <h3>Selimut, Sarung Bantal & Perlengkapan Bayi</h3>
            <p className="size-guide-note">
              Panduan ukuran bantal guling, selimut/quilt, serta sprei boks bayi.
            </p>
            <div className="size-guide-table-wrap">
              <table className="size-guide-table">
                <thead>
                  <tr>
                    <th>Opsi Ukuran</th>
                    <th>Jenis</th>
                    <th>Dimensi</th>
                    <th>Rekomendasi</th>
                  </tr>
                </thead>
                <tbody>
                  {BEDDING_ACCESSORY_GUIDE.map((row) => (
                    <tr key={row.size} className={hasMatch(row.size) ? "is-match" : ""}>
                      <td><strong>{row.size}</strong></td>
                      <td>{row.category}</td>
                      <td>{row.dim}</td>
                      <td>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
