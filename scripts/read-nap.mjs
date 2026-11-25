import fs from "node:fs";
import path from "node:path";

/**
 * Le os campos públicos da fonte NAP TypeScript usada pelo portal.
 * Os scripts de prerender são Node ESM e não devem manter uma segunda cópia
 * de nome, telefone ou horários comerciais.
 */
export function readNap() {
  const sourcePath = path.resolve("src/lib/nap.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const value = (pattern, label) => {
    const match = source.match(pattern);
    if (!match) throw new Error(`NAP canônico sem ${label}: ${sourcePath}`);
    return match[1];
  };
  const daysBlock = value(/^\s*days:\s*\[([^\]]+)\]/m, "days");
  const days = [...daysBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!days.length) throw new Error("NAP canônico sem dias de atendimento");
  const name = value(/^\s*name:\s*"([^"]+)"/m, "name");
  const alternateName = value(/^\s*alternateName:\s*"([^"]+)"/m, "alternateName");
  const url = value(/^\s*url:\s*"([^"]+)"/m, "url");
  const phone = value(/export const NAP_PHONE_E164\s*=\s*"([^"]+)"/, "telefone E.164");
  const opens = value(/^\s*opens:\s*"([^"]+)"/m, "opens");
  const closes = value(/^\s*closes:\s*"([^"]+)"/m, "closes");
  return Object.freeze({
    name, alternateName, url, phone, opens, closes, days,
    openingHoursSpecification: [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: days,
      opens,
      closes,
    }],
  });
}
