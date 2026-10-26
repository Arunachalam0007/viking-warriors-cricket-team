/**
 * Decorative looping cricket scene in the top bar, two deliveries per loop:
 *   1. the bowler runs in and bowls, the batsman hits it back over his head for SIX
 *   2. the bowler bowls again, the batsman misses and is BOWLED (bails fly, stumps tilt)
 * It fills the space between the title and the header buttons, scales down on narrow phones,
 * sits behind the header content and ignores taps. Animation lives in globals.css (.shot-*).
 */
export function HeaderCricketScene() {
  return (
    <div aria-hidden="true" className="shot-wrap pointer-events-none relative z-0 min-w-0 flex-1 self-stretch">
      <div className="shot-scene absolute right-0 bottom-0 h-14 w-[200px]">
        {/* Bowler: runs in and bowls, arm over the top */}
        <svg className="shot-figure shot-bowler absolute bottom-1 left-1 h-[46px] w-[30px] overflow-visible" viewBox="0 0 30 46">
          <circle cx="14" cy="7" r="4.5" fill="currentColor" />
          <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 12l1 16" />
            <path d="M14.5 15l-6 5" />
            <path d="M15 28l-6 16M15 28l6 16" />
          </g>
          <g className="shot-bowl-arm">
            <path d="M14.5 15l6.5 -4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>

        {/* Batsman, facing the bowler */}
        <svg className="shot-figure absolute bottom-1 left-[146px] h-[46px] w-[34px] overflow-visible" viewBox="0 0 34 46">
          <circle cx="20" cy="7" r="5" fill="currentColor" />
          <path d="M15.5 7.5h3" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
          <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12.5l-1 15.5" />
            <path d="M20 15.5l-6.5 5.5" />
            <path d="M19 28l-5 16M19 28l5 16" />
          </g>
          <g className="shot-bat">
            <path d="M13.5 21v5" stroke="#3b2a1a" strokeWidth="1.8" strokeLinecap="round" />
            <rect x="11.2" y="26" width="4.6" height="16" rx="1.6" fill="#d9a55f" stroke="#a9773a" strokeWidth="0.6" />
          </g>
        </svg>

        {/* Stumps (tilt when bowled) and bails (fly off) */}
        <svg className="shot-figure absolute bottom-1 left-[182px] h-[24px] w-[12px] overflow-visible" viewBox="0 0 12 24">
          <g className="shot-stumps">
            <path d="M3 4v20M6 4v20M9 4v20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g className="shot-bails">
            <path d="M2 3h4M6 3h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </g>
        </svg>

        <span className="shot-six absolute bottom-1 left-[92px] font-heading text-sm font-bold tracking-wider">SIX!</span>
        <span className="shot-out absolute bottom-1 left-[78px] font-heading text-sm font-bold tracking-wider">BOWLED!</span>

        {/* The ball, released from the bowler's hand */}
        <span className="shot-ball absolute bottom-1.5 left-[22px] block">
          <svg className="shot-ball-spin block size-[11px] drop-shadow-[0_1px_1px_rgb(0_0_0/0.3)]" viewBox="0 0 24 24">
            <defs>
              <radialGradient id="shot-ball-shine" cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor="#ff6b5b" />
                <stop offset="55%" stopColor="#c8102e" />
                <stop offset="100%" stopColor="#7a0716" />
              </radialGradient>
            </defs>
            <circle cx="12" cy="12" r="11" fill="url(#shot-ball-shine)" />
            <path d="M7 3.2C10.5 8 10.5 16 7 20.8M17 3.2C13.5 8 13.5 16 17 20.8" fill="none" stroke="#fff4e6" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}
