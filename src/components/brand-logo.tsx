type LogoSize = "sm" | "md" | "lg" | "hero" | "splash";

const SIZES: Record<LogoSize, { width: number; height: number; className: string }> = {
  sm: { width: 120, height: 80, className: "brand-logo brand-logo-sm" },
  md: { width: 168, height: 112, className: "brand-logo brand-logo-md" },
  lg: { width: 240, height: 160, className: "brand-logo brand-logo-lg" },
  hero: { width: 280, height: 187, className: "brand-logo brand-logo-hero" },
  splash: { width: 320, height: 213, className: "brand-logo brand-logo-splash" },
};

export function BrandLogo({
  size = "md",
  priority = false,
  decorative = false,
}: {
  size?: LogoSize;
  priority?: boolean;
  /** When true, adjacent visible text carries the brand name. */
  decorative?: boolean;
}) {
  const dims = SIZES[size];
  return (
    <picture>
      <source srcSet="/brand/logo-sm.webp" type="image/webp" media="(max-width: 720px)" />
      <source srcSet="/brand/logo.webp" type="image/webp" />
      <img
        src="/brand/logo.png"
        alt={decorative ? "" : "Rustenburg Today"}
        width={dims.width}
        height={dims.height}
        className={dims.className}
        decoding="async"
        {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
      />
    </picture>
  );
}
