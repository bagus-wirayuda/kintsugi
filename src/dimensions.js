export function parseDimensions(value) {
  const parts = String(value ?? "")
    .trim()
    .split(/[×xX]/)
    .map((part) => Number(part.trim()));
  if (parts.length === 2) parts.push(30);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 1 || part > 500))
    return null;
  return { length: parts[0], width: parts[1], height: parts[2] };
}

export function dimensionLabel(value) {
  const dimensions = parseDimensions(value);
  return dimensions
    ? `${dimensions.length} × ${dimensions.width} × ${dimensions.height} cm`
    : String(value ?? "");
}

export function dimensionValue(length, width, height) {
  const dimensions = [length, width, height].map((part) => Number(part));
  if (dimensions.some((part) => !Number.isInteger(part) || part < 1 || part > 500)) return "";
  return dimensions.join("×");
}
