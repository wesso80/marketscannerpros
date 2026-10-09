import { redirect } from 'next/navigation';
import EnginePlaceholder from '@/components/intelligence/EnginePlaceholder';

export const metadata = { title: 'Reading History' };

export default function HistoryPage() {
  redirect('/intelligence');
  return (
    <EnginePlaceholder
      title="Reading History"
      description="Historical snapshots of every engine and Master reading, captured over time."
    />
  );
}
