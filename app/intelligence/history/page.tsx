import { redirect } from 'next/navigation';
import EnginePlaceholder from '@/components/intelligence/EnginePlaceholder';

export const metadata = { title: 'Signal History' };

export default function HistoryPage() {
  redirect('/intelligence');
  return (
    <EnginePlaceholder
      title="Signal History"
      description="Historical snapshots of every engine and Master signal, captured over time."
    />
  );
}
