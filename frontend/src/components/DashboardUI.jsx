import { AlertCircle, LoaderCircle, RefreshCw, X } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, description, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-heading">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status, label }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const tone =
    normalized === 'healthy' || normalized === 'connected' || normalized === 'running' || normalized === 'enabled'
      ? 'good'
      : normalized === 'unhealthy' || normalized === 'error' || normalized === 'offline'
        ? 'bad'
        : normalized === 'disabled'
          ? 'muted'
          : 'warn';
  return <span className={`status-badge status-${tone}`}><span />{label || normalized.replaceAll('_', ' ')}</span>;
}

export function LoadingState({ label = 'Loading data…' }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={18} />{label}</div>;
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {onRetry ? <button className="text-button" type="button" onClick={onRetry}><RefreshCw size={14} />Retry</button> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return <div className="empty-state"><div className="empty-icon">—</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function RefreshButton({ onClick, loading = false, children = 'Refresh' }) {
  return <button className="button button-secondary" type="button" onClick={onClick} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} />{children}</button>;
}

export function Modal({ title, description, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <div><h2 id="modal-title">{title}</h2>{description ? <p>{description}</p> : null}</div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Delete', busy = false, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-message">{message}</p>
      <div className="form-actions">
        <button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="button button-danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
