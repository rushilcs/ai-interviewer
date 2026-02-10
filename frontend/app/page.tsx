import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold text-text">AI Interviewer</h1>
        <Link
          href="/ops/login"
          className="inline-block rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
        >
          Ops Login
        </Link>
      </div>
    </div>
  );
}
