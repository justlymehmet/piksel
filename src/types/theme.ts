export type ThemeVars = Record<string, string>;

export type ThemeDoc = {
  id: string;
  name: string;
  swatches?: string[];
  vars?: ThemeVars;
};
