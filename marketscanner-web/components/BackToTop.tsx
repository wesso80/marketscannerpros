"use client";
import { useEffect, useState } from "react";
export default function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 360);
    onScroll(); window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button onClick={() => window.scrollTo({top:0,behavior:"smooth"})} aria-label="Back to top"
      style={{position:"fixed",right:"16px",bottom:"16px",padding:".6rem .8rem",borderRadius:".8rem",
      border:"1px solid #27272a",background:"#111827",color:"#e5e5e5",cursor:"pointer",zIndex:50}}>
      ↑ Top
    </button>
  );
}
