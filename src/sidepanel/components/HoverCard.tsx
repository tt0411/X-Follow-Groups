import { createPortal } from 'react-dom';
import type { XUser } from '../../shared/types';
import { VerifiedBadge } from './VerifiedBadge';

export async function openProfile(handle: string) {
  const url = `https://x.com/${handle}`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && tab.url?.startsWith('https://x.com/')) chrome.tabs.update(tab.id, { url });
  else chrome.tabs.create({ url });
}

const WIDTH = 300;
const EST_HEIGHT = 300;

interface Props {
  user: XUser;
  alias?: string;
  anchor: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
}

/** Mirrors X's own profile hover card. */
export function HoverCard({ user, alias, anchor, onEnter, onLeave }: Props) {
  const width = Math.min(WIDTH, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left + 12, window.innerWidth - width - 8));
  const below = anchor.bottom + EST_HEIGHT < window.innerHeight || anchor.top < EST_HEIGHT;
  const position = below ? { top: anchor.bottom + 4 } : { bottom: window.innerHeight - anchor.top + 4 };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    // React events bubble through portals, so keep them from reaching the card's drag/edit handlers.
    <div
      className="hover-card"
      style={{ left, width, ...position }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
    >
      <div className="hc-top">
        {user.avatar ? (
          <img className="hc-avatar" src={user.avatar.replace(/_normal(\.\w+)$/, '_200x200$1')} alt="" />
        ) : (
          <div className="hc-avatar" />
        )}
        <button className="hc-btn" onClick={() => openProfile(user.handle)}>
          查看主页
        </button>
      </div>
      <div className="hc-name">
        <span className="name-text">{user.name}</span>
        {user.verified && <VerifiedBadge type={user.verified} />}
      </div>
      <div className="hc-handle">
        @{user.handle}
        {user.followsYou && <span className="hc-follows">关注了你</span>}
      </div>
      {alias && <div className="hc-alias">别名：{alias}</div>}
      {user.bio && <div className="hc-bio">{user.bio}</div>}
      {(user.followingCount != null || user.followersCount != null) && (
        <div className="hc-stats">
          {user.followingCount != null && (
            <span>
              <b>{user.followingCount.toLocaleString()}</b> 正在关注
            </span>
          )}
          {user.followersCount != null && (
            <span>
              <b>{user.followersCount.toLocaleString()}</b> 关注者
            </span>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
