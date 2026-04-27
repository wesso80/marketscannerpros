import Link from 'next/link';
import { toolWorkflows } from '@/lib/toolWorkflows';

const tierLabel = {
  free: 'Free',
  pro: 'Pro',
  pro_trader: 'Pro Trader',
};

const roleTone = {
  primary: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
  advanced: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  specialist: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
};

const tierTone = {
  free: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  pro: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  pro_trader: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
};

const workflowJumpCards = toolWorkflows
  .filter((workflow) => workflow.id !== 'advanced')
  .map((workflow) => ({
    id: workflow.id,
    label: workflow.title.replace(/^\d+\.\s*/, ''),
    desc: workflow.subtitle,
    startTool: workflow.tools.find((tool) => tool.role === 'primary') ?? workflow.tools[0],
  }));

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-[#0F172A] text-white">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <div className="mb-4 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Tool workflow map
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Use MSP in one clear sequence.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            Find scenarios, validate evidence, test safely, then track outcomes. Specialist tools sit underneath that workflow.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {workflowJumpCards.map((step, index) => (
            <a
              key={step.id}
              href={`#${step.id}`}
              aria-label={`Jump to ${step.label}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-emerald-400/35 hover:bg-emerald-400/[0.06]"
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-black text-emerald-300">
                {index + 1}
              </div>
              <div className="text-sm font-bold text-white group-hover:text-emerald-200">{step.label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-400">{step.desc}</div>
              <div className="mt-2 text-[11px] font-semibold text-emerald-300/70 group-hover:text-emerald-300">
                Start with {step.startTool.label} ↓
              </div>
            </a>
          ))}
        </div>

        <div className="mt-4 flex justify-center">
          <a href="#advanced" className="text-xs font-semibold text-slate-500 transition hover:text-slate-300">
            Already know the workflow? Jump to specialist tools ↓
          </a>
        </div>

        <div className="mt-10 space-y-5">
          {toolWorkflows.map((workflow) => (
            <section key={workflow.id} id={workflow.id} className="scroll-mt-24 rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white">{workflow.title}</h2>
                  <p className="mt-1 text-sm text-slate-300">{workflow.subtitle}</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs leading-5 text-emerald-100 lg:max-w-md">
                  <div><span className="font-bold text-emerald-300">Outcome:</span> {workflow.outcome}</div>
                  {workflow.tools[0] ? (
                    <Link href={workflow.tools[0].href} className="mt-2 inline-flex font-bold text-emerald-200 hover:text-white">
                      Open {workflow.tools[0].label} →
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {workflow.tools.map((tool) => (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-emerald-400/35 hover:bg-emerald-400/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-white group-hover:text-emerald-200">{tool.label}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{tool.description}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${roleTone[tool.role]}`}>
                        {tool.role}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <span className={`rounded-full border px-2 py-1 ${tierTone[tool.tier]}`}>{tierLabel[tool.tier]}</span>
                      <span className="text-emerald-300/70 transition group-hover:text-emerald-300 group-hover:translate-x-0.5">Open →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
          <strong className="text-amber-200">Educational use only:</strong> These tools provide research, scenario analysis,
          historical simulation, and process tracking. They do not provide personal financial advice, trade instructions, or broker execution.
        </div>
      </section>
    </main>
  );
}
