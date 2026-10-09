import { Popover } from './Popover';

export interface MoveTarget {
  id: string;
  name: string;
}

interface Props {
  anchor: DOMRect;
  targets: MoveTarget[];
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

export function MoveMenu({ anchor, targets, current, onPick, onClose }: Props) {
  return (
    <Popover anchor={anchor} className="move-menu" onClose={onClose}>
      <div className="mm-title">移动到</div>
      <div className="mm-list">
        {targets.map((t) => (
          <button key={t.id} className="mm-item" disabled={t.id === current} onClick={() => onPick(t.id)}>
            <span className="mm-name">{t.name}</span>
            {t.id === current && <span className="mm-current">当前</span>}
          </button>
        ))}
      </div>
      {targets.length < 2 && <div className="mm-hint">还没有其他分组，先点「+ 分组」创建</div>}
    </Popover>
  );
}
