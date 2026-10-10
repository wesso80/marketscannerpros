const SUPPORT_EMAIL = 'support@marketscannerpros.app';

export default function ProLoungeNote({ className }: { className?: string }) {
  return (
    <p className={className}>
      Get the Pro lounge: email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from your account address and we&apos;ll add your Pro role.
    </p>
  );
}
