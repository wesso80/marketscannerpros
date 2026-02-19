"use client";

import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent } from "react";

type DepthCardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  tiltStrength?: number;
};

export default function DepthCard({
  children,
  className = "",
  interactive = true,
  tiltStrength = 5,
  onMouseMove,
  onMouseLeave,
  ...rest
}: DepthCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [canTilt, setCanTilt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(pointer: fine)");
    const update = () => setCanTilt(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (interactive && canTilt && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const rotateY = (x - 0.5) * tiltStrength * 2;
      const rotateX = (0.5 - y) * tiltStrength * 1.35;

      cardRef.current.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
      cardRef.current.style.setProperty("--depth-sheen-x", `${(x * 100).toFixed(1)}%`);
      cardRef.current.style.setProperty("--depth-sheen-y", `${(y * 100).toFixed(1)}%`);
    }

    onMouseMove?.(event);
  };

  const handleMouseLeave = (event: MouseEvent<HTMLDivElement>) => {
    if (interactive && cardRef.current) {
      cardRef.current.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
      cardRef.current.style.setProperty("--depth-sheen-x", "50%");
      cardRef.current.style.setProperty("--depth-sheen-y", "20%");
    }

    onMouseLeave?.(event);
  };

  const style = {
    transform: "perspective(900px) rotateX(0deg) rotateY(0deg)",
    transformStyle: "preserve-3d",
    ...((rest.style as CSSProperties) || {}),
  } as CSSProperties;

  return (
    <div
      ref={cardRef}
      className={`group relative overflow-hidden transition-transform duration-200 ease-out will-change-transform ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      {...rest}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(180px circle at var(--depth-sheen-x,50%) var(--depth-sheen-y,20%), rgba(255,255,255,0.14), rgba(255,255,255,0.03) 38%, transparent 62%)",
        }}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
