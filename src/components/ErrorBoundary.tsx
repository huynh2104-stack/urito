import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate } from '@/i18n';
import { useApp } from '@/store/app';
import { isChunkLoadError, recordError } from '@/lib/errorLog';
import { APP_VERSION } from '@/version';

interface Props {
  children: ReactNode;
  scope?: 'app' | 'route';
}

interface State {
  error: Error | null;
}

/** 画面描画エラー時に白画面化を防ぎ、再読込と即時バックアップ導線を提示する。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void recordError('boundary', error);
    console.error('[urito] render error', error, info.componentStack);
  }

  private exportBackup = async () => {
    try {
      const { createSnapshot, downloadSnapshot } = await import('@/services/backup');
      const snap = await createSnapshot(APP_VERSION);
      await downloadSnapshot(snap);
    } catch {
      /* バックアップ生成失敗時もUI操作を妨げない */
    }
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const lang = useApp.getState().settings.lang;
    const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);
    const chunk = isChunkLoadError(error);

    return (
      <div className={this.props.scope === 'app' ? 'full-center' : 'page page-narrow'}>
        <div className="card card-body col gap-12" style={{ maxWidth: 460 }}>
          <div className="card-title">{chunk ? t('err.chunkTitle') : t('err.title')}</div>
          <p className="muted" style={{ margin: 0 }}>
            {chunk ? t('err.chunkHint') : t('err.dataSafe')}
          </p>
          <div className="row wrap gap-8 mt-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              {t('err.reload')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void this.exportBackup()}
            >
              {t('err.downloadBackup')}
            </button>
          </div>
          {this.props.scope === 'route' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => this.setState({ error: null })}
            >
              {t('err.retry')}
            </button>
          )}
        </div>
      </div>
    );
  }
}
