"""Rebuild bundled canonical text from eBible's public-domain VPL archives.

Usage: python3 scripts/import-french-bibles.py /path/to/downloads
Excludes introductions, notes and illustrations. Never renumbers verses.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'src/modules/bible/data'
NAHES = 'Genèse|Exode|Lévitique|Nombres|Deutéronome|Josué|Juges|Ruth|1 Samuel|2 Samuel|1 Rois|2 Rois|1 Chroniques|2 Chroniques|Esdras|Néhémie|Esther|Job|Psaumes|Proverbes|Ecclésiaste|Cantique des cantiques|Ésaïe|Jérémie|Lamentations|Ézéchiel|Daniel|Osée|Joël|Amos|Abdias|Jonas|Michée|Nahum|Habacuc|Sophonie|Aggée|Zacharie|Malachie|Matthieu|Marc|Luc|Jean|Actes|Romains|1 Corinthiens|2 Corinthiens|Galates|Éphésiens|Philippiens|Colossiens|1 Thessaloniciens|2 Thessaloniciens|1 Timothée|2 Timothée|Tite|Philémon|Hébreux|Jacques|1 Pierre|2 Pierre|1 Jean|2 Jean|3 Jean|Jude|Apocalypse'.split('|')
CODES = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV'.split()
EDITIONS = [('fraLSG', 1000001, 'Louis Segond 1910', 'LSG'), ('frajnd', 1000002, 'J. N. Darby — édition BPC 2024', 'JND')]

def main():
    TARGET.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source, version_id, name, abbreviation in EDITIONS:
        archive = Path(sys.argv[1]) / f'{source}_vpl.zip'
        with zipfile.ZipFile(archive) as z:
            raw = z.read(f'{source}_vpl.txt').decode('utf-8-sig')
        chapters = {}
        for line in raw.splitlines():
            match = re.fullmatch(r'([A-Z0-9]+) (\d+):(\d+) (.*)', line)
            if not match:
                raise ValueError(f'Unexpected source line: {line[:80]}')
            code, chapter, verse, text = match.groups()
            book_id = CODES.index(code) + 1
            key = f'{book_id}:{chapter}'
            verses = chapters.setdefault(key, {})
            if verse in verses:
                raise ValueError(f'Duplicate {key}:{verse}')
            verses[verse] = text.strip()
        books = []
        for i, name_book in enumerate(NAHES, 1):
            nums = sorted(int(k.split(':')[1]) for k in chapters if k.startswith(f'{i}:'))
            assert nums == list(range(1, max(nums) + 1)), (source, i, nums)
            books.append(dict(id=i, name=name_book, abbreviation=CODES[i-1], chapters=max(nums), bookNumber=i, languageId='fr'))
        version = dict(id=version_id, name=name, abbreviation=abbreviation, languageId='fr')
        output = json.dumps(dict(version=version, books=books, chapters=chapters), ensure_ascii=False, separators=(',', ':')) + '\n'
        (TARGET / f'{source}.json').write_text(output, encoding='utf-8')
        manifest.append(dict(**version, source=f'https://ebible.org/details.php?id={source}', download=f'https://ebible.org/Scriptures/{source}_vpl.zip', license='Public Domain (as declared by source)', archiveSha256=hashlib.sha256(archive.read_bytes()).hexdigest(), dataSha256=hashlib.sha256(output.encode()).hexdigest(), books=len(books), chapters=len(chapters), verseRecords=sum(map(len, chapters.values())), emptyVerseRecords=sum(not t for v in chapters.values() for t in v.values())))
    (TARGET / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
