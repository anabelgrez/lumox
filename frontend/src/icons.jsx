import React from "react";

// Íconos dibujados a mano en SVG, trazo de 1.8 px, para no depender de una
// librería ni copiar los de nadie.
const I = ({ children, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
);

export const Ic = {
  home: (p) => <I {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></I>,
  globe: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></I>,
  mountain: (p) => <I {...p}><path d="M3 20l6-11 4 7 3-4 5 8z" /><path d="M9 9l1.5 3" /></I>,
  layers: (p) => <I {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></I>,
  flow: (p) => <I {...p}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M9 6h4a2 2 0 0 1 2 2v7" /></I>,
  calc: (p) => <I {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v3" /></I>,
  atom: (p) => <I {...p}><circle cx="12" cy="12" r="1.5" /><ellipse cx="12" cy="12" rx="9" ry="3.5" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" /></I>,
  check: (p) => <I {...p}><path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></I>,
  db: (p) => <I {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></I>,
  pin: (p) => <I {...p}><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></I>,
  cal: (p) => <I {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></I>,
  clock: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>,
  play: (p) => <I {...p}><path d="M7 5l12 7-12 7z" fill="currentColor" /></I>,
  pause: (p) => <I {...p}><path d="M8 5v14M16 5v14" /></I>,
  book: (p) => <I {...p}><path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 1z" /><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 1z" /></I>,
  sun: (p) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>,
  earth: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M7 6c2 1 1 3 3 4s3-1 4 1-1 3 1 4M15 20c0-2 2-3 3-4" /></I>,
  moon: (p) => <I {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></I>,
  signal: (p) => <I {...p}><circle cx="12" cy="12" r="1.5" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></I>,
  hourglass: (p) => <I {...p}><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" /></I>,
  bolt: (p) => <I {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></I>,
  alert: (p) => <I {...p}><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.5" /></I>,
  okc: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></I>,
  xc: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></I>,
  pulse: (p) => <I {...p}><path d="M3 12h4l2-6 4 12 2-6h6" /></I>,
  down: (p) => <I {...p}><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></I>,
  braces: (p) => <I {...p}><path d="M8 4c-2 0-2 2-2 4s-2 4-2 4 2 2 2 4 0 4 2 4M16 4c2 0 2 2 2 4s2 4 2 4-2 2-2 4 0 4-2 4" /></I>,
  search: (p) => <I {...p}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></I>,
  chev: (p) => <I {...p}><path d="M6 9l6 6 6-6" /></I>,
  cube: (p) => <I {...p}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></I>,
  square: (p) => <I {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></I>,
  film: (p) => <I {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></I>,
  link: (p) => <I {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L12.5 17" /></I>,
  sliders: (p) => <I {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></I>,
};

// Logo: luna creciente con un borde iluminado, en ámbar (nuestro color del Sol).
export function Logo(p) {
  return (
    <svg viewBox="0 0 40 40" className="logo" aria-hidden="true" {...p}>
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd27a" /><stop offset="1" stopColor="#d9831f" /></linearGradient></defs>
      <path d="M28 30A13 13 0 1 1 22 6a10 10 0 0 0 6 24z" fill="url(#lg)" />
    </svg>
  );
}
