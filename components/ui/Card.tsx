import React from "react";

export type CardElevation = "panel" | "card" | "card-2";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: CardElevation;
  focal?: boolean;
  padded?: boolean;
}

function bgForElevation(elevation: CardElevation): string {
  switch (elevation) {
    case "panel":  return "var(--msp-panel)";
    case "card":   return "var(--msp-card)";
    case "card-2": return "var(--msp-card-2)";
  }
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { elevation = "card", focal = false, padded = true, style, children, ...rest },
  ref
) {
  const merged: React.CSSProperties = {
    background: focal ? "var(--msp-card-2)" : bgForElevation(elevation),
    color: "var(--msp-text)",
    border: "1px solid var(--msp-border)",
    borderRadius: "var(--msp-radius-card)",
    padding: padded ? "var(--msp-panel-padding)" : 0,
    borderLeft: focal ? "2px solid var(--msp-accent)" : undefined,
    ...style,
  };
  return (
    <div ref={ref} style={merged} {...rest}>
      {children}
    </div>
  );
});

export default Card;
