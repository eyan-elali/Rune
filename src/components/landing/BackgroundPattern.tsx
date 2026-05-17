"use client";

export default function BackgroundPattern() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 0 }}
    >
      {/* ── Symbol definitions ─────────────────────────────────────────────── */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      >
        <defs>
          {/* r-fehu: vertical + 2 right diagonals */}
          <symbol id="r-fehu" viewBox="0 0 24 36">
            <line x1="7" y1="0" x2="7" y2="36" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="7" y1="9" x2="22" y2="3" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="7" y1="20" x2="22" y2="14" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
          </symbol>

          {/* r-uruz: two verticals + diagonal connector at top */}
          <symbol id="r-uruz" viewBox="0 0 24 36">
            <line x1="5" y1="36" x2="5" y2="0" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="19" y1="36" x2="19" y2="12" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="5" y1="0" x2="19" y2="12" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
          </symbol>

          {/* r-thurisaz: vertical + right-pointing notch */}
          <symbol id="r-thurisaz" viewBox="0 0 24 36">
            <line x1="7" y1="0" x2="7" y2="36" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="7" y1="8" x2="21" y2="17" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="21" y1="17" x2="7" y2="26" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
          </symbol>

          {/* r-ansuz: vertical + two left diagonals */}
          <symbol id="r-ansuz" viewBox="0 0 24 36">
            <line x1="17" y1="0" x2="17" y2="36" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="17" y1="8" x2="3" y2="17" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="17" y1="20" x2="3" y2="29" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
          </symbol>

          {/* r-raidho: vertical + half-diamond right + lower spur */}
          <symbol id="r-raidho" viewBox="0 0 24 36">
            <line x1="6" y1="0" x2="6" y2="36" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="6" y1="5" x2="20" y2="14" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="20" y1="14" x2="6" y2="22" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="6" y1="22" x2="20" y2="34" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
          </symbol>

          {/* r-hagalaz: two verticals + diagonal crossbar */}
          <symbol id="r-hagalaz" viewBox="0 0 24 36">
            <line x1="5" y1="0" x2="5" y2="36" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="19" y1="0" x2="19" y2="36" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="5" y1="10" x2="19" y2="24" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
          </symbol>

          {/* r-tiwaz: vertical + upward chevron */}
          <symbol id="r-tiwaz" viewBox="0 0 24 36">
            <line x1="12" y1="36" x2="12" y2="0" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="12" y1="10" x2="2" y2="22" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="12" y1="10" x2="22" y2="22" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
          </symbol>

          {/* r-berkana: vertical + two right bumps */}
          <symbol id="r-berkana" viewBox="0 0 24 36">
            <line x1="6" y1="0" x2="6" y2="36" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="6" y1="0" x2="19" y2="9" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="19" y1="9" x2="6" y2="18" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="6" y1="18" x2="20" y2="27" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
            <line x1="20" y1="27" x2="6" y2="36" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="square" />
          </symbol>
        </defs>
      </svg>

      {/* ── Tiled pattern layer with radial mask ──────────────────────────── */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          maskImage:
            "radial-gradient(circle at 50% 50%, transparent 0%, transparent 40%, rgba(0,0,0,0.5) 65%, rgba(0,0,0,1) 90%)",
          WebkitMaskImage:
            "radial-gradient(circle at 50% 50%, transparent 0%, transparent 40%, rgba(0,0,0,0.5) 65%, rgba(0,0,0,1) 90%)",
        }}
      >
        <defs>
          {/* Tile A: star + rune (fehu) + diamond — natural position */}
          <pattern
            id="tile-a"
            x="0"
            y="0"
            width="120"
            height="120"
            patternUnits="userSpaceOnUse"
          >
            {/* Star ✦ at top-right */}
            <path
              d="M92,7 L93.8,12.8 L100,12.8 L95.2,16.4 L97.2,22.2 L92,18.6 L86.8,22.2 L88.8,16.4 L84,12.8 L90.2,12.8 Z"
              fill="var(--color-gold)"
              fillOpacity="0.06"
            />
            {/* Rune: fehu — 3 straight strokes, inline for pattern reliability */}
            <line x1="17" y1="55" x2="17" y2="82" stroke="var(--color-gold)" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="square" />
            <line x1="17" y1="62" x2="29" y2="57" stroke="var(--color-gold)" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="square" />
            <line x1="17" y1="70" x2="29" y2="65" stroke="var(--color-gold)" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="square" />
            {/* Diamond ◆ at bottom-center */}
            <path
              d="M62,88 L69,96 L62,104 L55,96 Z"
              fill="var(--color-gold)"
              fillOpacity="0.06"
            />
          </pattern>

          {/* Tile B: asterism + rune (hagalaz) + diamonds — offset by 60,60 */}
          <pattern
            id="tile-b"
            x="0"
            y="0"
            width="120"
            height="120"
            patternUnits="userSpaceOnUse"
            patternTransform="translate(60,60)"
          >
            {/* Asterism ✦ at top-left */}
            <path
              d="M20,5 L21.6,10.4 L27.4,10.4 L22.8,13.8 L24.6,19.2 L20,15.8 L15.4,19.2 L17.2,13.8 L12.6,10.4 L18.4,10.4 Z"
              fill="var(--color-gold)"
              fillOpacity="0.06"
            />
            {/* Rune: hagalaz — two verticals + diagonal crossbar */}
            <line x1="76" y1="30" x2="76" y2="57" stroke="var(--color-gold)" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="square" />
            <line x1="88" y1="30" x2="88" y2="57" stroke="var(--color-gold)" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="square" />
            <line x1="76" y1="38" x2="88" y2="49" stroke="var(--color-gold)" strokeOpacity="0.06" strokeWidth="1.2" strokeLinecap="square" />
            {/* Diamond ◆ */}
            <path
              d="M32,84 L39,92 L32,100 L25,92 Z"
              fill="var(--color-gold)"
              fillOpacity="0.06"
            />
            {/* Tiny diamond accent */}
            <path
              d="M96,97 L100,103 L96,109 L92,103 Z"
              fill="var(--color-gold)"
              fillOpacity="0.04"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#tile-a)" />
        <rect width="100%" height="100%" fill="url(#tile-b)" />
      </svg>

      {/* ── Large accent motifs ────────────────────────────────────────────── */}

      {/* Top-right: runic wheel — circle + 8 radiating rune strokes */}
      <div style={{ position: "absolute", top: "32px", right: "32px" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="140"
          height="140"
          viewBox="0 0 140 140"
          aria-hidden="true"
          style={{ opacity: 0.035 }}
        >
          <circle cx="70" cy="70" r="64" fill="none" stroke="var(--color-gold)" strokeWidth="1" />
          <circle cx="70" cy="70" r="44" fill="none" stroke="var(--color-gold)" strokeWidth="0.6" />
          <line x1="70" y1="6"   x2="70" y2="26"  stroke="var(--color-gold)" strokeWidth="1.2" strokeLinecap="square" />
          <line x1="115" y1="25" x2="101" y2="43" stroke="var(--color-gold)" strokeWidth="1.2" strokeLinecap="square" />
          <line x1="134" y1="70" x2="114" y2="70" stroke="var(--color-gold)" strokeWidth="1.2" strokeLinecap="square" />
          <line x1="115" y1="115" x2="101" y2="97" stroke="var(--color-gold)" strokeWidth="1.2" strokeLinecap="square" />
          <line x1="70" y1="134" x2="70" y2="114" stroke="var(--color-gold)" strokeWidth="1.2" strokeLinecap="square" />
          <line x1="25" y1="115" x2="39" y2="97"  stroke="var(--color-gold)" strokeWidth="1.2" strokeLinecap="square" />
          <line x1="6"  y1="70"  x2="26" y2="70"  stroke="var(--color-gold)" strokeWidth="1.2" strokeLinecap="square" />
          <line x1="25" y1="25"  x2="39" y2="43"  stroke="var(--color-gold)" strokeWidth="1.2" strokeLinecap="square" />
          <circle cx="70" cy="70" r="4" fill="var(--color-gold)" />
        </svg>
      </div>

      {/* Top-left: constellation cluster — dots + lines + central star */}
      <div style={{ position: "absolute", top: "48px", left: "32px" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="160"
          height="160"
          viewBox="0 0 160 160"
          aria-hidden="true"
          style={{ opacity: 0.032 }}
        >
          <line x1="80"  y1="20"  x2="130" y2="70"  stroke="var(--color-gold)" strokeWidth="0.7" />
          <line x1="80"  y1="20"  x2="30"  y2="80"  stroke="var(--color-gold)" strokeWidth="0.7" />
          <line x1="130" y1="70"  x2="90"  y2="130" stroke="var(--color-gold)" strokeWidth="0.7" />
          <line x1="30"  y1="80"  x2="90"  y2="130" stroke="var(--color-gold)" strokeWidth="0.7" />
          <line x1="130" y1="70"  x2="30"  y2="80"  stroke="var(--color-gold)" strokeWidth="0.5" />
          <circle cx="80"  cy="20"  r="5"   fill="var(--color-gold)" />
          <circle cx="130" cy="70"  r="3.5" fill="var(--color-gold)" />
          <circle cx="30"  cy="80"  r="3.5" fill="var(--color-gold)" />
          <circle cx="90"  cy="130" r="4"   fill="var(--color-gold)" />
          <path
            d="M80,62 L82.8,70.4 L92,70.4 L84.6,75.6 L87.4,84 L80,78.8 L72.6,84 L75.4,75.6 L68,70.4 L77.2,70.4 Z"
            fill="var(--color-gold)"
          />
          <circle cx="55"  cy="45"  r="2"   fill="var(--color-gold)" />
          <circle cx="110" cy="45"  r="1.5" fill="var(--color-gold)" />
          <circle cx="140" cy="100" r="1.5" fill="var(--color-gold)" />
        </svg>
      </div>

      {/* Mid-right: stacked rune sigil (tiwaz + raidho) */}
      <div style={{ position: "absolute", top: "30%", right: "24px" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="120"
          height="180"
          viewBox="0 0 120 180"
          aria-hidden="true"
          style={{ opacity: 0.03 }}
        >
          <use href="#r-tiwaz"  x="48" y="0"  width="24" height="36" />
          <line x1="60" y1="36" x2="60" y2="52" stroke="var(--color-gold)" strokeWidth="1" strokeLinecap="square" />
          <use href="#r-raidho" x="48" y="52" width="24" height="36" />
          <path
            d="M60,110 L70,126 L60,142 L50,126 Z"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="1"
          />
        </svg>
      </div>

      {/* Mid-left: nested diamond arrangement */}
      <div style={{ position: "absolute", top: "48%", left: "24px" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="100"
          height="160"
          viewBox="0 0 100 160"
          aria-hidden="true"
          style={{ opacity: 0.032 }}
        >
          <path d="M50,5  L95,50 L50,95 L5,50 Z"  fill="none" stroke="var(--color-gold)" strokeWidth="1.2" />
          <path d="M50,22 L78,50 L50,78 L22,50 Z"  fill="none" stroke="var(--color-gold)" strokeWidth="0.7" />
          <line x1="50" y1="95" x2="50" y2="115" stroke="var(--color-gold)" strokeWidth="0.5" strokeDasharray="3,4" />
          <path d="M50,115 L63,130 L50,145 L37,130 Z" fill="none" stroke="var(--color-gold)" strokeWidth="0.8" />
          <circle cx="50" cy="50" r="2.5" fill="var(--color-gold)" />
        </svg>
      </div>

      {/* Lower-right: smaller runic wheel (6 spokes) */}
      <div style={{ position: "absolute", top: "68%", right: "40px" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="110"
          height="110"
          viewBox="0 0 110 110"
          aria-hidden="true"
          style={{ opacity: 0.03 }}
        >
          <circle cx="55" cy="55" r="50" fill="none" stroke="var(--color-gold)" strokeWidth="1" />
          <line x1="55" y1="5"   x2="55" y2="22"  stroke="var(--color-gold)" strokeWidth="1" strokeLinecap="square" />
          <line x1="98" y1="28"  x2="86" y2="42"  stroke="var(--color-gold)" strokeWidth="1" strokeLinecap="square" />
          <line x1="98" y1="82"  x2="86" y2="68"  stroke="var(--color-gold)" strokeWidth="1" strokeLinecap="square" />
          <line x1="55" y1="105" x2="55" y2="88"  stroke="var(--color-gold)" strokeWidth="1" strokeLinecap="square" />
          <line x1="12" y1="82"  x2="24" y2="68"  stroke="var(--color-gold)" strokeWidth="1" strokeLinecap="square" />
          <line x1="12" y1="28"  x2="24" y2="42"  stroke="var(--color-gold)" strokeWidth="1" strokeLinecap="square" />
          <circle cx="55" cy="55" r="3" fill="var(--color-gold)" />
        </svg>
      </div>

      {/* Lower-left: constellation cluster */}
      <div style={{ position: "absolute", top: "75%", left: "32px" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="130"
          height="130"
          viewBox="0 0 130 130"
          aria-hidden="true"
          style={{ opacity: 0.028 }}
        >
          <line x1="20"  y1="30"  x2="80"  y2="50"  stroke="var(--color-gold)" strokeWidth="0.7" />
          <line x1="80"  y1="50"  x2="110" y2="100" stroke="var(--color-gold)" strokeWidth="0.7" />
          <line x1="20"  y1="30"  x2="50"  y2="100" stroke="var(--color-gold)" strokeWidth="0.7" />
          <line x1="50"  y1="100" x2="110" y2="100" stroke="var(--color-gold)" strokeWidth="0.5" />
          <circle cx="20"  cy="30"  r="4" fill="var(--color-gold)" />
          <circle cx="80"  cy="50"  r="5" fill="var(--color-gold)" />
          <circle cx="50"  cy="100" r="3" fill="var(--color-gold)" />
          <circle cx="110" cy="100" r="3" fill="var(--color-gold)" />
          <circle cx="100" cy="20"  r="2" fill="var(--color-gold)" />
        </svg>
      </div>

      {/* Lower-center-right: star + ansuz rune */}
      <div style={{ position: "absolute", top: "84%", right: "15%" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="100"
          height="120"
          viewBox="0 0 100 120"
          aria-hidden="true"
          style={{ opacity: 0.028 }}
        >
          <path
            d="M50,5 L54,18 L68,18 L57,27 L61,40 L50,31 L39,40 L43,27 L32,18 L46,18 Z"
            fill="var(--color-gold)"
          />
          <use href="#r-ansuz" x="38" y="55" width="24" height="36" />
        </svg>
      </div>

      {/* Lower-left: berkana + uruz side-by-side composition */}
      <div style={{ position: "absolute", top: "90%", left: "10%" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="120"
          height="100"
          viewBox="0 0 120 100"
          aria-hidden="true"
          style={{ opacity: 0.025 }}
        >
          <line x1="0" y1="50" x2="120" y2="50" stroke="var(--color-gold)" strokeWidth="0.8" />
          <use href="#r-berkana" x="20" y="12" width="24" height="36" />
          <use href="#r-uruz"    x="72" y="12" width="24" height="36" />
          <path d="M60,44 L65,50 L60,56 L55,50 Z" fill="var(--color-gold)" />
        </svg>
      </div>
    </div>
  );
}
