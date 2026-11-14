import type { ComponentType, ReactNode } from "react";
import type { LayoutId } from "@/components/templates/layout-context";
import { HomeA } from "@/components/templates/variants/a/HomeA";
import { ShellA } from "@/components/templates/variants/a/ShellA";
import { HomeB } from "@/components/templates/variants/b/HomeB";
import { ShellB } from "@/components/templates/variants/b/ShellB";
import { HomeC } from "@/components/templates/variants/c/HomeC";
import { ShellC } from "@/components/templates/variants/c/ShellC";

type Variant = Exclude<LayoutId, "base">;

/** Built shells by layout. A layout missing here falls back to the stub shell. */
export const SHELLS: Partial<Record<Variant, ComponentType<{ children: ReactNode }>>> = {
  a: ShellA,
  b: ShellB,
  c: ShellC,
};

/** Built home-page compositions by layout. A layout missing here renders the
 * existing home page inside the variant's shell. */
export const HOMES: Partial<Record<Variant, ComponentType>> = {
  a: HomeA,
  b: HomeB,
  c: HomeC,
};
