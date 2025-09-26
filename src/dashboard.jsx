import React, { useState } from "react";
}


function EmptyRow({ text }) {
return (
<div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
{text}
</div>
);
}


function PlanBadge({ tier, note }) {
return (
<div className="flex items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 dark:from-slate-900 dark:to-slate-950 dark:border-slate-700">
<div>
<p className="text-sm font-semibold">{tier} Tier</p>
<p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
</div>
<span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white">Current</span>
</div>
);
}


function TextField({ label, placeholder }) {
return (
<label className="block">
<span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
<input
placeholder={placeholder}
className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-slate-900 dark:border-slate-700"
/>
</label>
);
}


function SelectField({ label, options = [] }) {
return (
<label className="block">
<span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
<select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700">
{options.map((opt) => (
<option key={opt}>{opt}</option>
))}
</select>
</label>
);
}


function MultiCheck({ label, options = [] }) {
return (
<fieldset className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
<legend className="px-1 text-xs font-medium text-slate-500">{label}</legend>
<div className="grid grid-cols-2 gap-2">
{options.map((o) => (
<label key={o} className="inline-flex items-center gap-2 text-sm">
<input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
{o}
</label>
))}
</div>
</fieldset>
);
}


function SimpleLink({ children }) {
return (
<a href="#" className="block rounded-lg px-2 py-1.5 text-sm text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800">
{children}
</a>
);
}


function Disclosure({ summary, children }) {
return (
<details className="rounded-xl border border-slate-200 p-3 open:bg-slate-50 dark:border-slate-700 dark:open:bg-slate-900">
<summary className="cursor-pointer select-none text-sm font-medium">{summary}</summary>
<div className="mt-2">{children}</div>
</details>
);
}


function NavLink({ active, children, ...props }) {
return (
<button
{...props}
className={`rounded-lg px-3 py-2 font-medium ${active ? "bg-slate-900 text-white dark:bg-slate-700" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
>
{children}
</button>
);
}