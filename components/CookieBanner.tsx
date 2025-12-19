"use client";
import { useEffect, useState } from "react";
const KEY = "msp-consent"; // "accepted" | "essential" | "declined"

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem(KEY)) setShow(true); } catch {} }, []);
  
  const acceptAll = () => {
    try {
      localStorage.setItem(KEY, "accepted");
      window.dispatchEvent(new Event("msp-consent-accepted"));
    } catch {}
    setShow(false);
  };
  
  const acceptEssential = () => {
    try {
      localStorage.setItem(KEY, "essential");
      // Don't dispatch consent-accepted event - only essential cookies
    } catch {}
    setShow(false);
  };
  
  const decline = () => { try { localStorage.setItem(KEY, "declined"); } catch {}; setShow(false); };
  
  if (!show) return null;
  return (
    <div className="cookie">
      <div className="container cookie-row">
        <div className="cookie-text">
          <strong>Cookies & Analytics</strong>
          <div style={{opacity:.9, marginTop:6}}>
            We use essential cookies for site functionality. Optional analytics help improve the app.
            See our <a href="/privacy">Privacy Policy</a> and <a href="/cookie-policy">Cookie Policy</a>.
          </div>
        </div>
        <div style={{display:"flex",gap:".5rem", flexWrap:"wrap"}}>
          <button onClick={decline} className="btn-outline" style={{fontSize:"0.875rem"}}>Decline All</button>
          <button onClick={acceptEssential} className="btn-outline" style={{fontSize:"0.875rem"}}>Essential Only</button>
          <button onClick={acceptAll} className="btn" style={{fontSize:"0.875rem"}}>Accept All</button>
        </div>
      </div>
    </div>
  );
}