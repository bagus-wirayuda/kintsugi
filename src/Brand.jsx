import React from "react";

const DEFAULT_LOGO = "/brand/kintsugi-logo-transparent-v2.png";

export default function Brand({ className = "", src, alt = "Kintsugi", ...props }) {
  const resolvedSrc = src && typeof src === "string" && src.trim() !== "" ? src.trim() : DEFAULT_LOGO;

  return (
    <img
      className={"kintsugi-logo " + className}
      src={resolvedSrc}
      alt={alt || "Kintsugi"}
      onError={(e) => {
        if (!e.currentTarget.dataset.fallback) {
          e.currentTarget.dataset.fallback = "true";
          e.currentTarget.src = DEFAULT_LOGO;
        }
      }}
      {...props}
    />
  );
}
