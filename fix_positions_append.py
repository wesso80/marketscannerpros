from pathlib import Path

p = Path("app.py")
lines = p.read_text(encoding="utf-8").splitlines()

start_kw = "positions_data.append({"
end_markers = ("with col1:", "with col2:", "st.subheader(", "tab1,", "tab2,", "tab3,", "tab4,", "st.tabs(")

i = 0
fixed = False
while i < len(lines):
    if start_kw in lines[i]:
        # get indent from the line that has .append({
        indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
        # scan forward to find a close "})"
        j = i + 1
        found_close = False
        while j < len(lines):
            t = lines[j].lstrip()
            if t.startswith("})"):
                found_close = True
                break
            if any(lines[j].lstrip().startswith(m) for m in end_markers):
                break
            j += 1
        if not found_close:
            # insert a closing line before j with matching indent + 4 spaces
            close_line = indent + "    })"
            lines.insert(j, close_line)
            fixed = True
            # skip past the inserted line
            i = j + 1
            continue
    i += 1

if fixed:
    out = "\n".join(lines)
    # sanity check: try to compile
    import ast
    ast.parse(out)
    p.write_text(out, encoding="utf-8")
    print("✓ inserted missing '})' to close positions_data.append({ ... )")
else:
    print("↷ no unclosed positions_data.append({ block found (no changes)")
