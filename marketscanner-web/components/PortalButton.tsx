"use client";

export default function PortalButton() {
  async function openPortal() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create portal session");
      }
    } catch (error) {
      console.error("Failed to open portal:", error);
      alert("Failed to open billing portal. Please try again.");
    }
  }

  return (
    <button 
      onClick={openPortal}
      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
    >
      Manage Subscription
    </button>
  );
}