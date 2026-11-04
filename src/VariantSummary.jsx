import React from "react";
import { colorLabel } from "./data";

export default function VariantSummary({
  colors = [],
  variationLabel = "Pilihan variasi",
  maxVisible = 3,
}) {
  if (!colors || colors.length === 0) return null;

  const visible = colors.slice(0, maxVisible);
  const remaining = Math.max(0, colors.length - visible.length);

  return (
    <div
      className="product-variant-summary swatches"
      aria-label={`${variationLabel}: ${colors.map(colorLabel).join(", ")}`}
    >
      <small className="product-variant-label">{variationLabel}</small>
      <div className="variant-chips-wrapper">
        {visible.map((c) => {
          const isHex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
          const label = colorLabel(c);
          return isHex ? (
            <span
              key={c}
              className="ks-variant-swatch"
              style={{ background: c }}
              title={label}
              aria-label={label}
            />
          ) : (
            <span
              key={c}
              className="ks-variant-chip"
              title={label}
            >
              {label}
            </span>
          );
        })}
        {remaining > 0 && (
          <span
            className="ks-variant-more"
            title={`${remaining} variasi lainnya`}
          >
            +{remaining} lainnya
          </span>
        )}
      </div>
    </div>
  );
}
