import { Code2, Languages, MonitorCog, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import TrainerDashboard from './TrainerDashboard';
import type { AppLanguage, AppTheme } from '../i18n';

type SettingsWorkspaceProps = {
  language: AppLanguage;
  theme: AppTheme;
  onLanguageChange: (language: AppLanguage) => void;
  onThemeChange: (theme: AppTheme) => void;
};

export default function SettingsWorkspace({
  language,
  theme,
  onLanguageChange,
  onThemeChange,
}: SettingsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'app' | 'developer'>('app');
  const isBosnian = language === 'bs';

  return (
    <div className="settings-workspace">
      <div className="settings-tabs" role="tablist" aria-label={isBosnian ? 'Vrste postavki' : 'Settings sections'}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'app'}
          className={activeTab === 'app' ? 'is-active' : ''}
          onClick={() => setActiveTab('app')}
        >
          <MonitorCog size={16} />
          {isBosnian ? 'Postavke aplikacije' : 'App settings'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'developer'}
          className={activeTab === 'developer' ? 'is-active' : ''}
          onClick={() => setActiveTab('developer')}
        >
          <Code2 size={16} />
          {isBosnian ? 'Postavke za programere' : 'Developer settings'}
        </button>
      </div>

      {activeTab === 'app' ? (
        <section className="app-settings-panel" role="tabpanel">
          <div className="app-settings-panel__heading">
            <span className="app-settings-panel__icon"><MonitorCog size={20} /></span>
            <div>
              <h2>{isBosnian ? 'Postavke aplikacije' : 'App settings'}</h2>
            </div>
          </div>

          <div className="app-settings-list">
            <div className="app-setting-row">
              <div className="app-setting-row__copy">
                <span><Languages size={17} /></span>
                <div>
                  <strong>{isBosnian ? 'Jezik' : 'Language'}</strong>
                </div>
              </div>
              <div className="setting-segmented" aria-label={isBosnian ? 'Jezik aplikacije' : 'Application language'}>
                <button type="button" className={language === 'bs' ? 'is-selected' : ''} onClick={() => onLanguageChange('bs')}>BS</button>
                <button type="button" className={language === 'en' ? 'is-selected' : ''} onClick={() => onLanguageChange('en')}>EN</button>
              </div>
            </div>

            <div className="app-setting-row">
              <div className="app-setting-row__copy">
                <span>{theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}</span>
                <div>
                  <strong>{isBosnian ? 'Izgled' : 'Appearance'}</strong>
                </div>
              </div>
              <div className="setting-segmented setting-segmented--theme" aria-label={isBosnian ? 'Tema aplikacije' : 'Application theme'}>
                <button type="button" className={theme === 'dark' ? 'is-selected' : ''} onClick={() => onThemeChange('dark')}>
                  <Moon size={14} /> {isBosnian ? 'Tamna' : 'Dark'}
                </button>
                <button type="button" className={theme === 'light' ? 'is-selected' : ''} onClick={() => onThemeChange('light')}>
                  <Sun size={14} /> {isBosnian ? 'Svijetla' : 'Light'}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div role="tabpanel">
          <TrainerDashboard />
        </div>
      )}
    </div>
  );
}
