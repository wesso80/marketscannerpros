import Reviews from './Reviews';

export const metadata = {
  title: 'Reviews | MarketScanner Pros',
  description: 'What our users are saying about MarketScanner Pros trading platform.',
};

export default function ReviewsPage() {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Reviews />
    </div>
  );
}
