/** Remounts on every navigation inside this section, so each page settles in (260ms, reduced-motion aware). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
