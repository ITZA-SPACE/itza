/**
 * The methods drawer's sections. `tex` holds each formula in LaTeX (rendered with KaTeX); prose
 * (titles, symbols, assumptions) stays in `copy/en/methods.json`. `steps` replaces a formula when the
 * method is a pipeline rather than an equation.
 */
export interface MethodSection {
  id: string;
  tex?: string[];
  /** Number of `methods.<id>.step<n>` copy keys, for a pipeline. */
  steps?: number;
  /** Whether `methods.<id>.symbols` explains the formula's symbols. */
  symbols: boolean;
  assumptions: number;
}

export const sections: MethodSection[] = [
  {
    id: "fao56",
    tex: [
      String.raw`ET_0 = \frac{0.408\,\Delta\,(R_n - G) + \gamma\,\frac{900}{T + 273}\,u_2\,(e_s - e_a)}{\Delta + \gamma\,(1 + 0.34\,u_2)}`,
      String.raw`ET_c = K_c \times ET_0`,
    ],
    symbols: true,
    assumptions: 3,
  },
  {
    id: "waterBalance",
    tex: [
      String.raw`D_{r,i} = D_{r,i-1} - (P_i - RO_i) + ET_{c,adj,i} + DP_i`,
      String.raw`K_s = \begin{cases} 1 & D_r \le RAW \\[4pt] \dfrac{TAW - D_r}{(1 - p)\,TAW} & D_r > RAW \end{cases}`,
    ],
    symbols: true,
    assumptions: 4,
  },
  {
    id: "scoring",
    tex: [
      String.raw`\mathrm{Score}(R, y) = \sum_{k} w_k\, c_k(R, y), \qquad \sum_{k} w_k = 1`,
      String.raw`\mathrm{Win\ rate}(R) = \frac{\#\{\, y : \mathrm{Score}(R, y) > \mathrm{Score}(B, y) \,\}}{N}`,
    ],
    symbols: true,
    assumptions: 3,
  },
  {
    id: "monteCarlo",
    tex: [
      String.raw`K_c \pm 10\%, \quad TAW \pm 20\%, \quad t_{\mathrm{sow}} \pm 10\ \mathrm{d}, \quad p \pm 0.1 \qquad (n = 200)`,
    ],
    symbols: true,
    assumptions: 2,
  },
  {
    id: "deltaChange",
    tex: [
      String.raw`T_{2050}(d) = T_{\mathrm{obs}}(d) + s\,\Delta T_m`,
      String.raw`P_{2050}(d) = P_{\mathrm{obs}}(d) \cdot \bigl(1 + s\,(r_m - 1)\bigr)`,
    ],
    symbols: true,
    assumptions: 4,
  },
  { id: "fieldMemory", steps: 4, symbols: false, assumptions: 3 },
];
