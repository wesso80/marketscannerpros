"use client";
import { useEffect, useState } from "react";
const KEY = "msp-consent"; // "accepted" | "declined"

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem(KEY)) setShow(true); } catch {} }, []);
  const accept = () => { try { localStorage.setItem(KEY, "accepted"); } catch {}; setShow(false); };
  const decline = () => { try { localStorage.setItem(KEY, "declined"); } catch {}; setShow(false); };
  if (!show) return null;
  return (
    <div className="cookie">
      <div className="container cookie-row">
        <div className="cookie-text">
          <strong>Cookies & Analytics</strong>
          <div style={{opacity:.9, marginTop:6}}>
            We use essential cookies. Optional analytics help improve the app.
            See our <a href="/privacy">Privacy Policy</a>.
          </div>
        </div>
        <div style={{display:"flex",gap:".5rem"}}>
          <button onClick={decline} className="btn-outline">Decline</button>
          <button onClick={accept} className="btn">Accept</button>
        </div>
      </div>
    </div>
  );
}
