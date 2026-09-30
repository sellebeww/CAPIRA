import { useEffect, useState } from 'react';
import { db, type AssessmentRecord } from '../../storage/db';
import { Chrome } from '../components/Cards';
import { Icon, type IconName } from '../components/Icon';
import { useDeviceStatus } from '../device-status';
import { useDraft } from '../draft';
import { go } from '../router';

function RefillIllustration() {
  return <div className="refill-visual" aria-hidden="true">
    <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
    <div className="visual-cross cross-one">+</div><div className="visual-cross cross-two">+</div>
    <div className="scan-illustration"><div className="scan-corner tl" /><div className="scan-corner tr" /><div className="scan-corner bl" /><div className="scan-corner br" /><svg viewBox="0 0 150 180" fill="none"><path d="M47 174V51C47 12 105 12 105 51v123" fill="#f1d3bb" /><path d="M57 69V48c0-25 37-25 37 0v21c0 17-37 17-37 0Z" fill="#fff0e5" stroke="#dfb7a5" strokeWidth="1.5" /><path d="M57 102c9 5 27 5 37 0M57 109c9 5 27 5 37 0" stroke="#d6ae96" strokeWidth="2" strokeLinecap="round" /><rect x="37" y="29" width="78" height="66" rx="12" stroke="#7ae0bd" strokeWidth="1.5" strokeDasharray="5 4" /><path d="M25 83h102" stroke="#7ae0bd" strokeWidth="2" /></svg><span className="scan-label">MEASUREMENT AREA</span></div>
    <div className="visual-signal"><span><i /> Recovery signal illustration</span><svg viewBox="0 0 210 54"><path d="M0 12h25c12 0 13 31 26 31h27c19 0 19-33 48-33h84" fill="none" stroke="#63d6b1" strokeWidth="2.5" /><path d="M0 52h210" stroke="#ffffff20" strokeDasharray="3 4" /></svg><div><span>Press</span><span>Release & recover</span></div></div>
    <span className="visual-chip"><Icon name="camera" size={15} /> Your device camera</span>
  </div>;
}

export function Home() {
  const { reset } = useDraft();
  const { ready, offlineLabel } = useDeviceStatus();
  const [summary, setSummary] = useState<{ total: number; today: number; recent: AssessmentRecord[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    void Promise.all([db.assessments.count(), db.assessments.where('createdAt').aboveOrEqual(midnight.getTime()).count(), db.assessments.orderBy('createdAt').reverse().limit(3).toArray()]).then(([total, today, recent]) => { if (active) setSummary({ total, today, recent }); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const start = () => { reset(); go('/new'); };
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const guide: { icon: IconName; title: string; text: string }[] = [
    { icon: 'file', title: 'Enter data & vital signs', text: 'Record the patient data and vital signs for the qSOFA calculation.' },
    { icon: 'camera', title: 'Scan with the camera', text: 'Follow the CRT measurement cues for about 22 seconds.' },
    { icon: 'pulse', title: 'Review the assessment result', text: 'See the curve, signal quality, and compose a referral draft.' },
  ];
  return <Chrome wide>
    <div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Welcome to CAPIRA<span className="accent-dot">.</span></h1><p className="muted">More guided measurement. More meaningful assessment.</p></div><span className="date-label"><Icon name="clock" size={16} />{date}</span></div>
    <section className="hero-card">
      <div className="hero-copy"><span className="hero-tag"><span className="status-dot" /> SMART CAPILLARY REFILL ASSESSMENT</span><h2>A small step toward<br />a better assessment.</h2><p>Support perfusion assessment with CRT measurement and the qSOFA score. Everything is processed right on your device.</p><div className="hero-actions"><button className="btn hero-primary" onClick={start}><Icon name="plus" size={19} />New assessment<Icon name="arrow" size={18} /></button><a href="#/simulation" className="hero-demo"><Icon name="play" size={19} />Try the simulation</a></div><div className="hero-footnote"><Icon name="shield" size={14} />No data upload<span>·</span><Icon name="clock" size={14} />~22 s scan</div></div>
      <RefillIllustration />
    </section>
    <div className="stats-grid">
      <div className="stat-card"><span className="stat-icon mint"><Icon name="file" size={23} /></span><div><span className="stat-label">Total assessments</span><div className="stat-value">{summary?.total ?? '—'} <small>saved</small></div><span className="stat-caption">Includes simulation results</span></div></div>
      <div className="stat-card"><span className="stat-icon blue"><Icon name="pulse" size={23} /></span><div><span className="stat-label">Assessments today</span><div className="stat-value">{summary?.today ?? '—'} <small>assessments</small></div><span className="stat-caption">Activity on this device</span></div></div>
      <div className="stat-card"><span className="stat-icon lavender"><Icon name="shield" size={23} /></span><div><span className="stat-label">Local storage</span><div className="stat-value stat-text">{offlineLabel}</div><span className="stat-caption">{ready ? 'The app is available without internet' : 'Data is saved on your device'}</span></div></div>
    </div>
    {error && <div className="card bad" role="alert">The summary could not be loaded. Make sure the browser allows local storage, then reload the page.</div>}
    <div className="dashboard-columns">
      <section className="panel"><div className="section-heading"><div><h2>Latest assessments</h2><p>The newest records on your device</p></div><a href="#/history" className="text-link">View all<Icon name="arrow" size={16} /></a></div>
        {!summary && !error && <div className="empty-state compact" role="status"><div className="loading-spinner" /><p>Loading assessments…</p></div>}
        {summary?.recent.length === 0 && <div className="empty-state"><span className="empty-icon"><Icon name="file" size={30} /></span><h3>Start your first record</h3><p>Assessment results will be saved here.<br />You can also explore the flow through the simulation.</p><button className="btn small" onClick={start}><Icon name="plus" size={16} />Create assessment</button></div>}
        {!!summary?.recent.length && <div className="recent-list">{summary.recent.map((r) => <a className="recent-item" href={`#/result/${r.id}`} key={r.id}><span className={`record-icon ${r.simulated ? 'lavender' : 'mint'}`}><Icon name={r.simulated ? 'flask' : 'file'} size={20} /></span><div className="recent-info"><b>{r.patientLabel || 'No label'}</b><span>{new Date(r.createdAt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {r.ageYears ?? '—'} years</span></div><span className={`pill ${r.simulated ? 'sim' : 'muted'}`}>{r.simulated ? 'Simulation' : 'Assessment'}</span><Icon name="chevron" size={16} /></a>)}</div>}
        <div className="panel-note"><Icon name="shield" size={14} />Saved only in this browser and device.</div>
      </section>
      <section className="panel getting-started"><div className="section-heading"><div><h2>Three simple steps</h2><p>From measurement to documentation</p></div><span className="tiny-tag">GUIDE</span></div><div className="guide-list">{guide.map((g, i) => <div className="guide-step" key={g.title}><span className="guide-number">0{i + 1}</span><div><h3>{g.title}</h3><p>{g.text}</p></div><Icon name={g.icon} size={18} /></div>)}</div><a href="#/about" className="guide-more">Learn how CAPIRA works<Icon name="arrow" size={16} /></a></section>
    </div>
    <div className="section-heading research-heading"><div><h2>Learn & explore</h2><p>Get to know the assessment flow and support the research process.</p></div><span className="tiny-tag">RESEARCH</span></div>
    <div className="research-grid">{([
      { path: 'simulation', icon: 'play', title: 'Simulation mode', text: 'Learn the flow with synthetic scenarios, without accessing the camera.', color: 'lavender', tag: 'DEMO & TRAINING' },
      { path: 'experiment', icon: 'flask', title: 'Experiment', text: 'Compare protocols, inspect signals, and export research data.', color: 'mint', tag: 'DATA COLLECTION' },
      { path: 'annotate', icon: 'annotate', title: 'Blinded annotation', text: 'Mark the release and recovery frames independently.', color: 'peach', tag: 'DATA VALIDATION' },
    ] as const).map((r) => <a className="research-card" key={r.path} href={`#/${r.path}`}><div className="research-top"><span className={`stat-icon ${r.color}`}><Icon name={r.icon} size={23} /></span><Icon name="arrow" size={18} /></div><span className="research-tag">{r.tag}</span><h3>{r.title}</h3><p>{r.text}</p></a>)}</div>
    <div className="research-notice"><span className="notice-icon"><Icon name="info" size={21} /></span><div><b>Developed for research, with transparency.</b><p>CAPIRA has not been validated for clinical use. Measurement results support, and do not replace, the judgment of health workers.</p></div><a href="#/about" className="text-link">About the app<Icon name="arrow" size={16} /></a></div>
  </Chrome>;
}
