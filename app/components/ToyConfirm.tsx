"use client";
import type { ToyInfo } from "../../lib/types";
export default function ToyConfirm({ toy, onConfirm }: { toy: ToyInfo; onConfirm: () => void; onRetake: () => void }) {
  return <button onClick={onConfirm}>Use {toy.name}</button>;
}
