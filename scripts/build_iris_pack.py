"""Build the Iris learning pack from the checked-in UCI snapshot. No network, no model.

Every number a student sees and every answer key is computed here from the frozen file, whose
SHA-256 must match the manifest. The questions and teaching note are original RELAY material; the
dataset authors did not write or endorse them. Output: data/packs/iris/pack.json (+ manifest).
Run: python -m scripts.build_iris_pack   (tests/test_iris_pack.py recomputes and compares)
"""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'data/packs/iris'
SNAPSHOT = PACK / 'bezdekIris.data'
SHA256 = '0fed2a99db77ec533a62dc66894d3ec6df3b58b6a8f3cf4a6b47e4086b7f97dc'
SPECIES = {'Iris-setosa': 'setosa', 'Iris-versicolor': 'versicolor', 'Iris-virginica': 'virginica'}
COLS = ('sepal_length', 'sepal_width', 'petal_length', 'petal_width')


def load():
    raw = SNAPSHOT.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise SystemExit('Snapshot checksum mismatch: refusing to build from an unverified file.')
    rows = []
    for line in raw.decode('ascii').strip().splitlines():
        *nums, label = line.split(',')
        rows.append({**{c: float(v) for c, v in zip(COLS, nums)}, 'species': SPECIES[label]})
    if len(rows) != 150 or any(sum(r['species'] == s for r in rows) != 50 for s in SPECIES.values()):
        raise SystemExit('Unexpected snapshot shape (expected 150 rows, 50 per species).')
    return rows


def pearson(xs, ys):
    n = len(xs); mx = sum(xs) / n; my = sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return sxy / math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))


def stats(rows):
    def sub(s): return [r for r in rows if s is None or r['species'] == s]
    def r_of(a, b, s=None): return round(pearson([r[a] for r in sub(s)], [r[b] for r in sub(s)]), 2)
    def mean(c, s): return round(sum(r[c] for r in sub(s)) / len(sub(s)), 2)
    out = {'n': len(rows),
           'r_petal_all': r_of('petal_length', 'petal_width'),
           'r_sepal_all': r_of('sepal_length', 'sepal_width'),
           'r_sepal_by_species': {s: r_of('sepal_length', 'sepal_width', s) for s in SPECIES.values()},
           'mean_petal_length': {s: mean('petal_length', s) for s in SPECIES.values()}}
    # The claims the keys rely on, checked against the data rather than assumed.
    assert out['r_petal_all'] > 0.9
    assert out['r_sepal_all'] < 0 < min(out['r_sepal_by_species'].values())
    assert out['mean_petal_length']['versicolor'] > out['mean_petal_length']['setosa']
    return out


def concept(st):
    f = lambda x: f'{x:.2f}'.replace('-', '−')
    by = st['r_sepal_by_species']; pl = st['mean_petal_length']
    return {
        'id': 'iris-correlation',
        'title': 'Reading a correlation (Iris data)',
        'source_id': 'uci-iris-53',
        'source_title': 'Iris measurements (UCI) with an original RELAY teaching note',
        'source_text': (
            'Original RELAY teaching note. The correlation coefficient r summarises how closely two measurements '
            'follow a straight-line pattern across the cases in one sample, on a scale from -1 to 1. A value near 1 '
            'means that, in that sample, larger values of one measurement tend to come with larger values of the '
            'other. It does not show that one causes the other, does not mean every case follows the pattern, and is '
            'not the slope. When a sample pools groups that differ in typical size, the pooled r can be very '
            'different from, even opposite in sign to, the r inside each group. '
            f"Data: {st['n']} iris flowers, 50 from each of three species, measured in centimetres. "
            'Fisher, R. A. (1936). Iris [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C56C76. '
            'Licensed CC BY 4.0. Values computed by RELAY from the UCI file bezdekIris.data.'),
        'hint': 'Which claims does r tell you about this sample, and which go beyond it: a cause, every single flower, or a slope? What changes when different species are mixed together?',
        'diagnostic': {
            'id': 'iris-d1',
            'prompt': f"Across all {st['n']} flowers in the Iris data, petal length and petal width have a correlation of r = {f(st['r_petal_all'])}. Which conclusion does this support?",
            'options': {'A': 'Growing a longer petal makes the petal wider.',
                        'B': 'In this sample, flowers with longer petals tend to have wider petals.',
                        'C': 'Every flower with a longer petal also has a wider petal.',
                        'D': f"Petal width is about {f(st['r_petal_all'])} times petal length."},
            'correct': 'B',
            'explanation': f"r = {f(st['r_petal_all'])} describes a strong straight-line tendency in this sample. It is not a cause, does not hold for every flower, and is not a slope.",
            'misconceptions': {'A': 'reading correlation as causation', 'C': 'treating a tendency as a rule for every case', 'D': 'reading r as a slope'}},
        'transfer': {
            'id': 'iris-t1',
            'prompt': (f"Across all {st['n']} flowers, sepal length and sepal width have r = {f(st['r_sepal_all'])}. Within each species on its own, "
                       f"r is positive: {f(by['setosa'])} for setosa, {f(by['versicolor'])} for versicolor and {f(by['virginica'])} for virginica. What best explains this?"),
            'options': {'A': 'Pooling species with different typical sizes hides the positive pattern inside each species.',
                        'B': 'The within-species values must be calculation mistakes.',
                        'C': 'Longer sepals cause narrower sepals.',
                        'D': 'A correlation near zero means the two measurements are unrelated in every group.'},
            'correct': 'A',
            'explanation': 'Each species follows its own positive pattern, but the species differ in typical sepal size, so mixing them flattens and even reverses the pooled r.',
            'misconceptions': {'B': 'distrusting a result instead of checking group structure', 'C': 'reading correlation as causation', 'D': 'assuming a pooled value applies to every subgroup'}},
        'retention': {
            'id': 'iris-r1',
            'prompt': f"In the Iris data, mean petal length is {pl['setosa']:.2f} cm for the 50 setosa flowers and {pl['versicolor']:.2f} cm for the 50 versicolor flowers. Which statement is fair?",
            'options': {'A': 'In this sample, versicolor petals were longer on average than setosa petals.',
                        'B': 'The difference proves versicolor plants grow faster.',
                        'C': 'These 100 flowers describe every iris of these species everywhere.',
                        'D': 'Each versicolor petal is the same length as the versicolor mean.'},
            'correct': 'A',
            'explanation': 'A difference in sample means compares these groups as measured. It says nothing about growth rate, other populations, or individual flowers.',
            'misconceptions': {'B': 'reading a difference in means as a cause', 'C': 'generalising beyond the sample', 'D': 'treating a mean as every value'}},
    }


def build():
    rows = load(); st = stats(rows); c = concept(st)
    manifest = {
        'pack_id': 'iris-correlation', 'version': '2026-10-25.1',
        'review': {'status': 'draft', 'reviewed_by': None, 'reviewed_at': None,
                   'checklist': ['source relevance', 'wording', 'difficulty', 'computations', 'answer keys']},
        'source': {'title': 'Iris', 'creator': 'R. A. Fisher', 'year': 1936, 'publisher': 'UCI Machine Learning Repository',
                   'page': 'https://archive.ics.uci.edu/dataset/53/iris', 'doi': 'https://doi.org/10.24432/C56C76',
                   'download': 'https://archive.ics.uci.edu/static/public/53/iris.zip',
                   'license': 'CC BY 4.0', 'license_url': 'https://creativecommons.org/licenses/by/4.0/',
                   'retrieved_at': '2026-10-25T15:30:12Z',
                   'archive_sha256': 'd11fe30213d36434a0879aab7cb00ce3c812eb7ba2495874438abff7b7b762e9'},
        'snapshot': {'file': 'bezdekIris.data', 'sha256': SHA256, 'rows': 150, 'units': 'centimetres',
                     'why_this_file': 'The archive also ships iris.data, which differs from Fisher (1936) in samples 35 and 38 (see iris.names). bezdekIris.data carries those corrections.',
                     'transformations': ['none to the data', 'species labels shortened (Iris-setosa -> setosa)', 'statistics rounded to 2 decimals for display']},
        'computed': st,
        'authorship': 'Questions, options, explanations and the teaching note are original RELAY material. The dataset authors did not write or endorse them.',
    }
    return c, manifest


def main():
    c, manifest = build()
    (PACK / 'pack.json').write_text(json.dumps(c, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    (PACK / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    print('Built iris-correlation from the verified snapshot. Review status: draft.')


if __name__ == '__main__':
    main()
