import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appDir = path.join(root, 'app');

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(walk(fullPath));
    } else {
      out.push(fullPath);
    }
  }
  return out;
}

const files = walk(appDir);
const pageFiles = files.filter((filePath) => filePath.endsWith(path.join('page.tsx')));

function toRoute(filePath) {
  const relativePath = path.relative(appDir, filePath).split(path.sep).join('/');
  if (relativePath === 'page.tsx') return '/';
  return `/${relativePath.replace(/\/page\.tsx$/, '')}`;
}

const routes = [...new Set(pageFiles.map(toRoute))].sort();
const dynamicRoutes = routes.filter((routePath) => routePath.includes('['));

function makeDynamicRegex(routePath) {
  let escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/\\\[\\\.\\\.\\\.[^\\\]]+\\\]/g, '[^/]+(?:/.*)?');
  escaped = escaped.replace(/\\\[[^\\\]]+\\\]/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

const dynamicMatchers = dynamicRoutes.map(makeDynamicRegex);

function matchesRoute(linkPath) {
  if (routes.includes(linkPath)) return true;
  return dynamicMatchers.some((regex) => regex.test(linkPath));
}

const codeFiles = files.filter((filePath) => /\.(ts|tsx)$/.test(filePath));
const patterns = [
  /href\s*=\s*"(\/[^"#?]*)"/g,
  /href\s*=\s*'(\/[^'#?]*)'/g,
  /href\s*=\s*\{\s*"(\/[^"#?]*)"\s*\}/g,
  /href\s*=\s*\{\s*'(\/[^'#?]*)'\s*\}/g,
  /router\.push\(\s*"(\/[^"#?]*)"\s*\)/g,
  /router\.push\(\s*'(\/[^'#?]*)'\s*\)/g,
  /router\.replace\(\s*"(\/[^"#?]*)"\s*\)/g,
  /router\.replace\(\s*'(\/[^'#?]*)'\s*\)/g,
  /redirect\(\s*"(\/[^"#?]*)"\s*\)/g,
  /redirect\(\s*'(\/[^'#?]*)'\s*\)/g,
  /window\.location\.href\s*=\s*"(\/[^"#?]*)"/g,
  /window\.location\.href\s*=\s*'(\/[^'#?]*)'/g,
];

const findings = [];
for (const filePath of codeFiles) {
  const relativeFile = path.relative(root, filePath).split(path.sep).join('/');
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line))) {
        const target = match[1];
        if (!target || target.startsWith('/api/')) continue;
        if (!matchesRoute(target)) {
          findings.push({
            file: relativeFile,
            line: index + 1,
            target,
            snippet: line.trim(),
          });
        }
      }
    }
  }
}

console.log(JSON.stringify({ routes, findings }, null, 2));