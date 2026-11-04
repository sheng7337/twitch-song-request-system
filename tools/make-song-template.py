# Builds docs/song-list-template.xlsx with the standard library only (no openpyxl):
# one tab per category, header row title / artist / key / YTLink, a few well-known songs.
import sys
import zipfile
from xml.sax.saxutils import escape

OUT = sys.argv[1]
HEAD = ["title", "artist", "key", "YTLink"]
TABS = [
    ("國語", [("晴天", "周杰倫", 0), ("小幸運", "田馥甄", -2), ("突然好想你", "五月天", None),
              ("修煉愛情", "林俊傑", None), ("後來", "劉若英", 1)]),
    ("日語", [("夜に駆ける", "YOASOBI", None), ("Lemon", "米津玄師", -1), ("紅蓮華", "LiSA", None),
              ("千本桜", "黒うさP", None)]),
    ("English", [("Someone Like You", "Adele", None), ("Shape of You", "Ed Sheeran", None),
                 ("Let It Go", "Idina Menzel", -3)]),
    ("待練勿點", [("アイドル", "YOASOBI", None), ("光年之外", "G.E.M. 鄧紫棋", None)]),
]
COLS = "ABCD"


STRINGS = []


def cell(ref, v, style=0):
    s = f' s="{style}"' if style else ""
    if isinstance(v, int):
        return f'<c r="{ref}"{s}><v>{v}</v></c>'
    if v not in STRINGS:
        STRINGS.append(v)
    return f'<c r="{ref}" t="s"{s}><v>{STRINGS.index(v)}</v></c>'


def sheet(rows):
    out = []
    for r, row in enumerate(rows, 1):
        cells = "".join(cell(f"{COLS[c]}{r}", v, 1 if r == 1 else 0) for c, v in enumerate(row) if v is not None)
        out.append(f'<row r="{r}">{cells}</row>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            '<cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/>'
            '<col min="3" max="3" width="8" customWidth="1"/><col min="4" max="4" width="44" customWidth="1"/></cols>'
            f'<sheetData>{"".join(out)}</sheetData></worksheet>')


NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
               '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
               '<Default Extension="xml" ContentType="application/xml"/>'
               '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
               '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
               '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
               + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                         for i in range(1, len(TABS) + 1))
               + '</Types>')
    z.writestr("_rels/.rels",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
               '</Relationships>')
    z.writestr("xl/workbook.xml",
               f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook {NS}><sheets>'
               + "".join(f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>' for i, (n, _) in enumerate(TABS, 1))
               + '</sheets></workbook>')
    z.writestr("xl/_rels/workbook.xml.rels",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
                         for i in range(1, len(TABS) + 1))
               + f'<Relationship Id="rId{len(TABS) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
               + f'<Relationship Id="rId{len(TABS) + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
               '</Relationships>')
    z.writestr("xl/styles.xml",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
               '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
               '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
               '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
               '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
               '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
               '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
               '</styleSheet>')
    for i, (_, songs) in enumerate(TABS, 1):
        z.writestr(f"xl/worksheets/sheet{i}.xml", sheet([HEAD] + [list(s) + [None] for s in songs]))
    z.writestr("xl/sharedStrings.xml",
               '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(STRINGS)}" uniqueCount="{len(STRINGS)}">'
               + "".join(f'<si><t>{escape(t)}</t></si>' for t in STRINGS) + '</sst>')
print("wrote", OUT)
