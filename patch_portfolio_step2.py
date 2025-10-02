from pathlib import Path
p = Path("app.py")
lines = p.read_text(encoding="utf-8").splitlines()

body = [
"allocation_chart = create_portfolio_chart(positions)",
"if allocation_chart is not None:",
"    st.plotly_chart(ms_plotly_dark(allocation_chart), use_container_width=True, theme=None)",
"else:",
"    st.warning(\"No allocation data to chart — add positions or update prices.\")",
]

txt = "\n".join(lines)
# skip if already inserted (first line is unique)
if body[0] in txt:
    print("↷ col1 block already present")
else:
    for i, line in enumerate(lines):
        if line.lstrip().startswith("with col1:"):
            indent = line[:len(line)-len(line.lstrip())] + "    "
            block = [""] + [indent + b for b in body]
            lines = lines[:i+1] + block + lines[i+1:]
            p.write_text("\n".join(lines), encoding="utf-8")
            print("✓ col1 block inserted")
            break
    else:
        print("! could not find `with col1:` (no changes)")
