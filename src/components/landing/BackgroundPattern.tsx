"use client";

export default function BackgroundPattern() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 0 }}
    >
      {/* ── Tiled SVG pattern with radial mask ── */}
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          inset: 0,
          maskImage:
            "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 0%, transparent 35%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,1) 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 0%, transparent 35%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,1) 100%)",
        }}
      >
        <defs>
          {/* Row A: book + star, offset row */}
          <pattern
            id="rune-motif-a"
            x="0"
            y="0"
            width="180"
            height="160"
            patternUnits="userSpaceOnUse"
          >
            {/* Open book at ~(30,40) */}
            <g transform="translate(18,32)" opacity="0.9">
              <path
                d="M12,2 C8,2 4,3 2,5 L2,20 C4,18.5 8,18 12,18 C16,18 20,18.5 22,20 L22,5 C20,3 16,2 12,2 Z"
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth="1"
              />
              <line x1="12" y1="2" x2="12" y2="18" stroke="var(--color-gold)" strokeWidth="0.75" />
              <line x1="2" y1="10" x2="12" y2="12" stroke="var(--color-gold)" strokeWidth="0.5" strokeDasharray="2,2" />
              <line x1="22" y1="10" x2="12" y2="12" stroke="var(--color-gold)" strokeWidth="0.5" strokeDasharray="2,2" />
            </g>

            {/* Star at (130, 20) */}
            <g transform="translate(126,16)" opacity="0.9">
              <path
                d="M4,0 L4.9,2.9 L8,2.9 L5.5,4.7 L6.5,7.6 L4,5.8 L1.5,7.6 L2.5,4.7 L0,2.9 L3.1,2.9 Z"
                fill="var(--color-gold)"
              />
            </g>

            {/* Diamond at (90, 110) */}
            <g transform="translate(87,106)" opacity="0.9">
              <path d="M4,0 L8,4 L4,8 L0,4 Z" fill="var(--color-gold)" />
            </g>
          </pattern>

          {/* Row B: quill + diamond, offset by 90px */}
          <pattern
            id="rune-motif-b"
            x="90"
            y="80"
            width="180"
            height="160"
            patternUnits="userSpaceOnUse"
          >
            {/* Quill at (20, 25) */}
            <g transform="translate(14,18)" opacity="0.9">
              <path
                d="M16,0 C16,0 18,6 14,10 C10,14 6,14 4,16 L0,20 C0,20 2,16 4,14 C6,12 10,10 12,6 C14,2 16,0 16,0 Z"
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth="0.9"
              />
              <path
                d="M4,16 L0,20"
                stroke="var(--color-gold)"
                strokeWidth="0.75"
              />
              <path
                d="M7,13 C5,14 3,16 2,18"
                stroke="var(--color-gold)"
                strokeWidth="0.5"
                strokeDasharray="1.5,2"
              />
            </g>

            {/* Small asterism ✦ at (130, 80) */}
            <g transform="translate(126,75)" opacity="0.9">
              <path
                d="M4,0 L4.6,2.8 L7.6,4 L4.6,5.2 L4,8 L3.4,5.2 L0.4,4 L3.4,2.8 Z"
                fill="var(--color-gold)"
              />
            </g>

            {/* Diamond at (55, 130) */}
            <g transform="translate(52,126)" opacity="0.9">
              <path d="M3,0 L6,3 L3,6 L0,3 Z" fill="var(--color-gold)" />
            </g>
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#rune-motif-a)" opacity="0.06" />
        <rect width="100%" height="100%" fill="url(#rune-motif-b)" opacity="0.055" />
      </svg>

      {/* ── Large individually placed motifs ── */}
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", inset: 0 }}
      >
        {/* Bottom-left: large open book ~130px */}
        <g transform="translate(32, calc(100vh - 200px))" opacity="0.035">
          <path
            d="M65,8 C45,8 22,12 8,20 L8,110 C22,102 45,98 65,98 C85,98 108,102 122,110 L122,20 C108,12 85,8 65,8 Z"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="3"
          />
          <line x1="65" y1="8" x2="65" y2="98" stroke="var(--color-gold)" strokeWidth="2" />
          <line x1="8" y1="55" x2="65" y2="62" stroke="var(--color-gold)" strokeWidth="1.5" strokeDasharray="6,6" />
          <line x1="122" y1="55" x2="65" y2="62" stroke="var(--color-gold)" strokeWidth="1.5" strokeDasharray="6,6" />
          <line x1="8" y1="38" x2="65" y2="44" stroke="var(--color-gold)" strokeWidth="1" strokeDasharray="4,5" />
          <line x1="122" y1="38" x2="65" y2="44" stroke="var(--color-gold)" strokeWidth="1" strokeDasharray="4,5" />
          <line x1="8" y1="72" x2="65" y2="78" stroke="var(--color-gold)" strokeWidth="1" strokeDasharray="4,5" />
          <line x1="122" y1="72" x2="65" y2="78" stroke="var(--color-gold)" strokeWidth="1" strokeDasharray="4,5" />
        </g>

        {/* Top-right: large quill ~140px */}
        <g transform="translate(calc(100vw - 220px), 40)" opacity="0.032">
          <path
            d="M130,0 C130,0 150,50 110,90 C75,125 40,125 20,145 L0,175 C0,175 20,145 35,125 C55,100 90,88 110,55 C128,22 130,0 130,0 Z"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2.5"
          />
          <path d="M20,145 L0,175" stroke="var(--color-gold)" strokeWidth="2" />
          <path d="M55,110 C40,120 20,140 10,162" stroke="var(--color-gold)" strokeWidth="1.2" strokeDasharray="5,6" />
          <path d="M80,88 C65,100 48,118 38,142" stroke="var(--color-gold)" strokeWidth="1" strokeDasharray="4,6" />
        </g>

        {/* Mid-right: star cluster */}
        <g transform="translate(calc(100vw - 140px), 45vh)" opacity="0.038">
          {/* Large central asterism */}
          <path
            d="M30,0 L36,22 L58,22 L40,36 L48,58 L30,44 L12,58 L20,36 L2,22 L24,22 Z"
            fill="var(--color-gold)"
          />
          {/* Smaller satellite stars */}
          <path
            d="M72,18 L74.8,26 L82,26 L76.2,30.4 L78.6,38.4 L72,34 L65.4,38.4 L67.8,30.4 L62,26 L69.2,26 Z"
            fill="var(--color-gold)"
            opacity="0.6"
          />
          <path
            d="M8,70 L10,76 L16,76 L11.4,79.4 L13.2,85.4 L8,82 L2.8,85.4 L4.6,79.4 L0,76 L6,76 Z"
            fill="var(--color-gold)"
            opacity="0.5"
          />
        </g>

        {/* Top-left: large diamond lozenge */}
        <g transform="translate(40, 80)" opacity="0.028">
          <path
            d="M50,0 L100,50 L50,100 L0,50 Z"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2"
          />
          <path
            d="M50,15 L85,50 L50,85 L15,50 Z"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="1"
            opacity="0.5"
          />
        </g>

        {/* Mid-left: small book */}
        <g transform="translate(20, 42vh)" opacity="0.03">
          <path
            d="M40,5 C28,5 14,8 5,13 L5,68 C14,63 28,60 40,60 C52,60 66,63 75,68 L75,13 C66,8 52,5 40,5 Z"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2"
          />
          <line x1="40" y1="5" x2="40" y2="60" stroke="var(--color-gold)" strokeWidth="1.5" />
        </g>

        {/* Bottom-right: asterism */}
        <g transform="translate(calc(100vw - 130px), calc(100vh - 150px))" opacity="0.036">
          <path
            d="M22,0 L26.5,16.5 L44,16.5 L30,26.5 L35,43 L22,33 L9,43 L14,26.5 L0,16.5 L17.5,16.5 Z"
            fill="var(--color-gold)"
          />
        </g>

        {/* Center-bottom: quill (below fold) */}
        <g transform="translate(calc(50vw - 60px), calc(100vh + 600px))" opacity="0.03">
          <path
            d="M80,0 C80,0 95,35 68,62 C48,82 28,84 14,95 L0,112 C0,112 14,92 24,80 C38,65 60,58 72,36 C83,16 80,0 80,0 Z"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2"
          />
        </g>
      </svg>
    </div>
  );
}
