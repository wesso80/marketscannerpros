from pathlib import Path

p = Path("app.py")
lines = p.read_text(encoding="utf-8").splitlines()

start_kw = "positions_data.append({"
end_kw = "})"
block_ends = ("with col1:", "with col2:", "st.subheader(", "st.tabs(", "tab1,", "tab2,", "tab3,", "tab4,")

# find the first occurrence near the portfolio area
start_idx = -1
for i, ln in enumerate(lines):
    if start_kw in ln:
        start_idx = i
        break

if start_idx == -1:
    print("↷ could not find positions_data.append({ — no changes")
else:
    # close immediately on the same line
    lines[start_idx] = lines[start_idx].split(start_kw, 1)[0] + "positions_data.append({})  # FIXTEMP"
    # comment out until we see a matching close or a block boundary
    j = start_idx + 1
    while j < len(lines):
        raw = lines[j].lstrip()
        if raw.startswith(end_kw):
            lines[j] = "# FIXTEMP " + lines[j]
            j += 1
            break
        if any(raw.startswith(m) for m in block_ends):
            break
        lines[j] = "# FIXTEMP " + lines[j]
        j += 1

    out = "\n".join(lines)
    # sanity compile
    import ast
    ast.parse(out)
    p.write_text(out, encoding="utf-8")
    print(f"✓ temp-closed positions_data.append block at line {start_idx+1}")
