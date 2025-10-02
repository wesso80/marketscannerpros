from pathlib import Path
p = Path("app.py")
lines = p.read_text(encoding="utf-8").splitlines()

body = [
"performance_chart = create_portfolio_performance_chart()",
"if performance_chart is not None:",
"    st.plotly_chart(ms_plotly_dark(performance_chart), use_container_width=True, theme=None)",
"else:",
"    st.warning(\"No performance data to chart — click **Update Prices** to build history.\")",
]

txt = "\n".join(lines)
if body[0] in txt:
    print("↷ col2 block already present")
else:
    for i, line in enumerate(lines):
        if line.lstrip().startswith("with col2:"):
            indent = line[:len(line)-len(line.lstrip())] + "    "
            block = [""] + [indent + b for b in body]
            lines = lines[:i+1] + block + lines[i+1:]
            p.write_text("\n".join(lines), encoding="utf-8")
            print("✓ col2 block inserted")
            break
    else:
        print("! could not find `with col2:` (no changes)")
