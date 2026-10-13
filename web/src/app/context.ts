import { createContext, useContext } from "react";
import type { Cave } from "./boot.ts";

export const CaveContext = createContext<Cave | undefined>(undefined);

export function useCave(): Cave {
  const cave = useContext(CaveContext);
  if (!cave) throw new Error("useCave outside CaveContext");
  return cave;
}
