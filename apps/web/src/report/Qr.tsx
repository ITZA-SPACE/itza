import qrcode from "qrcode-generator";

/** A QR code as SVG, or nothing when the text is too long for one. Error correction L keeps it scannable on paper. */
export function Qr({ text, label }: { text: string; label: string }) {
  let svg: string;
  try {
    const qr = qrcode(0, "L");
    qr.addData(text);
    qr.make();
    svg = qr.createSvgTag({ cellSize: 1, margin: 2, scalable: true });
  } catch {
    return null;
  }
  return (
    <div
      role="img"
      aria-label={label}
      className="size-32 [&>svg]:size-full"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the SVG is generated here from our own text, never from markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
