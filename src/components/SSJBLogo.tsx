import React from 'react';

interface SSJBLogoProps {
  className?: string;
  height?: number | string;
  showText?: boolean;
  lightText?: boolean;
}

export const SSJBLogo: React.FC<SSJBLogoProps> = ({
  className = '',
  height = '48px',
  showText = true,
  lightText = false,
}) => {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`} id="ssjb_logo_container">
      <svg
        viewBox="0 0 240 160"
        style={{ height }}
        className="shrink-0 drop-shadow-sm"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        id="ssjb_logo_svg"
      >
        {/* === GREEN PEOPLE CROWN SYMBOL === */}
        {/* Left Small Head */}
        <circle cx="56" cy="38" r="13" fill="#00C853" />
        {/* Right Small Head */}
        <circle cx="120" cy="38" r="13" fill="#00C853" />
        {/* Center Big Head */}
        <circle cx="88" cy="27" r="18" fill="#00C853" />
        
        {/* Torso / Intersecting leaf-shape underneath the heads */}
        <path
          d="M88 47 C70 56, 62 76, 88 95 C114 76, 106 56, 88 47 Z"
          fill="#00C853"
          stroke="#FFFFFF"
          strokeWidth="2"
        />

        {/* === BLUE SSJB TYPOGRAPHY (Hand-styled Vector Curves for Perfect Consistency across all platforms) === */}
        {/* First 'S' */}
        <path
          d="M 62 101 C 62 82, 38 88, 38 74 C 38 64, 58 64, 58 71 C 58 74, 55 77, 52 77 M 62 101 C 62 119, 28 111, 28 126 C 28 138, 54 139, 54 126"
          stroke="#0066CC"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Second 'S' */}
        <path
          d="M 112 101 C 112 82, 88 88, 88 74 C 88 64, 108 64, 108 71 C 108 74, 105 77, 102 77 M 112 101 C 112 119, 78 111, 78 126 C 78 138, 104 139, 104 126"
          stroke="#0066CC"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Letter 'J' */}
        <path
          d="M 130 65 L 158 65 M 148 65 L 148 120 C 148 135, 122 135, 122 122"
          stroke="#0066CC"
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Letter 'B' */}
        <path
          d="M 172 65 L 172 133 M 172 65 C 195 65, 195 95, 172 95 M 172 95 C 200 95, 202 133, 172 133"
          stroke="#0066CC"
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      {showText && (
        <div className="flex flex-col select-none" id="ssjb_text_info">
          <span 
            className={`font-black font-display text-lg tracking-tight uppercase leading-none ${
              lightText ? 'text-white' : 'text-[#0066CC]'
            }`}
          >
            Sekawan Sejahtera
          </span>
          <span className="font-mono text-[9px] font-bold tracking-widest text-[#00C853] uppercase leading-none mt-1">
            Bersama • Koperasi SAK ERP
          </span>
        </div>
      )}
    </div>
  );
};
