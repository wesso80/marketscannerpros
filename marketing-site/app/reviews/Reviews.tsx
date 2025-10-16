"use client";

type Testimonial = { name: string; role: string; quote: string; rating: number };

export default function Reviews() {
  const testimonials: Testimonial[] = [
    { name: "Sarah M.", role: "Day Trader", quote: "MarketScanner Pros changed how I find high-probability setups.", rating: 5 },
    { name: "James L.", role: "Swing Trader", quote: "The squeeze + confluence combo is my daily edge.", rating: 5 },
    { name: "Emily R.", role: "Investor", quote: "Clean UI, fast signals, and super easy to use.", rating: 5 },
  ];

  return (
    <section className="bg-neutral-900 text-white py-16 px-6">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-3xl font-bold mb-8">What our users are saying</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div key={i} className="p-6 rounded-2xl bg-neutral-800 shadow">
              <div className="mb-2 text-lg" aria-label={`${t.rating} star rating`}>
                {"★".repeat(t.rating)}
              </div>
              <p className="italic mb-4">“{t.quote}”</p>
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm opacity-70">{t.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
