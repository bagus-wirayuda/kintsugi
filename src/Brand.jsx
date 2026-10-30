import React from "react";
export default function Brand({ className = "", ...props }) {
  return (
    <img
      className={"kintsugi-logo " + className}
      src="/brand/kintsugi-logo-transparent-v2.png"
      alt="Kintsugi"
      {...props}
    />
  );
}
