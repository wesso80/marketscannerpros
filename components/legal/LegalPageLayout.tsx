import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

type Heading = { id: string; text: string };

const PROSE =
  "prose prose-invert prose-emerald max-w-none prose-headings:text-slate-100 prose-a:text-emerald-400 prose-strong:text-slate-200";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function uniqueId(used: Set<string>, id: string): string {
  if (!used.has(id)) {
    used.add(id);
    return id;
  }
  let n = 2;
  while (used.has(`${id}-${n}`)) n += 1;
  const next = `${id}-${n}`;
  used.add(next);
  return next;
}

function prepareLegalContent(node: ReactNode): { content: ReactNode; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();

  const walk = (current: ReactNode): ReactNode => {
    if (Array.isArray(current)) {
      return current.map((child, index) => {
        const mapped = walk(child);
        if (!isValidElement(mapped) || mapped.key != null) return mapped;
        return cloneElement(mapped, { key: `legal-${index}` });
      });
    }
    if (!isValidElement(current)) return current;

    const props = current.props as { children?: ReactNode; id?: string; className?: string };
    const nextChildren = walk(props.children);

    if (current.type === "h2") {
      const text = normalizeSpace(textOf(props.children));
      const id = uniqueId(used, (props.id && props.id.trim()) || slugifyHeading(text));
      headings.push({ id, text });
      const className = [props.className, "scroll-mt-[72px]"].filter(Boolean).join(" ");
      return cloneElement(current as ReactElement<{ id?: string; className?: string; children?: ReactNode }>, {
        id,
        className,
        children: nextChildren,
      });
    }

    if (nextChildren !== props.children) {
      return cloneElement(current as ReactElement<{ children?: ReactNode }>, {
        children: nextChildren,
      });
    }
    return current;
  };

  return { content: walk(node), headings };
}

function TocList({ headings }: { headings: Heading[] }) {
  return (
    <ul className="m-0 list-none space-y-1.5 p-0">
      {headings.map((heading) => (
        <li key={heading.id} className="m-0 p-0">
          <a
            href={`#${heading.id}`}
            className="block break-words text-sm leading-6 text-emerald-400 no-underline hover:underline"
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function LegalPageLayout({ children }: { children: ReactNode }) {
  const { content, headings } = prepareLegalContent(children);

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] px-[8px] py-16 text-slate-200 min-[1280px]:px-[24px]">
      <div className="mx-auto w-full min-w-0 min-[1280px]:grid min-[1280px]:max-w-[1048px] min-[1280px]:grid-cols-[220px_minmax(0,800px)] min-[1280px]:items-start min-[1280px]:gap-[28px]">
        <aside
          data-legal-chrome="toc"
          className="hidden min-w-0 min-[1280px]:sticky min-[1280px]:top-[72px] min-[1280px]:block min-[1280px]:max-h-[calc(100vh-96px)] min-[1280px]:overflow-y-auto"
        >
          <nav aria-label="On this page">
            <p className="mb-3 text-sm font-semibold text-emerald-400">On this page</p>
            <TocList headings={headings} />
          </nav>
        </aside>

        <div className="min-w-0 w-full rounded-3xl border border-emerald-500/20 bg-[var(--msp-card)] px-[10px] py-8 shadow-2xl min-[1280px]:w-[800px] min-[1280px]:max-w-[800px] min-[1280px]:p-12">
          <details
            data-legal-chrome="toc"
            className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 min-[1280px]:hidden"
          >
            <summary className="cursor-pointer text-sm font-semibold text-emerald-400">On this page</summary>
            <nav aria-label="On this page" className="mt-3">
              <TocList headings={headings} />
            </nav>
          </details>

          <div data-legal-prose className={PROSE}>
            {content}
          </div>
        </div>
      </div>
    </main>
  );
}
