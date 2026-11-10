import { Outlet } from 'react-router-dom';

function MainLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
