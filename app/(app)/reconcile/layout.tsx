import { ComposeFAB } from "./compose-fab";

export default function ReconcileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ComposeFAB />
    </>
  );
}
