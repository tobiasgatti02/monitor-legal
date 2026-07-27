export default function Loading() {
  return (
    <main className="loading-page" aria-label="Cargando dashboard">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="skeleton skeleton-card" key={index} />
        ))}
      </div>
      <div className="skeleton-columns">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel short" />
      </div>
    </main>
  );
}
