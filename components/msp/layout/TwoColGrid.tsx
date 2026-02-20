import type { ReactNode } from 'react';

type TwoColGridProps = {
  left: ReactNode;
  right: ReactNode;
};

export default function TwoColGrid({ left, right }: TwoColGridProps) {
  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-6">{left}</div>
      <div className="col-span-12 lg:col-span-6">{right}</div>
    </div>
  );
}
