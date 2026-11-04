import React, { useState, useEffect, useRef, useLayoutEffect, forwardRef } from "react";
import { parseRupiah, formatRupiahInput } from "./rupiah.js";

/**
 * Reusable RupiahInput Component
 *
 * Features:
 * - Real-time thousand-separator formatting as user types (e.g. 1.000, 150.000, 1.000.000).
 * - Preserves cursor position seamlessly when typing or deleting characters.
 * - Handles Backspace & Delete without cursor jamming at thousand-separator dots.
 * - Exposes clean numeric integer via hidden input when inside standard HTML forms.
 * - Supports controlled (value + onChange/onValueChange) and uncontrolled (defaultValue) modes.
 * - Automatically formats initial / default values.
 */
export const RupiahInput = forwardRef(function RupiahInput(
  {
    name,
    id,
    value,
    defaultValue,
    onChange,
    onValueChange,
    placeholder = "0",
    prefix = null,
    min,
    max,
    required = false,
    disabled = false,
    readOnly = false,
    className = "",
    wrapperClassName = "",
    style,
    autoFocus = false,
    "aria-label": ariaLabel,
    ...restProps
  },
  ref
) {
  const isControlled = value !== undefined;
  const initialFormatted = () => {
    const initVal = isControlled ? value : defaultValue;
    return initVal !== undefined && initVal !== null && initVal !== ""
      ? formatRupiahInput(initVal)
      : "";
  };

  const [displayValue, setDisplayValue] = useState(initialFormatted);
  const internalRef = useRef(null);
  const inputRef = ref || internalRef;
  const cursorRef = useRef(null);

  // Synchronize controlled value changes
  useEffect(() => {
    if (isControlled) {
      const nextFormatted = value !== null && value !== undefined && value !== ""
        ? formatRupiahInput(value)
        : "";
      setDisplayValue(nextFormatted);
    }
  }, [value, isControlled]);

  // Synchronize defaultValue changes (e.g. switching products to edit)
  useEffect(() => {
    if (!isControlled && defaultValue !== undefined) {
      const nextFormatted = defaultValue !== null && defaultValue !== ""
        ? formatRupiahInput(defaultValue)
        : "";
      setDisplayValue(nextFormatted);
    }
  }, [defaultValue, isControlled]);

  // Restore cursor position after formatting render
  useLayoutEffect(() => {
    if (cursorRef.current !== null && inputRef.current) {
      const pos = Math.min(cursorRef.current, inputRef.current.value.length);
      inputRef.current.setSelectionRange(pos, pos);
      cursorRef.current = null;
    }
  }, [displayValue, inputRef]);

  const numericValue = parseRupiah(displayValue);

  const applyNewValue = (rawValue, oldCursorPos) => {
    // Calculate how many digits were before the cursor in the unformatted string
    const digitsBeforeCursor = rawValue
      .slice(0, oldCursorPos)
      .replace(/\D/g, "").length;

    // Format digits
    const formatted = formatRupiahInput(rawValue);
    const num = parseRupiah(formatted);

    // Compute new cursor position based on digit count
    let newCursor = 0;
    let countedDigits = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        countedDigits++;
      }
      if (countedDigits >= digitsBeforeCursor) {
        newCursor = i + 1;
        break;
      }
    }
    if (digitsBeforeCursor === 0) newCursor = 0;

    cursorRef.current = newCursor;
    setDisplayValue(formatted);

    if (onValueChange) {
      onValueChange(num, formatted);
    }
    return { formatted, numeric: num };
  };

  const handleChange = (e) => {
    const input = e.target;
    const rawValue = input.value;
    const cursor = input.selectionEnd || 0;

    const { formatted, numeric } = applyNewValue(rawValue, cursor);

    if (onChange) {
      // Provide custom properties and call handler
      e.target.numericValue = numeric;
      e.target.formattedValue = formatted;
      onChange(e, numeric, formatted);
    }
  };

  const handleKeyDown = (e) => {
    const input = inputRef.current;
    if (!input || readOnly || disabled) {
      if (restProps.onKeyDown) restProps.onKeyDown(e);
      return;
    }

    const { selectionStart, selectionEnd, value: currentVal } = input;

    // Special Backspace handling: if cursor is right after a dot, delete the digit before the dot
    if (e.key === "Backspace" && selectionStart === selectionEnd && selectionStart > 0) {
      if (currentVal[selectionStart - 1] === ".") {
        e.preventDefault();
        const before = currentVal.slice(0, selectionStart - 2);
        const after = currentVal.slice(selectionStart);
        const combined = before + after;
        applyNewValue(combined, selectionStart - 2);
        if (onChange) {
          e.target.numericValue = parseRupiah(combined);
          onChange(e, parseRupiah(combined), formatRupiahInput(combined));
        }
        return;
      }
    }

    // Special Delete handling: if cursor is right before a dot, delete the digit after the dot
    if (e.key === "Delete" && selectionStart === selectionEnd && selectionStart < currentVal.length) {
      if (currentVal[selectionStart] === ".") {
        e.preventDefault();
        const before = currentVal.slice(0, selectionStart);
        const after = currentVal.slice(selectionStart + 2);
        const combined = before + after;
        applyNewValue(combined, selectionStart);
        if (onChange) {
          e.target.numericValue = parseRupiah(combined);
          onChange(e, parseRupiah(combined), formatRupiahInput(combined));
        }
        return;
      }
    }

    if (restProps.onKeyDown) restProps.onKeyDown(e);
  };

  return (
    <div
      className={`ws-rupiah-field ${prefix ? "has-prefix" : ""} ${wrapperClassName}`}
      style={style}
    >
      {prefix && (
        <span className="ws-rupiah-prefix" aria-hidden="true">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required && !displayValue}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        data-rupiah="true"
        data-numeric-value={numericValue}
        className={`ws-rupiah-input ${className}`}
        {...restProps}
      />
      {name && (
        <input
          type="hidden"
          name={name}
          value={displayValue ? numericValue : ""}
        />
      )}
    </div>
  );
});

export default RupiahInput;
