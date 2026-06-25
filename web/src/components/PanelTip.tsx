import type { ReactNode } from 'react';

interface Props {
  tip: string;
  className?: string;
  children: ReactNode;
}

/** Wrap a panel or control; hover anywhere on the box to see what it means. */
export function PanelTip({ tip, className = '', children }: Props) {
  return (
    <div className={`panel-tip-wrap${className ? ` ${className}` : ''}`}>
      <div className="panel-tip-bubble" role="tooltip">
        {tip}
      </div>
      {children}
    </div>
  );
}

interface LayerToggleProps {
  label: string;
  tip: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  storageKey?: string;
}

export function LayerToggle({ label, tip, checked, onChange, storageKey }: LayerToggleProps) {
  return (
    <PanelTip tip={tip} className="layer-toggle-wrap">
      <label className="hearing-toggle layer-toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            onChange(e.target.checked);
            if (storageKey) {
              localStorage.setItem(storageKey, String(e.target.checked));
            }
          }}
        />
        {label}
      </label>
    </PanelTip>
  );
}
