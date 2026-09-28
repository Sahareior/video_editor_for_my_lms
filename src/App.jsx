import Header from './components/Header.jsx';
import LeftPanel from './components/LeftPanel.jsx';
import PreviewStage from './components/PreviewStage.jsx';
import Transport from './components/Transport.jsx';
import Timeline from './components/Timeline.jsx';
import Inspector from './components/Inspector.jsx';
import { useStudio } from './state/StudioContext.jsx';

export default function App() {
  const { recording, status } = useStudio();
  return (
    <div className={'app' + (recording ? ' locked' : '')}>
      <Header />
      <div className="main">
        <LeftPanel />
        <div className="colC">
          <PreviewStage />
          <Transport />
          <Timeline />
        </div>
        <Inspector />
      </div>
      <div className="status">{status}</div>
    </div>
  );
}
