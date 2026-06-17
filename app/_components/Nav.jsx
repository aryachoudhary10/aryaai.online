"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const cls = (p) => "toplink" + (path === p ? " active" : "");
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand"><span className="dot" /> Arya</Link>
        <nav className="topnav">
          <Link href="/scheduled" className={cls("/scheduled")}>Queue</Link>
          <Link href="/timeline" className={cls("/timeline")}>Timeline</Link>
          <Link href="/settings" className={cls("/settings")} aria-label="Settings">Settings</Link>
        </nav>
      </div>
    </header>
  );
}
