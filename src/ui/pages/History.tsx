import { useEffect, useState } from 'react';
import { deleteAllData, deleteAssessment, listAssessments, type AssessmentRecord } from '../../storage/db';
import { Chrome } from '../components/Cards';
import { Icon } from '../components/Icon';
import { useDraft } from '../draft';
import { go } from '../router';

export function History() {
  const { reset } = useDraft();
  const [items, setItems] = useState<AssessmentRecord[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'real' | 'sim'>('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { setItems(await listAssessments()); setError(''); }
    catch { setError('History could not be loaded. Make sure local storage is allowed by the browser.'); }
  };
  useEffect(() => { void load(); }, []);
  const remove = async (id?: number) => {
    if (!confirm(id === undefined ? 'Delete ALL CAPIRA data on this device (history, annotation crops, settings)? This cannot be undone.' : 'Delete this record? This cannot be undone.')) return;
    setBusy(true);
    try { if (id === undefined) await deleteAllData(); else await deleteAssessment(id); await load(); }
    catch { setError('The data could not be deleted. Please try again.'); }
    finally { setBusy(false); }
  };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `capira-history-${Date.now()}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const filtered = items?.filter((r) => (filter === 'all' || (filter === 'sim' ? r.simulated : !r.simulated)) && `${r.patientLabel || 'No label'} ${r.complaint} ${r.id}`.toLocaleLowerCase('en').includes(query.trim().toLocaleLowerCase('en')));
  return <Chrome back="/">
    <div className="page-heading"><div><p className="eyebrow">LOCAL DOCUMENTATION</p><h1>Assessment history</h1><p className="muted">Browse the assessments and simulations saved on this device.</p></div><button className="btn primary" onClick={() => { reset(); go('/new'); }}><Icon name="plus" size={17} />New assessment</button></div>
    {!!items?.length && <div className="history-toolbar"><label className="search-field"><Icon name="search" size={18} /><input aria-label="Search history" placeholder="Search patient label, complaint, or number…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="filter-tabs" role="group" aria-label="Assessment type">{([['all', 'All'], ['real', 'Assessments'], ['sim', 'Simulations']] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>}
    {error && <div className="card bad" role="alert"><p>{error}</p><button className="btn small" onClick={() => void load()}>Try again</button></div>}
    {items === null && !error && <div className="empty-state" role="status"><div className="loading-spinner" /><p>Loading history…</p></div>}
    {items?.length === 0 && <section className="panel"><div className="empty-state"><span className="empty-icon"><Icon name="history" size={30} /></span><h2>No assessments yet</h2><p>Your records will appear after an assessment is finished.<br />Try the simulation to get to know the flow.</p><a className="btn" href="#/simulation"><Icon name="play" size={18} />Explore the simulation</a></div></section>}
    {!!items?.length && <p className="history-count" role="status">Showing {filtered?.length} of {items.length} records</p>}
    {!!items?.length && filtered?.length === 0 && <section className="panel"><div className="empty-state"><span className="empty-icon"><Icon name="search" size={28} /></span><h3>No matching records</h3><p>Try another keyword or change the assessment filter.</p><button className="btn small" onClick={() => { setQuery(''); setFilter('all'); }}>Reset search</button></div></section>}
    {filtered?.map((r) => <article key={r.id} className="card history-card"><div className="row"><div className="history-card-title grow"><span className={`record-icon ${r.simulated ? 'lavender' : 'mint'}`}><Icon name={r.simulated ? 'flask' : 'file'} size={21} /></span><div><h2>{r.patientLabel || 'No label'}</h2><p>{r.ageYears ?? '—'} years · {new Date(r.createdAt).toLocaleString('en-US')}</p></div></div><span className={`pill ${r.simulated ? 'sim' : 'muted'}`}>{r.simulated ? 'SIMULATION' : `#${r.id}`}</span></div><div className="history-findings"><div><small>qSOFA SCORE</small>{r.qsofa.headline}</div><div><small>CAPILLARY REFILL TIME</small>{r.crt ? r.crtInterp.headline : 'Camera CRT not measured'}</div></div><div className="row"><a className="btn small primary" href={`#/result/${r.id}`}>View result<Icon name="arrow" size={15} /></a><span className="grow" /><button className="btn small danger" disabled={busy} onClick={() => void remove(r.id)} aria-label={`Delete record ${r.patientLabel || r.id}`}><Icon name="trash" size={14} />Delete</button></div></article>)}
    {!!items?.length && <div className="row" style={{ marginTop: 24 }}><button className="btn" onClick={exportJson}><Icon name="download" size={17} />Download all (JSON)</button><button className="btn danger" onClick={() => void remove()} disabled={busy}>Delete all data</button></div>}
  </Chrome>;
}
