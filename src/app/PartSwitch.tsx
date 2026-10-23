import { Cable, CircleDot } from 'lucide-react';
import type { ExperimentDefinition, StepContext } from '../experiments/types';

/**
 * The sheet's parts (for DCM 02: separately and self-excited) as a switch on the right of the
 * bench. Choosing a part rewires the bench as its figure; the status below always comes from the
 * actual leads, so a student's own wiring is named correctly too.
 */
export function PartSwitch({
  experiment,
  ctx,
  active,
  connected,
  onChoose,
}: {
  experiment: ExperimentDefinition;
  ctx: StepContext;
  active: string;
  connected: string | null;
  onChoose(partId: string): void;
}) {
  const parts = experiment.parts ?? [];
  const now = parts.find((p) => p.id === connected);
  const pending = now?.pending ? safe(() => now.pending!(ctx)) : null;
  return (
    <section className="part-switch" aria-label="Experiment part">
      <span className="section-label">EXCITATION · SHEET {experiment.code.split(' ')[1]}</span>
      <div className="part-options" role="radiogroup" aria-label="Choose the part to wire">
        {parts.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={active === p.id}
            className={`part-option ${active === p.id ? 'active' : ''}`}
            data-testid={`part-${p.id}`}
            onClick={() => onChoose(p.id)}
            title={`Rewire the bench as part ${p.label}'s figure. Undo restores your wiring.`}
          >
            <span className="part-letter">{p.label}</span>
            <span className="part-text">
              <strong>{p.title}</strong>
              <small>{p.summary}</small>
            </span>
          </button>
        ))}
      </div>
      <div className={`part-status ${now ? 'live' : ''}`} data-testid="part-status">
        {now ? <CircleDot size={14} /> : <Cable size={14} />}
        <span>
          {now ? (
            <>
              Your leads:{' '}
              <strong>
                part {now.label}, {now.title.toLowerCase()}
              </strong>
              . Readings go to the part {now.label} tables.
            </>
          ) : (
            'Your leads: the field F1–F2 is not wired to a supply or to the armature yet.'
          )}
          {pending && <em>{pending}</em>}
        </span>
      </div>
    </section>
  );
}

function safe<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}
