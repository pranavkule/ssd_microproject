import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">404</p>
      <h1 className="mt-4 text-3xl font-bold text-white">Page not found</h1>
      <p className="mt-2 text-slate-400">This dashboard page does not exist yet.</p>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
      >
        Back to home
      </Link>
    </div>
  );
}

export default NotFound;
