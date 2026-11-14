import React from "react";

export default function Brand({ className = "", src, alt = "PT Liny Jaya", ...props }) {
  if (src && typeof src === "string" && src.trim() !== "") {
    return (
      <img
        className={"kintsugi-logo " + className}
        src={src.trim()}
        alt={alt || "PT Liny Jaya"}
        onError={(e) => {
          e.currentTarget.style.display = "none";
          if (e.currentTarget.nextElementSibling) {
            e.currentTarget.nextElementSibling.style.display = "inline-block";
          }
        }}
        {...props}
      />
    );
  }

  return (
    <span
      className={"ks-brand-text " + className}
      style={{
        fontWeight: 800,
        fontSize: "1.2rem",
        letterSpacing: "0.06em",
        color: "#0f172a",
        textTransform: "uppercase",
        display: "inline-block",
      }}
    >
      {alt || "PT LINY JAYA"}
    </span>
  );
}
