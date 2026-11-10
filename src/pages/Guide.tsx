import { useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { GUIDE, GUIDE_DISCLAIMER } from '../lib/science';
import { ChevronDown, FlaskConical, Smartphone } from '../ui/icons';
import { PageHeader, cx } from '../ui/kit';

/** Ce que dit la recherche et comment l'app l'applique, avec les références. */
export function Guide({ section }: { section?: string }) {
  const [open, setOpen] = useState<string | null>(section ?? null);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!section) return;
    setOpen(section);
    const id = window.setTimeout(() => refs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => window.clearTimeout(id);
  }, [section]);

  return (
    <div>
      <BackButton fallback="reglages" />
      <PageHeader title="Guide scientifique">
        <p className="mt-2 text-[15px] leading-relaxed text-mute">Ce que montre la recherche récente sur la prise de muscle et de force, et comment l’app s’en sert. Chaque point cite ses sources.</p>
      </PageHeader>

      <div className="space-y-2.5">
        {GUIDE.map((g) => {
          const on = open === g.id;
          return (
            <section key={g.id} ref={(el) => (refs.current[g.id] = el)} className="card scroll-mt-4 overflow-hidden">
              <button className="flex w-full items-start gap-3 px-4 py-4 text-left" onClick={() => setOpen(on ? null : g.id)} aria-expanded={on}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold leading-snug">{g.title}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-mute">{g.short}</span>
                </span>
                <ChevronDown size={18} className={cx('mt-1 shrink-0 text-faint transition-transform', on && 'rotate-180')} />
              </button>
              {on && (
                <div className="animate-fade-in space-y-5 border-t border-line/60 px-4 py-4">
                  <div>
                    <h3 className="eyebrow mb-2 flex items-center gap-1.5">
                      <FlaskConical size={13} /> Ce que dit la recherche
                    </h3>
                    <ul className="space-y-2.5">
                      {g.research.map((r, i) => (
                        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
                          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="eyebrow mb-2 flex items-center gap-1.5">
                      <Smartphone size={13} /> Dans l’app
                    </h3>
                    <ul className="space-y-2.5">
                      {g.inApp.map((r, i) => (
                        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-mute">
                          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-good" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="eyebrow mb-2">Références</h3>
                    <ol className="space-y-2 text-xs leading-relaxed text-faint">
                      {g.refs.map((r, i) => (
                        <li key={i} className="select-text">
                          {r}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-4 px-1 text-xs leading-relaxed text-faint">{GUIDE_DISCLAIMER}</p>
    </div>
  );
}
