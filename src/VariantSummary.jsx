import React from "react";
import { resolveVariationDisplayMode } from "./variant-utils.js";

/**
 * Renders a strictly uniform variation selector/summary for catalog and home cards.
 * Never mixes color swatches, thumbnails, and text chips within the same group.
 */
export default function VariantSummary({
  colors = [],
  variants = [],
  variationLabel = "Pilihan variasi",
  selectedColor = "",
  onSelectColor,
  maxVisible = 4,
}) {
  const { mode, items } = resolveVariationDisplayMode(colors, variants, variationLabel);
  if (!items.length) return null;

  const visible = items.slice(0, maxVisible);
  const remaining = Math.max(0, items.length - visible.length);
  const activeItem =
    items.find((item) => item.value === selectedColor) || items[0] || null;
  const interactive = typeof onSelectColor === "function";

  const renderItem = (item) => {
    const isActive = Boolean(activeItem && item.value === activeItem.value);
    const commonProps = {
      key: item.value,
      title: item.label,
      "aria-label": `${variationLabel} ${item.label}`,
    };

    const classFor = (baseClass) =>
      `${baseClass}${interactive ? " is-interactive" : ""}${isActive ? " is-active" : ""}`;

    if (mode === "swatch") {
      if (interactive) {
        return (
          <button
            type="button"
            {...commonProps}
            aria-pressed={isActive}
            className={classFor("ks-variant-swatch")}
            style={{ background: item.hex }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectColor(item.value);
            }}
          />
        );
      }
      return (
        <span
          {...commonProps}
          className={classFor("ks-variant-swatch")}
          style={{ background: item.hex }}
        />
      );
    }

    if (mode === "thumbnail") {
      const content = (
        <>
          <img src={item.thumb} alt={item.label} loading="lazy" />
          <span>{item.label}</span>
        </>
      );
      if (interactive) {
        return (
          <button
            type="button"
            {...commonProps}
            aria-pressed={isActive}
            className={classFor("ks-variant-thumb-btn")}
            onClick={(e) => {
              e.stopPropagation();
              onSelectColor(item.value);
            }}
          >
            {content}
          </button>
        );
      }
      return (
        <span {...commonProps} className={classFor("ks-variant-thumb-btn")}>
          {content}
        </span>
      );
    }

    if (interactive) {
      return (
        <button
          type="button"
          {...commonProps}
          aria-pressed={isActive}
          className={classFor("ks-variant-chip")}
          onClick={(e) => {
            e.stopPropagation();
            onSelectColor(item.value);
          }}
        >
          {item.label}
        </button>
      );
    }

    return (
      <span {...commonProps} className={classFor("ks-variant-chip")}>
        {item.label}
      </span>
    );
  };

  return (
    <div
      className={`product-variant-summary swatches mode-${mode}`}
      aria-label={`${variationLabel}: ${items.map((item) => item.label).join(", ")}`}
    >
      <small className="product-variant-label">
        {variationLabel}
        {interactive && activeItem ? `: ${activeItem.label}` : ""}
      </small>
      <div className="variant-chips-wrapper">
        {visible.map(renderItem)}
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
