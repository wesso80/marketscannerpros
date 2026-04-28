import Link from 'next/link';
import { toolWorkflows, type ToolWorkflow, type WorkflowTool } from '@/lib/toolWorkflows';

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

const nextStepByWorkflow: Record<ToolWorkflow['id'], string> = {
  find: 'Next: validate one symbol in Golden Egg.',
  validate: 'Next: inspect mechanics in Terminal.',
  mechanics: 'Next: test the research idea in Backtest.',
  test: 'Next: record the process in Journal.',
  track: 'Next: save the research loop in Workspace.',
  advanced: 'Next: return to the core workflow with clearer evidence.',
};

const coreWorkflows = toolWorkflows.filter((workflow) => workflow.id !== 'advanced');
const advancedWorkflow = toolWorkflows.find((workflow) => workflow.id === 'advanced');

const workflowJumpCards = coreWorkflows.map((workflow) => ({
  id: workflow.id,
  label: cleanWorkflowTitle(workflow.title),
  desc: workflow.subtitle,
  startTool: getPrimaryTool(workflow),
}));

function cleanWorkflowTitle(title: string) {
  return title.replace(/^\d+\.\s*/, '');
}

function getWorkflowNumber(title: string) {
  return title.match(/^\d+/)?.[0] ?? '';
}

function getPrimaryTool(workflow: ToolWorkflow) {
  return workflow.tools.find((tool) => tool.role === 'primary') ?? workflow.tools[0];
}

function ToolCard({ tool, workflow, primary = false }: { tool: WorkflowTool; workflow: ToolWorkflow; primary?: boolean }) {
  return (
    <Link
      href={tool.href}
      className={`group flex min-h-full flex-col rounded-lg border p-4 transition hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-emerald-400/[0.06] ${
        primary
          ? 'border-emerald-400/35 bg-emerald-400/[0.07] shadow-lg shadow-emerald-950/20'
          : 'border-white/10 bg-white/[0.035]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {primary ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">
                Start here
              </span>
            ) : null}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${tierTone[tool.tier]}`}>
              {tierLabel[tool.tier]}
            </span>
          </div>
          <h3 className="mt-3 text-base font-black text-white group-hover:text-emerald-200">{tool.label}</h3>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${roleTone[tool.role]}`}>
          {tool.role}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-300">{tool.description}</p>

      <div className="mt-4 grid gap-2 text-xs leading-5 text-slate-400">
        <div>
          <span className="font-bold text-slate-200">Output: </span>
          {workflow.outcome}
        </div>
        <div>
          <span className="font-bold text-slate-200">Recommended next: </span>
          {nextStepByWorkflow[workflow.id]}
        </div>
      </div>

      <div className="mt-auto pt-4 text-xs font-bold text-emerald-300/80 transition group-hover:text-emerald-200">
        Open {tool.label} -&gt;
      </div>
    </Link>
  );
}

function WorkflowSection({ workflow }: { workflow: ToolWorkflow }) {
  const primaryTool = getPrimaryTool(workflow);
  const supportingTools = workflow.tools.filter((tool) => tool.href !== primaryTool?.href);

  return (
    <section id={workflow.id} className="scroll-mt-24 border-t border-white/10 py-8 first:border-t-0">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] lg:items-start">
        <div className="lg:sticky lg:top-16">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-sm font-black text-emerald-200">
            {getWorkflowNumber(workflow.title)}
          </div>
          <h2 className="mt-3 text-2xl font-black text-white">{cleanWorkflowTitle(workflow.title)}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{workflow.subtitle}</p>
          <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs leading-5 text-emerald-100">
            <div><span className="font-bold text-emerald-300">Outcome:</span> {workflow.outcome}</div>
            <div className="mt-2 font-semibold text-emerald-200">{nextStepByWorkflow[workflow.id]}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {primaryTool ? <div className="md:col-span-2 xl:col-span-1"><ToolCard tool={primaryTool} workflow={workflow} primary /></div> : null}
          {supportingTools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} workflow={workflow} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-[#0F172A] text-white">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Workflow map
            </div>
            <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
              Your MSP research workflow.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              Start with one clear path: find scenarios, validate one symbol, inspect market mechanics, test the idea, then track outcomes. Specialist tools stay available without overwhelming the core process.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">Recommended start</div>
            <div className="mt-1 font-bold text-white">Open Market Scanner first.</div>
            <p className="mt-1 text-xs text-emerald-100/80">Use the broad scan to create a short research queue before opening deeper tools.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-5">
          {workflowJumpCards.map((step, index) => (
            <a
              key={step.id}
              href={`#${step.id}`}
              aria-label={`Jump to ${step.label}`}
              className="group rounded-lg border border-white/10 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-emerald-400/35 hover:bg-emerald-400/[0.06]"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/15 text-xs font-black text-emerald-300">
                  {index + 1}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Step {index + 1}</span>
              </div>
              <div className="text-sm font-bold text-white group-hover:text-emerald-200">{step.label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-400">{step.desc}</div>
              <div className="mt-3 text-[11px] font-semibold text-emerald-300/80 group-hover:text-emerald-200">
                Start with {step.startTool.label}
              </div>
            </a>
          ))}
        </div>

        <div className="mt-10">
          {coreWorkflows.map((workflow) => (
            <WorkflowSection key={workflow.id} workflow={workflow} />
          ))}
        </div>

        {advancedWorkflow ? (
          <details id="advanced" className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">Advanced research</div>
                  <h2 className="mt-1 text-2xl font-black text-white">Specialist tools after the core workflow is clear.</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Open these when Scanner, Golden Egg, Terminal, Backtest, or Journal points to a specific question.</p>
                </div>
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-bold text-violet-200">Expand tools</span>
              </div>
            </summary>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {advancedWorkflow.tools.map((tool) => (
                <ToolCard key={tool.href} tool={tool} workflow={advancedWorkflow} />
              ))}
            </div>
          </details>
        ) : null}

        <div className="mt-8 rounded-lg border border-amber-400/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
          <strong className="text-amber-200">Educational use only:</strong> These tools provide research, scenario analysis,
          historical simulation, and process tracking. They do not provide personal financial advice, trade instructions, or broker execution.
        </div>
      </section>
    </main>
  );
}
