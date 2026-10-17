"use client";

import { useEffect, useRef } from "react";

const MIN_MS = 3000;
const MAX_MS = 7000;

export function Splash() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ranRef = useRef(false);

    useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Only show the splash on the first mount per session.
    // Next.js re-renders the root layout on internal navigation, which
    // remounts this component. Without this check, the animation would
    // replay every time the user changes pages.
    if (typeof window !== "undefined") {
      if (sessionStorage.getItem("beta-splash-shown") === "1") {
        const el = document.getElementById("beta-splash");
        if (el) el.style.display = "none";
        return;
      }
      sessionStorage.setItem("beta-splash-shown", "1");
    }

    // ---- build the blinking dots along the roads ----

    const NS = "http://www.w3.org/2000/svg";
    const T = 2.4;
    const RS = 1.4;
    const CX = 180;
    const CY = 195;
    const g = document.getElementById("beta-splash-dots");
    if (!g) return;

    function addDot(x: number, y: number, r: number, city: boolean) {
      const a = (Math.atan2(y - CY, x - CX) * 180) / Math.PI;
      const frac = ((((a % 360) + 360) % 360) / 360);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x.toFixed(1));
      c.setAttribute("cy", y.toFixed(1));
      c.setAttribute("r", String(r));
      c.setAttribute("class", "dot" + (city ? " city" : ""));
      c.style.animationDelay = (RS + frac * T).toFixed(3) + "s";
      g!.appendChild(c);
    }

    document
      .querySelectorAll("#beta-splash-roads .road")
      .forEach((p) => {
        const path = p as SVGPathElement;
        const L = path.getTotalLength();
        const step = 13;
        for (let d = 0; d <= L; d += step) {
          const pt = path.getPointAtLength(d);
          addDot(pt.x, pt.y, 1.9, false);
        }
      });

    const cities: Array<[number, number]> = [
      [228, 275.5], [219, 297], [207, 287], [179, 274], [106, 239], [68, 163],
      [134, 98], [239, 106], [289, 143], [275, 196], [262, 216], [200, 15],
      [208, 148], [301, 174], [95, 327], [289, 118], [213, 266],
    ];
    cities.forEach(([x, y]) => addDot(x, y, 3.4, true));

    const eta = document.getElementById("beta-splash-eta");
    if (eta) {
      const steps = ["5 min", "4 min", "3 min", "2 min", "1 min", "Arriving"];
      steps.forEach((t, i) => {
        setTimeout(() => {
          if (eta) eta.textContent = t;
        }, 2000 + i * 600);
      });
    }

    const splash = document.getElementById("beta-splash");
    const start = Date.now();
    let loaded = document.readyState === "complete";
    let closed = false;

    function close() {
      if (closed || !splash) return;
      closed = true;
      splash.classList.add("done");
      setTimeout(() => {
        if (splash) splash.style.display = "none";
      }, 520);
    }

    function check() {
      if (loaded && Date.now() - start >= MIN_MS) close();
    }

    const capTimer = setTimeout(close, MAX_MS);
    const interval = setInterval(check, 100);
    const onLoad = () => {
      loaded = true;
      check();
    };
    window.addEventListener("load", onLoad);
    if (loaded) check();

    return () => {
      clearInterval(interval);
      clearTimeout(capTimer);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return (
    <>
      <style>{SPLASH_CSS}</style>
      <div ref={rootRef} id="beta-splash" role="status" aria-label="Loading B-ETA">
        <div className="stage">
          <svg viewBox="0 0 370 380" aria-hidden="true">
            <defs>
              <clipPath id="beta-splash-bw">
                <path id="beta-splash-bwShape" d="M41.8 22.8 L129.2 22.8 L174.8 3.8 L203.3 15.2 L239.4 57 L269.8 102.6 L296.4 121.6 L307.8 155.8 L359.9 182.4 L326.8 193.8 L273.6 212.8 L262.2 262.2 L224.2 296.4 L216.6 311.6 L174.8 319.2 L110.2 323 L36 357.2 L26.6 319.2 L3.8 280 L3.8 174.8 L41.8 174.8 Z" />
              </clipPath>
            </defs>
            <use href="#beta-splash-bwShape" className="country" pathLength={1} />
            <g clipPath="url(#beta-splash-bw)">
              <g transform="translate(180 195)">
                <circle className="ring-r" r="50" />
                <circle className="ring-r" r="100" />
                <circle className="ring-r" r="150" />
                <circle className="ring-r" r="200" />
                <g className="sweep">
                  <path d="M0 0 L260 0 A260 260 0 0 0 183.8 -183.8 Z" fill="rgba(255,179,0,.05)" />
                  <path d="M0 0 L260 0 A260 260 0 0 0 240.2 -99.5 Z" fill="rgba(255,179,0,.08)" />
                  <path d="M0 0 L260 0 A260 260 0 0 0 257.5 -36 Z" fill="rgba(255,179,0,.14)" />
                  <line x1="0" y1="0" x2="260" y2="0" stroke="rgba(255,179,0,.8)" strokeWidth="1.5" />
                </g>
              </g>
            </g>
            <g id="beta-splash-roads">
              <path className="road" pathLength={1} style={{ animationDelay: "0.5s" }} d="M289 118 L289 143 Q283 170 275 196 L262 216 Q240 250 228 275 L219 297" />
              <path className="road" pathLength={1} style={{ animationDelay: "0.8s" }} d="M219 297 L207 287 L179 274 Q140 255 106 239 Q85 200 68 163" />
              <path className="road" pathLength={1} style={{ animationDelay: "1s" }} d="M68 163 Q100 130 134 98 Q190 95 239 106 Q265 125 289 143" />
              <path className="road" pathLength={1} style={{ animationDelay: "1.2s" }} d="M239 106 Q225 60 200 15" />
              <path className="road minor" pathLength={1} style={{ animationDelay: "1.1s" }} d="M134 98 Q170 60 200 15" />
              <path className="road minor" pathLength={1} style={{ animationDelay: "1.3s" }} d="M275 196 L258 190 Q230 165 216 153 L208 148" />
              <path className="road minor" pathLength={1} style={{ animationDelay: "1.3s" }} d="M275 196 L301 174 Q298 160 289 143" />
              <path className="road minor" pathLength={1} style={{ animationDelay: "1.4s" }} d="M228 275 L213 266 Q195 270 179 274" />
              <path className="road minor" pathLength={1} style={{ animationDelay: "1.4s" }} d="M179 274 Q130 300 95 327" />
            </g>
            <g id="beta-splash-dots" />
          </svg>

          <div className="logo">
            <svg viewBox="300 240 420 540" aria-hidden="true">
              <path fill="#FFB300" d="M373.279 262.711C406.298 262.129 441.147 262.752 474.295 262.751L518.427 262.743C525.364 262.745 532.285 262.764 539.221 262.833C619.554 263.629 686.635 332.052 681.86 413.527C679.599 450.629 662.74 485.325 634.968 510.03C640.87 513.9 646.378 518.339 651.415 523.283C677.798 548.249 693.127 582.713 693.998 619.026C694.731 657.228 679.768 691.792 653.438 719.029C635.172 736.664 616.668 748.566 592.018 755.847C567.639 763.047 543.945 761.546 518.898 761.536L442.964 761.485L395.825 761.484C387.896 761.51 372.868 762.001 365.503 760.784C357.304 759.471 349.641 755.877 343.388 750.415C324.751 734.172 327.655 714.138 327.68 691.775L327.722 648L327.826 496.474L327.88 367.415L327.694 327.14C327.598 309.545 325.911 292.349 338.722 278.188C348.203 267.709 359.417 263.61 373.279 262.711Z" />
              <path fill="#111" d="M389.422 544.923L505.877 544.944L538.443 544.913C566.395 544.894 584.588 545.276 606.555 565.823C621.974 580.233 631.057 600.163 631.817 621.254C632.5 643.151 624.054 661.192 609.347 676.961L608.808 677.501C586.997 699.159 567.685 700.023 539.074 700.065L506.527 700.083L389.467 699.952L389.422 544.923Z" />
              <path fill="#111" d="M389.45 324.513L493.767 324.561L525.114 324.531C555.353 324.438 573.758 325.235 597.172 347.661C612.255 362.287 621.012 382.237 621.568 403.24C621.996 425.276 613.66 444.949 598.502 460.792C587.752 471.232 574.384 478.578 559.808 482.056C547.878 484.794 515.199 483.819 501.263 483.822L389.403 483.643L389.45 324.513Z" />
              <circle className="ping" cx="503.6" cy="404.7" r="40" />
              <circle className="ping p2" cx="503.6" cy="404.7" r="40" />
              <circle className="beacon" cx="503.6" cy="404.7" r="42" fill="#FFB300" />
            </svg>
          </div>
        </div>

        <div className="word" aria-label="B-ETA">
          <span>B</span>
          <span>-</span>
          <span>E</span>
          <span>T</span>
          <span>A</span>
        </div>
        <div className="tag">Live buses · Real ETAs</div>

        <div className="route" aria-hidden="true">
          <svg viewBox="0 0 360 80">
            <path id="beta-splash-route" className="track" d="M20 55 C70 55 90 20 140 20 S220 58 270 48 S320 28 340 28" />
            <path className="trail" pathLength={1} d="M20 55 C70 55 90 20 140 20 S220 58 270 48 S320 28 340 28" />
            <circle className="stop" cx="20" cy="55" r="6" style={{ animationDelay: "1.8s" }} />
            <circle className="stop" cx="140" cy="20" r="6" style={{ animationDelay: "2.9s" }} />
            <circle className="stop" cx="270" cy="48" r="6" style={{ animationDelay: "4.2s" }} />
            <circle className="stop" cx="340" cy="28" r="6" style={{ animationDelay: "5.2s" }} />
            <g>
              <rect x="-10" y="-13" width="16" height="3" rx="1.2" fill="#FFB300" />
              <rect x="-23" y="-10" width="46" height="18" rx="5" fill="#FFB300" />
              <rect x="-19" y="-7" width="31" height="7" rx="1.5" fill="#111" />
              <rect x="-9" y="-7" width="1.2" height="7" fill="#FFB300" />
              <rect x="1" y="-7" width="1.2" height="7" fill="#FFB300" />
              <path d="M14 -7 H19 Q22 -5 22.5 0 H14 Z" fill="#111" />
              <rect x="-16" y="3" width="11" height="4" rx="1" fill="none" stroke="#111" strokeOpacity=".55" strokeWidth="1" />
              <rect x="20.5" y="3" width="2.5" height="2.5" rx=".8" fill="#fff" />
              <circle cx="-12" cy="8.5" r="3.4" fill="#111" stroke="#FFB300" strokeWidth="1.6" />
              <circle cx="12" cy="8.5" r="3.4" fill="#111" stroke="#FFB300" strokeWidth="1.6" />
              <animateMotion dur="3.4s" begin="1.8s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 .1 .35 1">
                <mpath href="#beta-splash-route" />
              </animateMotion>
            </g>
          </svg>
        </div>

        <div className="eta">
          <i />
          <span>Next coach</span>
          <b id="beta-splash-eta">5 min</b>
        </div>
      </div>
    </>
  );
}

const SPLASH_CSS = `
#beta-splash {
  --bg:#111; --amber:#FFB300; --text:#f4efe6; --muted:#8c8578; --T:2.4s;
  position:fixed; inset:0; z-index:9999;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:env(safe-area-inset-top) 20px env(safe-area-inset-bottom);
  background:radial-gradient(110% 70% at 50% 35%, #1a1507 0%, #111 60%);
  color:var(--text);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  transition:opacity .5s ease;
  overflow:hidden;
}
#beta-splash * { box-sizing:border-box; margin:0; }
#beta-splash.done { opacity:0; pointer-events:none; }

#beta-splash .stage { position:relative; width:min(360px,88vw); max-height:44vh; aspect-ratio:370/380; animation:betaSplashFadeIn .9s .1s both; }
#beta-splash .stage > svg { width:100%; height:100%; overflow:visible; }

#beta-splash .country { fill:rgba(255,179,0,.07); stroke:rgba(255,179,0,.45); stroke-width:1.2; stroke-linejoin:round;
  stroke-dasharray:1; stroke-dashoffset:1; animation:betaSplashDraw 1.4s ease-out .1s forwards, betaSplashFillIn 1s .9s both; }

#beta-splash .ring-r { fill:none; stroke:rgba(255,179,0,.12); stroke-width:1; animation:betaSplashFadeIn .8s 1s both; }

#beta-splash .road { fill:none; stroke:rgba(255,179,0,.42); stroke-width:1.4; stroke-linecap:round; stroke-linejoin:round;
  stroke-dasharray:1; stroke-dashoffset:1; animation:betaSplashDraw 1.5s cubic-bezier(.4,.1,.3,1) forwards; }
#beta-splash .road.minor { stroke:rgba(255,179,0,.28); stroke-width:1; }

#beta-splash .sweep { transform-origin:0 0; animation:betaSplashSpin var(--T) linear 1.4s infinite, betaSplashFadeIn .6s 1.3s both; }

#beta-splash .dot { fill:var(--amber); opacity:0; transform-box:fill-box; transform-origin:center; animation:betaSplashBlip var(--T) linear infinite; }
#beta-splash .dot.city { filter:drop-shadow(0 0 4px rgba(255,179,0,.9)); }

#beta-splash .logo { position:absolute; left:50%; top:50%; width:34%; transform:translate(-50%,-50%); animation:betaSplashLogo 4.5s cubic-bezier(.3,.7,.3,1) .2s both; }
#beta-splash .logo svg { width:100%; display:block; overflow:visible; filter:drop-shadow(0 6px 28px rgba(255,179,0,.3)); }
#beta-splash .ping { fill:none; stroke:var(--amber); stroke-width:3; transform-box:fill-box; transform-origin:center; opacity:0; animation:betaSplashPing 1.8s ease-out .9s infinite; }
#beta-splash .ping.p2 { animation-delay:1.5s; }
#beta-splash .beacon { transform-box:fill-box; transform-origin:center; animation:betaSplashBeat 1.2s ease-in-out .9s infinite; }

#beta-splash .word { margin-top:14px; font-size:32px; font-weight:800; letter-spacing:.14em; display:flex; gap:.04em; }
#beta-splash .word span { opacity:0; transform:translateY(14px); animation:betaSplashRise .5s cubic-bezier(.2,.9,.3,1) both; }
#beta-splash .word span:nth-child(1){animation-delay:3.3s}
#beta-splash .word span:nth-child(2){animation-delay:3.38s;color:var(--amber)}
#beta-splash .word span:nth-child(3){animation-delay:3.46s}
#beta-splash .word span:nth-child(4){animation-delay:3.54s}
#beta-splash .word span:nth-child(5){animation-delay:3.62s}
#beta-splash .tag { margin-top:6px; font-size:12px; letter-spacing:.22em; text-transform:uppercase; color:var(--muted); animation:betaSplashFadeIn .6s 4.1s both; }

#beta-splash .route { margin-top:20px; width:min(340px,86vw); animation:betaSplashFadeIn .5s 1.5s both; }
#beta-splash .route svg { width:100%; height:auto; overflow:visible; }
#beta-splash .track { fill:none; stroke:rgba(255,255,255,.12); stroke-width:3; stroke-linecap:round; }
#beta-splash .trail { fill:none; stroke:var(--amber); stroke-width:3; stroke-linecap:round; stroke-dasharray:1; stroke-dashoffset:1; animation:betaSplashDraw 3.4s cubic-bezier(.45,.1,.35,1) 1.8s forwards; }
#beta-splash .stop { fill:#111; stroke:var(--amber); stroke-width:3; transform-box:fill-box; transform-origin:center; transform:scale(0); animation:betaSplashPop .4s cubic-bezier(.2,.9,.3,1.4) both; }

#beta-splash .eta { margin-top:16px; display:inline-flex; align-items:center; gap:10px; padding:8px 16px; border-radius:999px;
  background:rgba(255,179,0,.16); border:1px solid rgba(255,179,0,.35); font-size:14px; font-weight:600;
  animation:betaSplashFadeIn .5s 1.9s both; font-variant-numeric:tabular-nums; }
#beta-splash .eta i { width:8px; height:8px; border-radius:50%; background:var(--amber); animation:betaSplashBeat 1.2s ease-in-out infinite; }
#beta-splash .eta b { color:var(--amber); min-width:4.6ch; display:inline-block; }

@keyframes betaSplashFillIn { from{fill:rgba(255,179,0,0)} to{fill:rgba(255,179,0,.07)} }
@keyframes betaSplashSpin { to{transform:rotate(360deg)} }
@keyframes betaSplashBlip { 0%{opacity:1; transform:scale(2.6)} 10%{opacity:1; transform:scale(1)} 100%{opacity:.14; transform:scale(1)} }
@keyframes betaSplashLogo {
  0%   { opacity:0; transform:translate(-50%,-50%) scale(.6); }
  14%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
  74%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
  100% { opacity:0; transform:translate(-50%,-50%) scale(1.25); filter:blur(6px); }
}
@keyframes betaSplashPing { 0%{opacity:.8; transform:scale(.6)} 100%{opacity:0; transform:scale(3.2)} }
@keyframes betaSplashBeat { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
@keyframes betaSplashFadeIn { from{opacity:0} to{opacity:1} }
@keyframes betaSplashRise { to{opacity:1; transform:none} }
@keyframes betaSplashDraw { to{stroke-dashoffset:0} }
@keyframes betaSplashPop { to{transform:scale(1)} }

@media (prefers-reduced-motion:reduce) {
  #beta-splash *, #beta-splash *::before {
    animation-duration:.01ms !important; animation-delay:0s !important; animation-iteration-count:1 !important;
  }
  #beta-splash .country, #beta-splash .road, #beta-splash .trail { stroke-dashoffset:0; }
  #beta-splash .logo { opacity:0; }
  #beta-splash .dot { opacity:.5; }
}
`;
