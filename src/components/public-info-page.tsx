import Link from "next/link";

type InfoSection = { title: string; paragraphs?: string[]; items?: string[] };

export function PublicInfoPage({ eyebrow, title, intro, sections, action }: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: InfoSection[];
  action?: { href: string; label: string };
}) {
  return (
    <div className="page max-w-4xl">
      <header className="border-b border-zinc-200 pb-8"><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-copy text-lg">{intro}</p>{action && <Link className="btn-primary mt-5" href={action.href}>{action.label}</Link>}</header>
      <div className="divide-y divide-zinc-200">
        {sections.map((section) => <section className="py-8" key={section.title}><h2 className="section-title">{section.title}</h2>{section.paragraphs?.map((paragraph) => <p className="mt-3 leading-7 text-zinc-600" key={paragraph}>{paragraph}</p>)}{section.items && <ul className="mt-4 grid gap-3">{section.items.map((item) => <li className="flex gap-3 leading-7 text-zinc-600" key={item}><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-blue" />{item}</li>)}</ul>}</section>)}
      </div>
    </div>
  );
}
