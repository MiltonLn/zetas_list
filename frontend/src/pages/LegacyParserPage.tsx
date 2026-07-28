import { useCallback, useState } from 'react';
import { LegacyGameDetail } from './legacy-parser/LegacyGameDetail';
import { LegacyHome } from './legacy-parser/LegacyHome';
import { LegacyNewList } from './legacy-parser/LegacyNewList';

type View = 'home' | 'new' | 'detail';

export default function LegacyParserPage() {
  const [view, setView] = useState<View>('home');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const goHome = useCallback(() => {
    setView('home');
    setActiveGameId(null);
  }, []);
  const goNew = () => setView('new');
  const goDetail = (id: string) => {
    setActiveGameId(id);
    setView('detail');
  };

  if (view === 'new') return <LegacyNewList onCreated={goDetail} onBack={goHome} />;
  if (view === 'detail' && activeGameId) {
    return <LegacyGameDetail gameId={activeGameId} onBack={goHome} />;
  }
  return <LegacyHome onNew={goNew} onSelect={goDetail} />;
}
