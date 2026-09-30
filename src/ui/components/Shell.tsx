import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DISCLAIMER } from '../../clinical/recommendation';
import { useDeviceStatus } from '../device-status';
import { useRoute } from '../router';
import { Icon, type IconName } from './Icon';

const navigation: { path: string; label: string; icon: IconName; group: string }[] = [
  { path: '', label: 'Home', icon: 'home', group: 'MAIN' },
  { path: 'new', label: 'Assessment', icon: 'pulse', group: 'MAIN' },
  { path: 'history', label: 'History', icon: 'history', group: 'MAIN' },
  { path: 'simulation', label: 'Simulation', icon: 'play', group: 'RESEARCH' },
  { path: 'experiment', label: 'Experiment', icon: 'flask', group: 'RESEARCH' },
  { path: 'annotate', label: 'Annotate', icon: 'annotate', group: 'RESEARCH' },
  { path: 'about', label: 'About CAPIRA', icon: 'info', group: 'INFORMATION' },
];

export function Chrome({ children, simulated = false, back, wide = false }: { children: ReactNode; simulated?: boolean; back?: string; wide?: boolean }) {
  const [page] = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { ready, online, offlineLabel } = useDeviceStatus();
  const active = ['scan', 'result'].includes(page) ? 'new' : page;
  const title = navigation.find((n) => n.path === active)?.label ?? 'CAPIRA';
  useEffect(() => {
    document.title = `${title} · CAPIRA`;
    setMenuOpen(false);
  }, [title, page]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <a className="brand-lockup" href="#/" aria-label="CAPIRA home"><span className="brand-symbol"><Icon name="pulse" size={28} /></span><span><strong>CAPIRA<span className="brand-dot">.</span></strong><small>Smart Capillary Assessment</small></span></a>
        <div className="workspace-label"><span className="status-dot" /> Assessment workspace <span className="workspace-tag">BETA</span></div>
        <nav id="main-navigation" aria-label="Main navigation">
          {['MAIN', 'RESEARCH', 'INFORMATION'].map((group) => <div className="nav-group" key={group}><p className="nav-label">{group}</p>{navigation.filter((n) => n.group === group).map((n) => <a key={n.path} href={`#/${n.path}`} onClick={() => setMenuOpen(false)} className={`nav-item ${active === n.path ? 'active' : ''}`} aria-current={active === n.path ? 'page' : undefined}><Icon name={n.icon} /><span>{n.label}</span>{active === n.path && <span className="nav-active-dot" />}</a>)}</div>)}
        </nav>
        <div className="sidebar-bottom"><div className="local-note"><Icon name="shield" size={22} /><div><b>Data stays on the device</b><p>Private. Local. Under your control.</p></div></div><div className="sidebar-version"><span>CAPIRA v{__APP_VERSION__}</span><span>Research prototype</span></div></div>
      </aside>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="workspace">
        <header className="workspace-header">
          <div className="row"><button ref={menuButton} className="icon-button mobile-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} /></button><span className="header-brand">CAPIRA<span>.</span></span><span className="header-breadcrumb">Workspace <span>/</span> <b>{title}</b></span></div>
          <div className="header-status"><span className={`connection-state ${online ? '' : 'is-offline'}`}><span className="status-dot" />{online ? 'Connected' : 'No internet'}</span><span className="header-divider" /><span className="device-avatar" title="Local storage"><Icon name="shield" size={18} /></span></div>
        </header>
        <div className="persistent-notices"><div className="disclaimer" role="note"><Icon name="info" size={15} /><span>{DISCLAIMER}</span><a href="#/about">Learn more <span aria-hidden="true">↗</span></a></div>
        {simulated && <div className="sim-banner" role="status"><Icon name="flask" size={16} /> SIMULATION — NOT PATIENT DATA</div>}
        </div>
        <main id="main-content" tabIndex={-1} className={`app ${wide ? 'app-wide' : ''}`}>
          {back !== undefined && <a className="back-link" href={`#${back}`}><Icon name="back" size={16} />Back{back === '/' ? ' to home' : ''}</a>}
          {children}
          <footer className="page-footer"><span>CAPIRA <span className="footer-dot">·</span> Designed to support your judgment.</span><span className={ready ? 'offline-ready' : ''}><Icon name="shield" size={13} />{offlineLabel}</span></footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Quick navigation">{navigation.slice(0, 4).map((n) => <a key={n.path} href={`#/${n.path}`} className={active === n.path ? 'active' : ''} aria-current={active === n.path ? 'page' : undefined}><Icon name={n.icon} size={21} /><span>{n.label}</span></a>)}</nav>
    </div>
  );
}
