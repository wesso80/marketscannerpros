module.exports = [
"[turbopack-node]/transforms/postcss.ts { CONFIG => \"[project]/marketscanner-web/marketscanner-web/postcss.config.mjs [postcss] (ecmascript)\" } [postcss] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "build/chunks/6e21b_9f685247._.js",
  "build/chunks/[root-of-the-server]__9125ea17._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[turbopack-node]/transforms/postcss.ts { CONFIG => \"[project]/marketscanner-web/marketscanner-web/postcss.config.mjs [postcss] (ecmascript)\" } [postcss] (ecmascript)");
    });
});
}),
];