'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'bb.matrix.designType';
type Design = 'classic' | 'board' | 'heatmap';

const OPTIONS: { id: Design; label: string }[] = [
  { id: 'classic', label: 'A · Classic' },
  { id: 'board', label: 'B · Status board' },
  { id: 'heatmap', label: 'C · Heatmap' },
];

export function MatrixDesignPicker({ defaultDesign = 'classic' as Design }: { defaultDesign?: Design }) {
  const [active, setActive] = useState<Design>(defaultDesign);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Design | null;
      if (saved && OPTIONS.some((o) => o.id === saved)) setActive(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.design').forEach((el) => {
      el.classList.toggle('active', el.dataset.d === active);
    });
    try {
      localStorage.setItem(STORAGE_KEY, active);
    } catch {
      // ignore quota / private mode
    }
  }, [active]);

  return (
    <div className="pickers" role="tablist">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={active === o.id}
          className={active === o.id ? 'pick active' : 'pick'}
          onClick={() => setActive(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
