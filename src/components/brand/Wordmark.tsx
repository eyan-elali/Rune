import { PRODUCT_NAME, WORDMARK } from "@/lib/brand";

// The Sutura wordmark. Both inks are in the page; CSS shows the one that suits
// the surface it sits on (.r2-brand in rune2.css: the .r2 root's data-theme,
// and the operating system's scheme for System). `tone` pins one ink on a
// surface that is always light or always dark. Decorative inside a labelled
// link (alt=""), otherwise it carries the product name.

export function Wordmark({
  className,
  label = true,
  tone = "auto",
}: {
  className?: string;
  label?: boolean;
  tone?: "auto" | "on-light" | "on-dark";
}) {
  const alt = label ? PRODUCT_NAME : "";
  return (
    <span className={className ? `r2-brand ${className}` : "r2-brand"} data-tone={tone}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-height mark, no layout shift to manage */}
      <img className="r2-brand-ink r2-brand-ink--dark" src={WORDMARK.onLight} alt={alt} width={604} height={180} decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="r2-brand-ink r2-brand-ink--light" src={WORDMARK.onDark} alt={alt} width={592} height={180} decoding="async" />
    </span>
  );
}
