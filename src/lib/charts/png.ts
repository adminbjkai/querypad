/** Replace `var(--token)` references with their computed values so the SVG renders outside the page. */
function resolveVars(value: string, style: CSSStyleDeclaration): string {
  return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => style.getPropertyValue(name).trim() || "currentColor");
}

/** Rasterize the recharts SVG inside `container` (plus a legend strip) and download it as a PNG. */
export async function downloadChartPng(
  container: HTMLElement,
  legend: { label: string; color: string }[],
  filename = "chart.png"
): Promise<void> {
  const svg = container.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!svg) throw new Error("No chart to export");
  const root = getComputedStyle(document.documentElement);
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const fontFamily = getComputedStyle(svg).fontFamily;
  clone.setAttribute("font-family", fontFamily);
  for (const el of [clone, ...clone.querySelectorAll("*")]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes("var(")) el.setAttribute(attr.name, resolveVars(attr.value, root));
    }
  }

  const legendHeight = legend.length > 0 ? 28 : 0;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil((height + legendHeight) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(scale, scale);
  ctx.fillStyle = root.getPropertyValue("--surface").trim() || "#fff";
  ctx.fillRect(0, 0, width, height + legendHeight);

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render chart"));
      img.src = url;
    });
    ctx.drawImage(img, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }

  if (legend.length > 0) {
    ctx.font = `12px ${fontFamily}`;
    ctx.textBaseline = "middle";
    let x = 12;
    const y = height + legendHeight / 2;
    for (const item of legend) {
      const textWidth = ctx.measureText(item.label).width;
      if (x + textWidth + 24 > width) break;
      ctx.fillStyle = resolveVars(item.color, root);
      ctx.fillRect(x, y - 5, 10, 10);
      ctx.fillStyle = root.getPropertyValue("--muted").trim() || "#666";
      ctx.fillText(item.label, x + 16, y);
      x += textWidth + 36;
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode PNG");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
