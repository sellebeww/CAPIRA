import { Component, type ReactNode } from 'react';
import { Chrome } from './components/Cards';
import { DraftProvider } from './draft';
import { About } from './pages/About';
import { Annotate } from './pages/Annotate';
import { Experiment } from './pages/Experiment';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { Result } from './pages/Result';
import { Scan } from './pages/Scan';
import { Simulation } from './pages/Simulation';
import { Vitals } from './pages/Vitals';
import { useRoute } from './router';

function Routes() {
  const [page, params] = useRoute();
  switch (page) {
    case 'new':
      return <Vitals />;
    case 'scan':
      return <Scan />;
    case 'result':
      return <Result key={params[0]} id={Number(params[0])} />;
    case 'history':
      return <History />;
    case 'simulation':
      return <Simulation />;
    case 'experiment':
      return <Experiment />;
    case 'annotate':
      return <Annotate />;
    case 'about':
      return <About />;
    case '':
      return <Home />;
    default:
      return <Chrome back="/"><div className="card empty-state"><h1>Page not found</h1><p>Check the page address or go back to the home page.</p><a className="btn primary" href="#/">Back to home</a></div></Chrome>;
  }
}

export function App() {
  return (
    <DraftProvider>
      <AppBoundary><Routes /></AppBoundary>
    </DraftProvider>
  );
}

class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="app"><section className="card"><h1>This page could not be displayed</h1><p>Something went wrong in the app. Reload to try again. Data that has already been saved stays on this device.</p><button className="btn primary" onClick={() => { window.location.hash = '/'; window.location.reload(); }}>Back to home</button></section></div>;
    return this.props.children;
  }
}
