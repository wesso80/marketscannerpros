"use client";
import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const sizeMap: Record<Size, React.CSSProperties> = {
  sm: { padding: "6px 10px", fontSize: "var(--msp-text-label)", minHeight: 28 },
  md: { padding: "8px 14px", fontSize: "var(--msp-text-body-sm)", minHeight: 34 },
  lg: { padding: "10px 18px", fontSize: "var(--msp-text-body)", minHeight: 40 },
};

function variantStyle(variant: Variant): React.CSSProperties {
  switch (variant) {
    case "primary":
      return {
        background: "var(--msp-accent)",
        color: "var(--msp-bg)",
        border: "1px solid var(--msp-accent)",
      };
    case "secondary":
      return {
        background: "transparent",
        color: "var(--msp-text)",
        border: "1px solid var(--msp-border-strong)",
      };
    case "ghost":
      return {
        background: "transparent",
        color: "var(--msp-text)",
        border: "1px solid transparent",
      };
    case "danger":
      return {
        background: "var(--msp-bear-tint)",
        color: "var(--msp-bear)",
        border: "1px solid var(--msp-bear)",
      };
  }
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", fullWidth, style, disabled, children, ...rest },
  ref
) {
  const merged: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontWeight: 500,
    lineHeight: 1.2,
    borderRadius: "var(--msp-radius-control)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? "100%" : undefined,
    transition: "background-color 120ms ease, border-color 120ms ease, opacity 120ms ease",
    ...sizeMap[size],
    ...variantStyle(variant),
    ...style,
  };
  return (
    <button ref={ref} disabled={disabled} style={merged} {...rest}>
      {children}
    </button>
  );
});

export default Button;
