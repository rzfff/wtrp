import type { User } from '../types'
import { STATIC_DATA } from '../api'

type Props = {
  authEnabled: boolean
  user: User | null
  authReady: boolean
  online: boolean
  authOpen: boolean
  onToggleAuth: () => void
  onLogout: () => void
}

export function TopBar({ authEnabled, user, authReady, online, authOpen, onToggleAuth, onLogout }: Props) {
  return (
    <header className="topbar">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="GrindTracker home">
        <span className="brand-mark" aria-hidden="true">GT</span>
        <span>
          <strong>WT 研发规划器</strong>
          <small>研发点计算 · 科技树</small>
        </span>
      </a>

      <div className="topbar-actions">
        <a className="tree-link" href="/wtrp/tree/tree.html" title="游戏同款样式的科技树总览">游戏样式科技树 ↗</a>
        <span className={`api-status ${online ? '' : 'is-offline'}`}>
          <i aria-hidden="true" /> {STATIC_DATA ? (online ? '数据就绪' : '目录不可用') : ('API ' + (online ? '在线' : '离线'))}
        </span>
        {!authEnabled ? (
          <span className="local-mode" title="进度保存在本设备的浏览器里。">本地进度</span>
        ) : user ? (
          <div className="user-actions">
            <span className="user-badge" title={user.email}>{user.email.slice(0, 1).toUpperCase()}</span>
            <span className="user-email">{user.email}</span>
            <button className="button button-quiet" type="button" onClick={onLogout}>Sign out</button>
          </div>
        ) : (
          <button
            className={`button button-quiet ${authOpen ? 'is-active' : ''}`}
            type="button"
            onClick={onToggleAuth}
            aria-expanded={authOpen}
            disabled={!authReady}
          >
            {authReady ? 'Sign in' : 'Checking…'}
          </button>
        )}
      </div>
    </header>
  )
}
