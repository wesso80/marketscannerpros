from pathlib import Path
p = Path("app.py")
s = p.read_text(encoding="utf-8")
imp = "from ui_helpers import ms_plotly_dark"
if imp not in s.splitlines()[0:20]:
    s = imp + "\n" + s
p.write_text(s, encoding="utf-8")
print("✓ import ensured")
