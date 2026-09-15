import { Bot, Code2, Languages, MonitorCog, Moon, Power, Sun } from 'lucide-react';
import { useState } from 'react';
import TrainerDashboard from './TrainerDashboard';
import type { AppLanguage, AppTheme } from '../i18n';
import type { OcrModelOption } from '../api/ocrJobs';

type SettingsWorkspaceProps = {
  language: AppLanguage;
  theme: AppTheme;
  onLanguageChange: (language: AppLanguage) => void;
  onThemeChange: (theme: AppTheme) => void;
  models: OcrModelOption[];
  disabledModelIds: string[];
  onModelEnabledChange: (modelId: string, enabled: boolean) => void;
};

export default function SettingsWorkspace({
  language,
  theme,
  onLanguageChange,
  onThemeChange,
  models,
  disabledModelIds,
  onModelEnabledChange,
}: SettingsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'app' | 'models' | 'developer'>('app');
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
          aria-selected={activeTab === 'models'}
          className={activeTab === 'models' ? 'is-active' : ''}
          onClick={() => setActiveTab('models')}
        >
          <Bot size={16} />
          {isBosnian ? 'Postavke modela' : 'Model settings'}
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
      ) : activeTab === 'models' ? (
        <section className="app-settings-panel" role="tabpanel">
          <div className="app-settings-panel__heading">
            <span className="app-settings-panel__icon"><Bot size={20} /></span>
            <div>
              <h2>{isBosnian ? 'Postavke modela' : 'Model settings'}</h2>
            </div>
          </div>

          <div className="app-settings-list">
            <div className="app-setting-row app-setting-row--models">
              <div className="app-setting-row__copy">
                <span><Power size={17} /></span>
                <div>
                  <strong>{isBosnian ? 'Dostupni modeli' : 'Available models'}</strong>
                  <small>{isBosnian ? 'Isključeni modeli nisu prikazani u izboru modela.' : 'Disabled models are hidden from model pickers.'}</small>
                </div>
              </div>
              <div className="model-availability-list">
                {models.map((model) => {
                  const enabled = !disabledModelIds.includes(model.id);
                  const isOnlyEnabledModel = enabled && models.filter((option) => !disabledModelIds.includes(option.id)).length === 1;
                  return (
                    <div key={model.id} className="model-availability-list__item">
                      <div>
                        <strong>{model.label}</strong>
                        <small>{model.description}</small>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${enabled ? (isBosnian ? 'Isključi' : 'Disable') : (isBosnian ? 'Uključi' : 'Enable')} ${model.label}`}
                        className={`model-availability-toggle ${enabled ? 'is-enabled' : ''}`}
                        disabled={isOnlyEnabledModel}
                        onClick={() => onModelEnabledChange(model.id, !enabled)}
                      >
                        <span aria-hidden="true" />
                        {enabled ? (isBosnian ? 'Aktivan' : 'Enabled') : (isBosnian ? 'Isključen' : 'Disabled')}
                      </button>
                    </div>
                  );
                })}
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
