export function Mark() {
  return (
    <div className="mark" aria-hidden="true">
      <span className="mark-ring" />
      <svg className="mark-core" width="36" height="36" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="9" fill="#101827" />
        <path d="M5 24l6.2-9 3.4 4.2 5.6-8.2L27 24" fill="none" stroke="#E7D7B1" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="23.5" cy="9" r="2" fill="#F4F6F9" />
      </svg>
    </div>
  );
}
