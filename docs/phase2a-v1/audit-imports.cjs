const ts = require(process.cwd() + "/node_modules/typescript");
const fs = require("fs");
const cp = require("child_process");
const path = require("path");
const files = cp
  .execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
);
const incoming = {};
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  function visit(node) {
    let spec;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      spec = node.moduleSpecifier.text;
    if (
      ts.isCallExpression(node) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(sf) === "require")
    )
      spec = node.arguments[0].text;
    if (spec) {
      const resolved = ts.resolveModuleName(
        spec,
        path.resolve(f),
        parsed.options,
        ts.sys,
      ).resolvedModule;
      if (resolved) {
        const dest = path.relative(process.cwd(), resolved.resolvedFileName);
        (incoming[dest] ??= []).push(f);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
const cfg = fs.readFileSync("next.config.mjs", "utf8");
let redirects = [
  ...cfg.matchAll(
    /source:\s*['"]([^'"]+)['"],\s*destination:\s*['"]([^'"]+)['"]/g,
  ),
]
  .map((m) => ({
    route: m[1],
    destination: m[2],
    file: "app" + m[1] + "/page.tsx",
  }))
  .filter(
    (x) =>
      fs.existsSync(x.file) &&
      !x.route.startsWith("/admin") &&
      !x.route.startsWith("/operator"),
  );
const components = [
  "components/MobileNav.tsx",
  "components/UrgencyHero.tsx",
  "components/WorkflowHero.tsx",
  "components/MidCTA.tsx",
  "components/HomePricingCTAs.tsx",
  "app/components/Hero.tsx",
].filter((f) => fs.existsSync(f));
const result = {
  routes: redirects.map((x) => ({ ...x, importers: incoming[x.file] || [] })),
  components: components.map((file) => ({
    file,
    importers: incoming[file] || [],
  })),
};
console.log(JSON.stringify(result, null, 2));
