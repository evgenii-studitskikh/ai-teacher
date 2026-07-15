"use client";
import type { ToyInfo } from "../../lib/types";
export default function ToyScan({ onBack }: { onIdentified: (toy: ToyInfo) => void; onBack: () => void }) {
  return <button onClick={onBack}>Toy scan coming next</button>;
}
