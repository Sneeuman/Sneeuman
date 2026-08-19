// generate-lang-chart.js
// Pulls all your GitHub repos, sums up bytes of code per language across
// them, picks your top 5 languages, and renders an SVG bar chart with the
// language's icon sitting next to each bar.

import fs from "fs";

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GH_TOKEN; // GitHub token (repo:read is enough)

if (!USERNAME || !TOKEN) {
  console.error("Missing GH_USERNAME or GH_TOKEN environment variables.");
  process.exit(1);
}

// Maps GitHub's language names to simple-icons slugs (used for the icon
// next to each bar). Add more entries here if a language you use is missing.
const ICONS = {
  JavaScript: "javascript",
  TypeScript: "typescript",
  Python: "python",
  Java: "openjdk",
  "C++": "cplusplus",
  C: "c",
  "C#": "csharp",
  HTML: "html5",
  CSS: "css3",
  PHP: "php",
  Ruby: "ruby",
  Go: "go",
  Rust: "rust",
  Swift: "swift",
  Kotlin: "kotlin",
  Dart: "dart",
  Shell: "gnubash",
  Vue: "vuedotjs",
  Dockerfile: "docker",
  "Jupyter Notebook": "jupyter",
  SCSS: "sass",
};

async function githubFetch(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} for ${url}`);
  }
  return res.json();
}

async function fetchAllRepos() {
  const repos = [];
  let page = 1;
  while (true) {
    const batch = await githubFetch(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}&type=owner`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    page++;
  }
  return repos;
}

async function fetchLanguageTotals(repos) {
  const totals = {};
  for (const repo of repos) {
    if (repo.fork) continue; // skip forked repos, only count your own code
    const langs = await githubFetch(repo.languages_url);
    for (const [lang, bytes] of Object.entries(langs)) {
      totals[lang] = (totals[lang] || 0) + bytes;
    }
  }
  return totals;
}

// GitHub serves raw .svg files with a strict policy that blocks any
// externally-referenced images inside them (e.g. <image href="https://...">
// simply won't load). So instead of linking to the icon, we fetch its SVG
// source at build time and embed it directly as a base64 data URI.
const iconCache = {};

async function fetchIconDataUri(slug) {
  if (iconCache[slug]) return iconCache[slug];
  const res = await fetch(`https://cdn.simpleicons.org/${slug}`);
  if (!res.ok) {
    console.warn(`  (no icon found for "${slug}", skipping icon)`);
    iconCache[slug] = null;
    return null;
  }
  const svgText = await res.text();
  const base64 = Buffer.from(svgText, "utf8").toString("base64");
  const dataUri = `data:image/svg+xml;base64,${base64}`;
  iconCache[slug] = dataUri;
  return dataUri;
}

async function buildSVG(topLangs, totalBytes) {
  const width = 480;
  const barHeight = 28;
  const gap = 18;
  const chartLeft = 150;
  const chartWidth = 260;
  const topPad = 20;
  const height = topPad * 2 + topLangs.length * (barHeight + gap) - gap;
  const maxBytes = topLangs[0][1];
  const barColor = "#4f8ef7";

  const rowPromises = topLangs.map(async ([lang, bytes], i) => {
    const y = topPad + i * (barHeight + gap);
    const barWidth = Math.max((bytes / maxBytes) * chartWidth, 4);
    const pct = ((bytes / totalBytes) * 100).toFixed(1);
    const slug = ICONS[lang] || lang.toLowerCase().replace(/[^a-z0-9]/g, "");
    const iconDataUri = await fetchIconDataUri(slug);
    const iconMarkup = iconDataUri
      ? `<image href="${iconDataUri}" x="8" y="${y + barHeight / 2 - 12}" width="24" height="24" />`
      : "";

    return `
    ${iconMarkup}
    <text x="${chartLeft - 10}" y="${y + barHeight / 2}" text-anchor="end"
          dominant-baseline="middle" font-family="Segoe UI, Helvetica, sans-serif"
          font-size="14" font-weight="700" fill="#2E9EF7">${lang}</text>
    <rect x="${chartLeft}" y="${y}" width="${barWidth}" height="${barHeight}"
          rx="6" fill="${barColor}" />
    <text x="${chartLeft + barWidth + 8}" y="${y + barHeight / 2}"
          dominant-baseline="middle" font-family="Segoe UI, Helvetica, sans-serif"
          font-size="13" fill="#2E9EF7">${pct}%</text>`;
  });

  const rows = (await Promise.all(rowPromises)).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>text { font-weight: 500; }</style>
  <rect width="100%" height="100%" fill="transparent" />
  ${rows}
</svg>`;
}

async function main() {
  console.log(`Fetching repos for ${USERNAME}...`);
  const repos = await fetchAllRepos();

  console.log(`Fetching language breakdown for ${repos.length} repos...`);
  const totals = await fetchLanguageTotals(repos);

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const top5 = sorted.slice(0, 5);
  const totalBytes = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);

  if (top5.length === 0) {
    console.error("No language data found — check the username/token.");
    process.exit(1);
  }

  console.log("Fetching language icons...");
  const svg = await buildSVG(top5, totalBytes);
  fs.writeFileSync("lang-chart.svg", svg);

  console.log("Top 5 languages:");
  top5.forEach(([lang, bytes]) =>
    console.log(`  ${lang}: ${((bytes / totalBytes) * 100).toFixed(1)}%`)
  );
  console.log("Wrote lang-chart.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
