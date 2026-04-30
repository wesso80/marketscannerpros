import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/tools/terminal?tab=options-terminal');
}
