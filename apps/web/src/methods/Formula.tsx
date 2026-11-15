import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

/**
 * One formula typeset by KaTeX: HTML for the eye and MathML for screen readers. The LaTeX comes from
 * `content.ts`, written by the team, never from users or the network.
 */
export default function Formula({ tex }: { tex: string }) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: true,
        output: "htmlAndMathml",
        throwOnError: false,
        strict: "ignore",
      }),
    [tex],
  );
  // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output of the app's own static LaTeX.
  return <div className="formula" dangerouslySetInnerHTML={{ __html: html }} />;
}
