import { useEffect, useRef, useState } from 'react';

export function DeviceValue({
  x,
  y,
  width,
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  x: number;
  y: number;
  width: number;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function apply() {
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n);
    else setDraft(String(value));
  }
  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height="34"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <label className="device-value">
        <input
          aria-label={label}
          title={`Enter ${label.toLowerCase()} (${min}–${max} ${unit})`}
          type="number"
          min={min}
          max={max}
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(String(value));
              e.currentTarget.blur();
            }
          }}
        />
        <span>{unit}</span>
      </label>
    </foreignObject>
  );
}

export function ValueKnob({
  x,
  y,
  label,
  value,
  min,
  max,
  step,
  onChange,
  small = false,
}: {
  x: number;
  y: number;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  small?: boolean;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; value: number; next: number } | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n * 100) / 100));
  const angle =
    -135 + Math.min(1, Math.max(0, (preview ?? value) / (max > 100 ? 5000 : max))) * 270;
  return (
    <g
      transform={`translate(${x} ${y}) scale(${small ? 0.75 : 1})`}
      className="value-knob"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={preview ?? value}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        drag.current = { x: e.clientX, y: e.clientY, value, next: value };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        e.stopPropagation();
        const d = drag.current;
        d.next = clamp(d.value + Math.round((e.clientX - d.x - (e.clientY - d.y)) / 4) * step);
        setPreview(d.next);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (drag.current) onChange(drag.current.next);
        drag.current = null;
        setPreview(null);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setPreview(null);
      }}
      onKeyDown={(e) => {
        if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          onChange(
            e.key === 'Home'
              ? min
              : e.key === 'End'
                ? max
                : clamp(value + (['ArrowUp', 'ArrowRight'].includes(e.key) ? step : -step)),
          );
        }
      }}
    >
      <title>
        {label}: drag up/right to increase; arrow keys adjust by {step}
      </title>
      <circle r="29" fill="#b3bbc2" stroke="#939ea7" />
      <circle r="24" fill="url(#knob)" stroke="#30383e" strokeWidth="2" />
      <circle r="18" fill="#404a52" />
      <g transform={`rotate(${angle})`}>
        <path d="M0 -18V-10" stroke="#edf1f4" strokeWidth="3" strokeLinecap="round" />
      </g>
      {preview !== null && (
        <g>
          <rect x="-38" y="-52" width="76" height="21" rx="4" fill="#243849" />
          <text y="-37" textAnchor="middle" fill="#fff" fontSize="12">
            {preview}
          </text>
        </g>
      )}
    </g>
  );
}
