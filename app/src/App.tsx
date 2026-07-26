import { useState } from 'react';
import { useAppState } from './state/store';
import { Onboarding } from './screens/Onboarding';
import { PlanScreen } from './screens/PlanScreen';
import { MenuScreen } from './screens/MenuScreen';
import { ShoppingScreen } from './screens/ShoppingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { ReactElement } from 'react';
import { cx } from './ui/cx';
import { Icon } from './ui/icons';

type Tab = 'menu' | 'plan' | 'shopping' | 'settings';

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: (p: { className?: string }) => ReactElement }[] = [
    { id: 'menu', label: 'Меню', icon: Icon.Calendar },
    { id: 'plan', label: 'Продукты', icon: Icon.Chart },
    { id: 'shopping', label: 'Покупки', icon: Icon.Cart },
    { id: 'settings', label: 'Настройки', icon: Icon.Settings },
  ];

  return (
    <nav
      className="sticky bottom-0 z-30 flex border-t border-surface-200/70 bg-white/90 backdrop-blur-xl dark:border-surface-800 dark:bg-surface-950/90"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'flex flex-1 flex-col items-center gap-1 py-3 transition-colors',
            tab === t.id
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-surface-400 dark:text-surface-600',
          )}
        >
          <t.icon className="h-[22px] w-[22px]" />
          <span className="text-[11px] font-semibold">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const store = useAppState();
  const [tab, setTab] = useState<Tab>('menu');

  if (!store.state.onboarded) {
    return (
      <div className="min-h-full bg-surface-50 dark:bg-surface-950">
        <Onboarding store={store} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-surface-50 dark:bg-surface-950">
      <main className="flex-1">
        {tab === 'menu' && <MenuScreen store={store} />}
        {tab === 'plan' && <PlanScreen store={store} />}
        {tab === 'shopping' && <ShoppingScreen store={store} />}
        {tab === 'settings' && <SettingsScreen store={store} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}
