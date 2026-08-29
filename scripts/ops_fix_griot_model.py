from pathlib import Path

paths = [
    Path('appsscript/services/GriotService.gs'),
    Path('tests/griot-source-contract.mjs'),
    Path('docs/GRIOT_AI_DISCLOSURE.md'),
]
for path in paths:
    text = path.read_text()
    if 'muse-spark-1.2' not in text:
        raise SystemExit(f'Expected muse-spark-1.2 in {path}')
    path.write_text(text.replace('muse-spark-1.2', 'muse-spark-1.1'))
