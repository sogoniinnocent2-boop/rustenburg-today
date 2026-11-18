/** Route fade. This stays a server component so a missing page can still return HTTP 404. */
export function PageFlow({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div key={path} className="page-flow">
      {children}
    </div>
  );
}
