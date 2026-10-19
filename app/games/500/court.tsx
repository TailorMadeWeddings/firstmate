import { type Suit } from "@/lib/games/500/rules";

// Double-ended portraits for the jacks, queens and kings, drawn for a card
// about 56px wide: bold shapes rather than fine linework, which would blur.

const ROBES: Record<Suit, { robe: string; shirt: string }> = {
  S: { robe: "#1e3a8a", shirt: "#b91c1c" },
  H: { robe: "#b91c1c", shirt: "#1e3a8a" },
  D: { robe: "#0f766e", shirt: "#b91c1c" },
  C: { robe: "#166534", shirt: "#1e3a8a" },
};
const GOLD = "#eab308";
const GOLD_DARK = "#a16207";
const SKIN = "#f6d5b8";
const INK = "#1c1917";
const SYMBOL: Record<Suit, string> = { S: "♠", C: "♣", D: "♦", H: "♥" };
const isRed = (s: Suit) => s === "D" || s === "H";

/** One half of the portrait, in a 32 × 35 box. */
function Half({ rank, suit }: { rank: "J" | "Q" | "K"; suit: Suit }) {
  const { robe, shirt } = ROBES[suit];
  return (
    <g>
      {/* What they hold. */}
      {rank === "K" && (
        <g>
          <line x1="26" y1="15" x2="26" y2="35" stroke="#9ca3af" strokeWidth="1.3" />
          <line x1="23.6" y1="19" x2="28.4" y2="19" stroke={GOLD} strokeWidth="1.2" />
          <circle cx="26" cy="14.3" r="1" fill={GOLD} />
        </g>
      )}
      {rank === "Q" && (
        <g>
          <path d="M7.5 35 Q7 27 8.5 20.5" stroke="#15803d" strokeWidth="0.9" fill="none" />
          <circle cx="8.5" cy="19" r="2.4" fill={isRed(suit) ? "#f472b6" : "#e11d48"} />
          <circle cx="8.5" cy="19" r="0.8" fill={GOLD} />
        </g>
      )}
      {rank === "J" && (
        <g>
          <line x1="5" y1="12" x2="5" y2="35" stroke="#78350f" strokeWidth="1.1" />
          <path d="M5 7.5 6.7 12.3H3.3Z" fill="#d1d5db" stroke="#6b7280" strokeWidth="0.3" />
        </g>
      )}

      {/* Robe, shirt and gold trim. */}
      <path d="M5 35 6.5 22.5Q16 16.5 25.5 22.5L27 35Z" fill={robe} />
      <path d="M16 18.6Q21.5 19 25.5 22.5L27 35H16Z" fill="#000" opacity="0.14" />
      <path d="M12 20.2 16 25.5 20 20.2Q16 18.6 12 20.2Z" fill={shirt} />
      <path d="M10.3 20 16 27.5 21.7 20" stroke={GOLD} strokeWidth="1.4" fill="none" />
      {rank === "K" && <line x1="5.6" y1="30.5" x2="26.4" y2="30.5" stroke={GOLD} strokeWidth="1.1" />}

      {/* Hair behind the face. */}
      {rank === "Q" && (
        <path d="M11.6 9Q9.8 15 11.5 20L13.4 12ZM20.4 9Q22.2 15 20.5 20L18.6 12Z" fill="#92400e" />
      )}
      <circle cx="16" cy="12" r="4.4" fill={SKIN} />
      {rank === "J" && <path d="M11.8 10.5Q12 13 12.8 14L13 10ZM20.2 10.5Q20 13 19.2 14L19 10Z" fill="#78350f" />}
      {rank === "K" && (
        <path
          d="M11.8 12.5Q12.5 20.5 16 20.8Q19.5 20.5 20.2 12.5Q18.6 15.6 16 15.6Q13.4 15.6 11.8 12.5Z"
          fill="#f5f5f4"
          stroke="#a8a29e"
          strokeWidth="0.3"
        />
      )}

      {/* Face. */}
      <circle cx="14.4" cy="11.6" r="0.5" fill={INK} />
      <circle cx="17.6" cy="11.6" r="0.5" fill={INK} />
      {rank !== "K" && (
        <path d="M14.8 14.3Q16 15.1 17.2 14.3" stroke="#9f1239" strokeWidth="0.45" fill="none" />
      )}

      {/* Headwear. */}
      {rank === "K" && (
        <g>
          <path
            d="M11.4 8.4 11 3l2.6 2.6L16 1.8l2.4 3.8L21 3l-.4 5.4Z"
            fill={GOLD}
            stroke={GOLD_DARK}
            strokeWidth="0.4"
          />
          <circle cx="16" cy="6.2" r="0.8" fill="#dc2626" />
        </g>
      )}
      {rank === "Q" && (
        <g>
          <path
            d="M12.4 8.3V4.8l1.8 1.6L16 3.8l1.8 2.6 1.8-1.6v3.5Z"
            fill={GOLD}
            stroke={GOLD_DARK}
            strokeWidth="0.35"
          />
          <circle cx="12.4" cy="4.5" r="0.55" fill="#f8fafc" />
          <circle cx="16" cy="3.5" r="0.55" fill="#f8fafc" />
          <circle cx="19.6" cy="4.5" r="0.55" fill="#f8fafc" />
        </g>
      )}
      {rank === "J" && (
        <g>
          <path d="M10.6 9Q15.5 2 21.6 7.4L21 9Z" fill={robe} stroke={GOLD} strokeWidth="0.5" />
          <path d="M20 6.2Q25.5 0.5 27.5 2.6Q24.5 4.2 21.2 7.4Z" fill={GOLD} />
        </g>
      )}

      {/* The suit, worn like a badge. */}
      <text
        x={rank === "K" ? 6 : 26}
        y={rank === "J" ? 15 : 9}
        fontSize="6.5"
        textAnchor="middle"
        fill={isRed(suit) ? "#dc2626" : INK}
      >
        {SYMBOL[suit]}
      </text>
    </g>
  );
}

/** The picture panel of a court card: a portrait mirrored top and bottom. */
export function CourtArt({ rank, suit }: { rank: "J" | "Q" | "K"; suit: Suit }) {
  return (
    <svg viewBox="0 0 32 70" className="h-full w-full" aria-hidden>
      <defs>
        <clipPath id={`court-${rank}${suit}`}>
          <rect width="32" height="70" rx="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#court-${rank}${suit})`}>
        <rect width="32" height="70" fill="#fdf6e3" />
        <Half rank={rank} suit={suit} />
        <g transform="rotate(180 16 35)">
          <Half rank={rank} suit={suit} />
        </g>
        <line x1="1" y1="35" x2="31" y2="35" stroke={GOLD_DARK} strokeWidth="0.4" opacity="0.6" />
      </g>
      <rect
        x="0.4"
        y="0.4"
        width="31.2"
        height="69.2"
        rx="2"
        fill="none"
        stroke="#d4a24c"
        strokeWidth="0.8"
      />
    </svg>
  );
}
