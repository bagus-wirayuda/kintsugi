import React from "react";
import { dimensionLabel } from "./dimensions.js";

export default function SizeSummary({ sizes = [] }) {
  const visible = sizes.slice(0, 2);
  const remaining = Math.max(0, sizes.length - visible.length);
  return (
    <div className="product-size-summary" aria-label={`Ukuran tersedia: ${sizes.map(dimensionLabel).join(", ")}`}>
      <small>Ukuran tersedia</small>
      <div>
        {visible.map((size) => <span key={size}>{dimensionLabel(size)}</span>)}
        {remaining > 0 && <span className="more-sizes">+{remaining} ukuran</span>}
      </div>
    </div>
  );
}
