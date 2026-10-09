import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { XUser } from '../../shared/types';
import { ColorPicker } from './ColorPicker';
import { HoverCard } from './HoverCard';
import { Icon } from './Icon';
import { MoveMenu, type MoveTarget } from './MoveMenu';
import { VerifiedBadge } from './VerifiedBadge';

export interface UserActions {
  setAlias: (handle: string, alias: string) => void;
  setColor: (handle: string, color: string) => void;
  togglePin: (handle: string) => void;
  moveTo: (handle: string, containerId: string) => void;
}

interface Props {
  handle: string;
  user?: XUser;
  alias?: string;
  pinned: boolean;
  color?: string;
  containerId: string;
  moveTargets: MoveTarget[];
  dragDisabled: boolean;
  actions: UserActions;
}

/** Pick dark or light text so a custom background stays readable in both themes. */
function textColorFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? '#0f1419' : '#ffffff';
}

function ActionButton({ title, onClick, active, children }: { title: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      className={`icon-btn round${active ? ' active' : ''}`}
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      {children}
    </button>
  );
}

export function UserCard({ handle, user, alias, pinned, color, containerId, moveTargets, dragDisabled, actions }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `u:${handle}`,
    disabled: dragDisabled,
  });
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [picker, setPicker] = useState<{ anchor: DOMRect; draft: string } | null>(null);
  const [moveAnchor, setMoveAnchor] = useState<DOMRect | null>(null);
  const displayHandle = user?.handle ?? handle;
  const shownColor = picker ? picker.draft : color;

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPreview(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<number>();
  const hideTimer = useRef<number>();
  const showHover = () => {
    clearTimeout(hideTimer.current);
    clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => cardRef.current && setHoverAnchor(cardRef.current.getBoundingClientRect()), 500);
  };
  // Short grace period lets the pointer travel from the row into the hover card.
  const hideHover = () => {
    clearTimeout(showTimer.current);
    hideTimer.current = window.setTimeout(() => setHoverAnchor(null), 150);
  };
  const keepHover = () => clearTimeout(hideTimer.current);

  useEffect(() => {
    if (!hoverAnchor) return;
    const close = () => setHoverAnchor(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [hoverAnchor]);

  useEffect(() => () => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
  }, []);

  const hoverVisible = hoverAnchor && user && !isDragging && !editing && !preview && !picker && !moveAnchor;

  const closeHover = () => {
    clearTimeout(showTimer.current);
    setHoverAnchor(null);
  };
  const togglePicker = (anchor: DOMRect) => {
    closeHover();
    setMoveAnchor(null);
    setPicker(picker ? null : { anchor, draft: color ?? '' });
  };
  const toggleMove = (anchor: DOMRect) => {
    closeHover();
    setPicker(null);
    setMoveAnchor(moveAnchor ? null : anchor);
  };
  const confirmColor = () => {
    if (picker && picker.draft !== (color ?? '')) actions.setColor(handle, picker.draft);
    setPicker(null);
  };

  const commit = (value: string) => {
    setEditing(false);
    if (value.trim() !== (alias ?? '')) actions.setAlias(handle, value.trim());
  };

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        cardRef.current = el;
      }}
      className={`user-card${isDragging ? ' dragging' : ''}${user?.unfollowed ? ' unfollowed' : ''}${shownColor ? ' colored' : ''}${pinned ? ' pinned' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        background: shownColor,
        color: shownColor ? textColorFor(shownColor) : undefined,
      }}
      {...attributes}
      {...listeners}
      onMouseEnter={showHover}
      onMouseLeave={hideHover}
      onDoubleClick={() => setEditing(true)}
    >
      {hoverVisible && (
        <HoverCard user={user} alias={alias} anchor={hoverAnchor} onEnter={keepHover} onLeave={hideHover} />
      )}
      {pinned && <span className="pin-badge">置顶</span>}
      {user?.avatar ? (
        <img
          className="avatar previewable"
          src={user.avatar}
          alt=""
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => {
            closeHover();
            setPreview(true);
          }}
        />
      ) : (
        <div className="avatar" />
      )}
      {preview &&
        user?.avatar &&
        createPortal(
          // React events bubble through portals, so keep them from reaching the card's drag/edit handlers.
          <div
            className="lightbox"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setPreview(false);
            }}
          >
            <img src={user.avatar.replace(/_normal(\.\w+)$/, '_400x400$1')} alt="" />
            <div className="lightbox-caption">
              {user.name} @{displayHandle}
            </div>
          </div>,
          document.body,
        )}
      <div className="user-info">
        <div className="user-name">
          <span className="name-text">{user?.name || displayHandle}</span>
          {user?.verified && <VerifiedBadge type={user.verified} />}
          {user?.followsYou && <span className="tag">关注了你</span>}
          {user?.unfollowed && <span className="tag">已取关</span>}
        </div>
        {!editing && alias && <div className="alias">{alias}</div>}
        {editing && (
          <input
            className="alias-input"
            autoFocus
            defaultValue={alias ?? ''}
            placeholder="输入别名，留空则删除"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit(e.currentTarget.value);
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={(e) => commit(e.currentTarget.value)}
          />
        )}
        <div className="user-sub">@{displayHandle}</div>
      </div>
      <div className="card-actions">
        <ActionButton title={pinned ? '取消置顶' : '在分组内置顶'} active={pinned} onClick={() => actions.togglePin(handle)}>
          <Icon name="pin" />
        </ActionButton>
        <ActionButton title="移动到其他分组" active={!!moveAnchor} onClick={(e) => toggleMove(e.currentTarget.getBoundingClientRect())}>
          <Icon name="move" />
        </ActionButton>
        <ActionButton title="设置背景色" active={!!picker} onClick={(e) => togglePicker(e.currentTarget.getBoundingClientRect())}>
          <Icon name="palette" />
        </ActionButton>
        {color && (
          <ActionButton title="清除背景色" onClick={() => actions.setColor(handle, '')}>
            <Icon name="eraser" />
          </ActionButton>
        )}
      </div>
      {picker && (
        <ColorPicker
          anchor={picker.anchor}
          value={picker.draft}
          onChange={(draft) => setPicker({ ...picker, draft })}
          onConfirm={confirmColor}
          onCancel={() => setPicker(null)}
        />
      )}
      {moveAnchor && (
        <MoveMenu
          anchor={moveAnchor}
          targets={moveTargets}
          current={containerId}
          onPick={(id) => {
            setMoveAnchor(null);
            actions.moveTo(handle, id);
          }}
          onClose={() => setMoveAnchor(null)}
        />
      )}
    </div>
  );
}
