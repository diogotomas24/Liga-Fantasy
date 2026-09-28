const r = await Bun.build({
  entrypoints: ["./entry.js"], outdir: "./dist", naming: "bundle.js", target: "browser", format: "esm", minify: { whitespace: false, identifiers: true, syntax: true },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "alias", setup(b) {
    b.onResolve({ filter: /^react$|^react\/jsx(-dev)?-runtime$/ }, () => ({ path: import.meta.dir + "/react-stub.js" }));
    b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: import.meta.dir + "/lucide-stub.js" }));
  } }],
});
console.log(r.success, r.logs.map(String).join("\n"));
