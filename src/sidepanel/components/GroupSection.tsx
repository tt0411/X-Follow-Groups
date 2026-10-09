import { useState, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AppState } from '../../shared/types';
import { Icon } from './Icon';
import { UserCard, type UserActions } from './UserCard';

interface BodyProps {
  containerId: string;
  handles: string[];
  expanded: boolean;
  state: AppState;
  dragDisabled: boolean;
  actions: UserActions;
}

function GroupBody({ containerId, handles, expanded, state, dragDisabled, actions }: BodyProps) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId });
  const moveTargets = [...state.groups.map((g) => ({ id: g.id, name: g.name })), { id: 'ungrouped', name: '未分组' }];
  return (
    <div ref={setNodeRef} className={`group-body${isOver ? ' over' : ''}`}>
      {expanded && (
        <SortableContext items={handles.map((h) => `u:${h}`)} strategy={verticalListSortingStrategy}>
          {handles.map((h) => (
            <UserCard
              key={h}
              handle={h}
              user={state.users[h]}
              alias={state.aliases[h]}
              pinned={!!state.pinned[h]}
              color={state.colors[h]}
              containerId={containerId}
              moveTargets={moveTargets}
              dragDisabled={dragDisabled}
              actions={actions}
            />
          ))}
          {handles.length === 0 && <div className="empty">拖拽用户到这里</div>}
        </SortableContext>
      )}
    </div>
  );
}

interface HeaderProps {
  name: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  handle?: ReactNode;
}

function GroupHeader({ name, count, expanded, onToggle, onRename, onDelete, handle }: HeaderProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="group-header">
      {handle}
      <button className={`icon-btn caret${expanded ? ' open' : ''}`} title={expanded ? '折叠' : '展开'} onClick={onToggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {editing && onRename ? (
        <input
          className="group-name-input"
          autoFocus
          defaultValue={name}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={(e) => {
            setEditing(false);
            const v = e.currentTarget.value.trim();
            if (v && v !== name) onRename(v);
          }}
        />
      ) : (
        <span className="group-name" onClick={onToggle} onDoubleClick={() => onRename && setEditing(true)}>
          {name}
        </span>
      )}
      {!editing && (
        <span className="count" onClick={onToggle}>
          {count}
        </span>
      )}
      {onDelete && (
        <button className="icon-btn round danger-hover" title="删除分组" onClick={onDelete}>
          <Icon name="trash" size={16} />
        </button>
      )}
    </div>
  );
}

type SectionProps = Omit<BodyProps, 'containerId'> &
  Omit<HeaderProps, 'handle' | 'count'> & { id: string; total: number };

export function GroupSection(props: SectionProps) {
  const { id, total, dragDisabled } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sort:${id}`,
    disabled: dragDisabled,
  });
  return (
    <section
      ref={setNodeRef}
      className={`group${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <GroupHeader
        {...props}
        count={total}
        handle={
          <span className={`grip${dragDisabled ? ' disabled' : ''}`} title="拖拽排序" {...attributes} {...listeners}>
            <Icon name="grip" size={16} />
          </span>
        }
      />
      <GroupBody {...props} containerId={id} />
    </section>
  );
}

export function UngroupedSection(props: Omit<SectionProps, 'id' | 'onRename' | 'onDelete'>) {
  return (
    <section className="group ungrouped">
      <GroupHeader {...props} count={props.total} />
      <GroupBody {...props} containerId="ungrouped" />
    </section>
  );
}
