import { useEffect } from 'react';
import { Popover } from './Popover';

const PRESETS = [
  '#fff3bf', '#ffe8cc', '#ffe3e3', '#fcc2d7', '#eebefa', '#d0bfff',
  '#bac8ff', '#a5d8ff', '#99e9f2', '#96f2d7', '#b2f2bb',
];

interface Props {
  anchor: DOMRect;
  value: string;
  onChange: (color: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ColorPicker({ anchor, value, onChange, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Enter' && onConfirm();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm]);

  return (
    <Popover anchor={anchor} className="color-picker" onClose={onCancel}>
      <div className="cp-swatches">
        <button
          className={`cp-swatch cp-default${value ? '' : ' on'}`}
          title="默认（无背景色）"
          onClick={() => onChange('')}
        />
        {PRESETS.map((c) => (
          <button
            key={c}
            className={`cp-swatch${c === value ? ' on' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      {/* Same row as the buttons: the native picker pops up below/above its input and would hide them otherwise. */}
      <div className="cp-actions">
        <label className="cp-custom" title={value ? value.toUpperCase() : '自定义颜色'}>
          <input type="color" value={value || PRESETS[0]} onChange={(e) => onChange(e.target.value)} />
          <span>自定义</span>
        </label>
        <button onClick={onCancel}>取消</button>
        <button className="primary" onClick={onConfirm}>
          确认
        </button>
      </div>
    </Popover>
  );
}
