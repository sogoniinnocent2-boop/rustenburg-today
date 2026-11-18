import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <h1 className="font-serif text-4xl">This page is not on Rustenburg Today</h1>
      <p className="mt-3 text-sm">The address does not match a department, a record, or an account page.</p>
      <p className="mt-4"><Link className="font-semibold" href="/en">Back to the homepage</Link></p>
    </div>
  );
}
