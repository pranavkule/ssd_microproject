import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

function NotFound() {
  return (
    <div className="not-found-page">
      <span className="eyebrow">404 · Route not found</span>
      <h1>This page is not available</h1>
      <p>The dashboard address may have changed, or the route may no longer exist.</p>
      <Link to="/" className="button button-primary"><ArrowLeft size={15} />Back to overview</Link>
    </div>
  );
}

export default NotFound;
