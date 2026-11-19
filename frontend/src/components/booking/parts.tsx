import type { ReactNode } from 'react';
import type { Professional } from '@/types';
import { initials } from './bookingFormat';

export function StepHeader({ step, title, icon, children }: { step?: string; title: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <header>
      {step && <span className="bk-step">{step}</span>}
      {icon ? (
        <div className="bk-head">
          <span className="bk-head-icon">{icon}</span>
          <div>
            <h1 className="bk-title bk-display">{title}</h1>
            {children}
          </div>
        </div>
      ) : (
        <>
          <h1 className="bk-title bk-display">{title}</h1>
          {children}
        </>
      )}
    </header>
  );
}

export function MiniAvatar({ pro }: { pro: Pick<Professional, 'name' | 'photoUrl'> }) {
  return (
    <span className="bk-mini-avatar" aria-hidden>
      {pro.photoUrl ? <img src={pro.photoUrl} alt="" /> : initials(pro.name).slice(0, 1)}
    </span>
  );
}
